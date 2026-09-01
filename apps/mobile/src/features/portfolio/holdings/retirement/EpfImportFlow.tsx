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
  describeNewEmployerSetup,
  applyConfirmedJoinDate,
  applyConfirmedSwitch,
  type EpfImportFile,
  type EpfUnitSelection
} from './epfImportLogic';
import { EpfImportReviewSheet } from './EpfImportReviewSheet';
import { EpfNewEmployerSetupSheet } from './EpfNewEmployerSetupSheet';

/** Render cap for the batch summary's file list (2026-08-30) — this project's own "any `.map()` over
 *  user-imported/bulk data needs a render cap" rule; "Show all" reveals the rest on demand. */
const FILE_LIST_CAP = 15;

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
  const [filesExpanded, setFilesExpanded] = useState(false);
  const [batchId] = useState(() => crypto.randomUUID());
  const [totals, setTotals] = useState({ newCount: 0, matchedCount: 0, conflictCount: 0 });

  // "New employer detected" setup (docs/plans/epf-passbook-import.md's 2026-08-11 follow-up round) —
  // keyed by the unit's own `.key` so a unit whose setup was just answered doesn't ask again once
  // `workingHolding` updates and the review screen for the SAME unit renders. The confirmed join date
  // can't be applied until AFTER `commitUnit` actually creates the employer (it doesn't exist in
  // `workingHolding` yet at setup time), so it's stashed here and applied in `handleUnitConfirm`
  // right after `commitUnit` returns. A confirmed switch's old-employer bound IS applied immediately
  // (that employer already exists) — see the `onConfirm` handler below.
  const [answeredSetupKeys, setAnsweredSetupKeys] = useState<Set<string>>(new Set());
  const [pendingJoinDates, setPendingJoinDates] = useState<Map<string, number>>(new Map());

  const currentUnit = allUnits[unitIndex];
  const currentItems = useMemo(
    () => (currentUnit ? reconcileUnit(currentUnit, workingHolding) : []),
    [currentUnit, workingHolding]
  );
  const pendingSetup = useMemo(
    () =>
      currentUnit?.kind === 'employer' && !answeredSetupKeys.has(currentUnit.key)
        ? describeNewEmployerSetup(currentUnit, workingHolding)
        : null,
    [currentUnit, workingHolding, answeredSetupKeys]
  );

  function handleSetupConfirm(result: { joinDateMs: number; oldEmployerLastDayMs?: number }) {
    if (!currentUnit) return;
    setAnsweredSetupKeys((prev) => new Set(prev).add(currentUnit.key));
    setPendingJoinDates((prev) => new Map(prev).set(currentUnit.key, result.joinDateMs));
    if (pendingSetup?.priorEmployer && result.oldEmployerLastDayMs !== undefined) {
      const oldEmployerId = pendingSetup.priorEmployer.id;
      const lastDayMs = result.oldEmployerLastDayMs;
      setWorkingHolding((h) => applyConfirmedSwitch(h, oldEmployerId, lastDayMs));
    }
  }

  function handleUnitConfirm(selection: EpfUnitSelection) {
    if (!currentUnit) return;
    setTotals((prev) => ({
      newCount:
        prev.newCount + currentItems.filter((i) => i.kind === 'new' && selection.checkedKeys.has(itemKey(i))).length,
      matchedCount: prev.matchedCount + currentItems.filter((i) => i.kind === 'matches').length,
      conflictCount: prev.conflictCount + currentItems.filter((i) => i.kind === 'conflict').length
    }));

    let updated = commitUnit(workingHolding, currentUnit, currentItems, selection, batchId);
    if (currentUnit.kind === 'employer') {
      const joinDateMs = pendingJoinDates.get(currentUnit.key);
      if (joinDateMs !== undefined) updated = applyConfirmedJoinDate(updated, currentUnit, joinDateMs);
    }
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
    // Render cap (this project's own "any .map() over user-imported/bulk data needs a render cap"
    // rule) + the real reported bug: with no `scrollable`/footer split, a batch large enough to
    // overflow the screen left the confirm button completely unreachable — found with a real 20-file
    // batch. `scrollable` + `footer` keeps the action button fixed and reachable regardless of list
    // length; the cap keeps the list itself cheap to render even for a much larger real batch.
    const visibleFiles = filesExpanded ? files : files.slice(0, FILE_LIST_CAP);
    return (
      <Modal
        onClose={onClose}
        title="Import passbooks"
        scrollable
        footer={
          readyFiles.length > 0 ? (
            <Button variant="primary" fullWidth onPress={() => setStep('review')}>
              Review {readyFiles.length} statement{readyFiles.length === 1 ? '' : 's'}
            </Button>
          ) : (
            <Button variant="secondary" fullWidth onPress={onClose}>
              Close
            </Button>
          )
        }
      >
        <View className="-mt-2 gap-2">
          <Text className="text-xs text-secondary">
            {files.length} file{files.length === 1 ? '' : 's'} selected
          </Text>

          {visibleFiles.map((f) => {
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

          {!filesExpanded && files.length > FILE_LIST_CAP && (
            <Button variant="ghost" size="sm" fullWidth onPress={() => setFilesExpanded(true)}>
              Show all {files.length} files
            </Button>
          )}

          <Text className="text-[10px] text-tertiary mt-1">
            {readyFiles.length} of {files.length} ready
            {duplicateCount + unreadableCount > 0 && ` · ${duplicateCount + unreadableCount} will be skipped`}
          </Text>
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
    if (pendingSetup) {
      // `key` forces a fresh mount per unit — without it, React reuses the SAME component instance
      // across units (same JSX position), so its internal `useState` lazy initializers (which only
      // ever run once) would keep showing the FIRST unit's dates for every later "new employer
      // detected" unit in the same multi-file batch. Real bug class, same fix as the review sheet
      // below.
      return (
        <EpfNewEmployerSetupSheet
          key={currentUnit.key}
          setup={pendingSetup}
          onConfirm={handleSetupConfirm}
          onClose={onClose}
        />
      );
    }
    const isLast = unitIndex === allUnits.length - 1;
    return (
      <EpfImportReviewSheet
        // `key` forces a fresh mount per unit — without it, React reuses the SAME component instance
        // as `unitIndex` advances (same JSX position each render), so its internal `uncheckedKeys`/
        // `conflictChoices` state PERSISTED across units. Harmless for contribution items (keyed by
        // their own distinct wagesMonth), but `itemKey()` returns just the bare type string
        // ("interest"/"transfer_in"/...) for non-wagesMonth items — a real reported bug: a conflict
        // choice made for FY1's "interest" item was silently still in effect when FY2's own
        // "interest" item rendered in the reused instance, and could leave it unchecked/wrongly
        // resolved without the user ever touching FY2's own screen.
        key={currentUnit.key}
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
