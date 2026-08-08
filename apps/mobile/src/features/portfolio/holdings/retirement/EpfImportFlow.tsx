// EPF passbook/Excel import flow — batch summary → sequential review → done (doc §10.4, mockup v4 §5).
// The reconciliation review UI (Direction C) lives in `EpfImportReviewSheet.tsx`; the file
// picking/parsing and every write to the `Holding` lives in `epfImportLogic.ts` (kept out of this file
// so it can stay Fast-Refresh-clean, exporting only components).
import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint } from '~/lib/color';
import type { Holding } from '@/core/db/types';
import {
  reconcileUnit,
  commitUnit,
  createEmptyEpfHolding,
  unitTitle,
  describeFile,
  itemKey,
  type EpfImportFile,
  type EpfUnitSelection
} from './epfImportLogic';
import { EpfImportReviewSheet } from './EpfImportReviewSheet';

interface EpfImportFlowProps {
  /** `null` when there's no EPF holding yet — the untracked "Track EPF" CTA's "or import passbook PDF"
   *  path (doc §10.1) creates a brand-new holding from the import instead of extending an existing one. */
  holding: Holding | null;
  files: EpfImportFile[];
  onSave: (holding: Holding) => Promise<void>;
  onClose: () => void;
}

export function EpfImportFlow({ holding, files, onSave, onClose }: EpfImportFlowProps) {
  const theme = useThemeColors();
  const readyFiles = useMemo(() => files.filter((f) => f.status === 'ready'), [files]);
  const duplicateCount = files.filter((f) => f.status === 'duplicate').length;
  const unreadableCount = files.filter((f) => f.status === 'unreadable').length;
  const allUnits = useMemo(() => readyFiles.flatMap((f) => f.units), [readyFiles]);

  const [step, setStep] = useState<'summary' | 'review' | 'done'>(
    files.length === 1 && files[0]?.status === 'ready' ? 'review' : 'summary'
  );
  const [unitIndex, setUnitIndex] = useState(0);
  const [workingHolding, setWorkingHolding] = useState<Holding>(() => {
    const base = holding ?? createEmptyEpfHolding();
    if (holding) return base;
    const withAccountInfo = readyFiles.find((f) => f.uan || f.epfBirthYear);
    if (!withAccountInfo) return base;
    return {
      ...base,
      assetMeta: { ...base.assetMeta, uan: withAccountInfo.uan, epfBirthYear: withAccountInfo.epfBirthYear }
    };
  });
  const [saving, setSaving] = useState(false);
  const [batchId] = useState(() => crypto.randomUUID());
  const [totals, setTotals] = useState({ newCount: 0, matchedCount: 0, conflictCount: 0 });

  const currentUnit = allUnits[unitIndex];
  const currentItems = useMemo(
    () => (currentUnit ? reconcileUnit(currentUnit, workingHolding) : []),
    [currentUnit, workingHolding]
  );

  function handleUnitConfirm(selection: EpfUnitSelection) {
    if (!currentUnit) return;
    setTotals((prev) => ({
      newCount:
        prev.newCount + currentItems.filter((i) => i.kind === 'new' && selection.checkedKeys.has(itemKey(i))).length,
      matchedCount: prev.matchedCount + currentItems.filter((i) => i.kind === 'matches').length,
      conflictCount: prev.conflictCount + currentItems.filter((i) => i.kind === 'conflict').length
    }));

    const updated = commitUnit(workingHolding, currentUnit, currentItems, selection, batchId);
    setWorkingHolding(updated);

    if (unitIndex + 1 < allUnits.length) {
      setUnitIndex((i) => i + 1);
      return;
    }
    setSaving(true);
    onSave(updated)
      .then(() => setStep('done'))
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  if (step === 'summary') {
    return (
      <Modal onClose={onClose} title="Import passbooks">
        <View className="-mt-2 gap-2">
          <Text className="text-xs text-secondary">
            {files.length} file{files.length === 1 ? '' : 's'} selected
          </Text>

          {files.map((f) => {
            const skipped = f.status !== 'ready';
            const badgeColor =
              f.status === 'ready' ? theme.success : f.status === 'duplicate' ? theme.warning : theme.danger;
            const badgeLabel = f.status === 'ready' ? 'Ready' : 'Skip';
            return (
              <View
                key={f.id}
                className="flex-row items-center justify-between gap-2 rounded-xl px-3 py-2 border"
                style={{
                  backgroundColor: skipped ? tint(badgeColor, 10) : theme.surfaceSecondary,
                  borderColor: skipped ? tint(badgeColor, 35) : theme.border
                }}
              >
                <View className="flex-1">
                  <Text className="text-xs font-semibold text-primary" numberOfLines={1}>
                    {f.fileName}
                  </Text>
                  <Text
                    className="text-[10px] mt-0.5"
                    style={{ color: skipped ? badgeColor : theme.textTertiary }}
                    numberOfLines={2}
                  >
                    {describeFile(f)}
                  </Text>
                </View>
                <Text
                  className="text-[8px] font-extrabold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: tint(badgeColor, 15), color: badgeColor }}
                >
                  {badgeLabel}
                </Text>
              </View>
            );
          })}

          <Text className="text-[10px] text-tertiary mt-1">
            {readyFiles.length} of {files.length} ready
            {duplicateCount + unreadableCount > 0 && ` · ${duplicateCount + unreadableCount} will be skipped`}
          </Text>

          {readyFiles.length > 0 ? (
            <Button variant="primary" fullWidth onPress={() => setStep('review')} className="mt-1">
              Review {readyFiles.length} statement{readyFiles.length === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button variant="secondary" fullWidth onPress={onClose} className="mt-1">
              Close
            </Button>
          )}
        </View>
      </Modal>
    );
  }

  if (step === 'review') {
    if (!currentUnit) {
      // No units at all despite ready files (shouldn't happen — a ready file always has ≥1 unit) —
      // fail safe rather than render a broken review screen.
      return (
        <Modal onClose={onClose} title="Import passbooks">
          <Text className="text-sm text-secondary">Nothing to review.</Text>
          <Button variant="primary" fullWidth onPress={onClose}>
            Close
          </Button>
        </Modal>
      );
    }
    const isLast = unitIndex === allUnits.length - 1;
    return (
      <EpfImportReviewSheet
        title={unitTitle(currentUnit)}
        fileChip={allUnits.length > 1 ? `File ${unitIndex + 1} of ${allUnits.length}` : undefined}
        items={currentItems}
        rows={currentUnit.kind === 'employer' ? currentUnit.rows : []}
        confirmLabel={
          isLast
            ? `Import ${currentItems.length} transaction${currentItems.length === 1 ? '' : 's'}`
            : `Import & continue to File ${unitIndex + 2} of ${allUnits.length}`
        }
        saving={saving}
        onConfirm={handleUnitConfirm}
        onClose={onClose}
      />
    );
  }

  // step === 'done'
  const { newCount, matchedCount, conflictCount } = totals;
  const skippedParts: string[] = [];
  if (duplicateCount > 0) skippedParts.push(`${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`);
  if (unreadableCount > 0) skippedParts.push('unreadable file(s) excluded');

  return (
    <Modal onClose={onClose} title="Import complete">
      <View className="items-center pt-1 gap-1.5">
        <Icon name="ti-circle-check" size={36} color={theme.success} />
        <Text className="text-sm font-extrabold text-primary mt-1">
          {readyFiles.length} statement{readyFiles.length === 1 ? '' : 's'} imported
        </Text>
        <Text className="text-xs text-secondary text-center">
          {newCount} new · {matchedCount} matched · {conflictCount} conflict{conflictCount === 1 ? '' : 's'} resolved
        </Text>
        {skippedParts.length > 0 && (
          <Text className="text-[10px] text-center" style={{ color: theme.warning }}>
            {files.length - readyFiles.length} file{files.length - readyFiles.length === 1 ? '' : 's'} skipped —{' '}
            {skippedParts.join(', ')}
          </Text>
        )}
      </View>
      <Button variant="primary" fullWidth onPress={onClose}>
        Done
      </Button>
    </Modal>
  );
}
