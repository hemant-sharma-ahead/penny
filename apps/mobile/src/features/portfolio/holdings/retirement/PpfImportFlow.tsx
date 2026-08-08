// PPF statement import flow — pick file → mapping confirm → review → (conditional) missing-details
// gate → done (mockup §§1-3). Simpler than EPF's own import flow (`EpfImportFlow.tsx`): a PPF
// bank/post-office statement is always ONE continuous ledger for one account, so there's no
// multi-file/unit queue — just a straight line through these steps for the single picked file. The
// reconciliation review UI lives in `PpfImportReviewSheet.tsx`; every parse/reconcile/commit helper
// lives in `ppfImportLogic.ts` (kept out of this file so it can stay Fast-Refresh-clean, exporting
// only components).
//
// The flow OWNS picking the file itself (a "pick" step shown first, this file's own screen) rather
// than the file being picked by the caller before this component even mounts — mirrors bank-import's
// `SetupStep.tsx` exactly: a Penny screen appears FIRST, with an explicit "Upload statement" action,
// and the native OS file picker only fires when that's tapped, never the instant the card's "Import"
// pill is pressed. (An earlier version had the caller pick the file upfront, which meant tapping
// "Import" jumped straight to the OS file picker with no Penny screen in between at all — the wrong
// order, caught via direct user feedback after it shipped.)
import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Modal, Button, Banner, SelectInput, TextInput } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { formatDate } from '@/lib/date';
import { epochToDateInput } from '@/lib/formatters';
import type { Holding } from '@/core/db/types';
import { getPpfRateTable, type PpfRateTable } from '@/core/portfolio/ppfInterestRates';
import {
  pickAndParsePpfFile,
  guessInitialPpfMapping,
  detectPpfDateFormat,
  ppfMappingReady,
  buildPpfColumnMapping,
  reconcilePpfImport,
  ppfMissingDetailsNeed,
  suggestedPpfOpeningDate,
  commitPpfImport,
  type PickedPpfFile,
  type PpfMappingDraft,
  type PpfImportSelection,
  type PpfMissingDetailsInput
} from './ppfImportLogic';
import { PpfImportReviewSheet } from './PpfImportReviewSheet';
import { PpfFields } from './PpfFields';

interface PpfImportFlowProps {
  /** `null` when there's no PPF holding yet — the untracked "Track PPF" CTA's "or import
   *  statement" shortcut creates a brand-new holding from the import instead of extending an
   *  existing one. */
  holding: Holding | null;
  onSave: (holding: Holding) => Promise<void>;
  onClose: () => void;
}

const NONE = '';

function headerOptions(headers: string[]) {
  return [
    { value: NONE, label: '— Not mapped —' },
    ...headers.map((h) => ({ value: h, label: h || '(blank header)' }))
  ];
}

type Step = 'pick' | 'mapping' | 'review' | 'missingDetails' | 'done';

export function PpfImportFlow({ holding, onSave, onClose }: PpfImportFlowProps) {
  const theme = useThemeColors();
  const [step, setStep] = useState<Step>('pick');
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [file, setFile] = useState<PickedPpfFile | null>(null);
  const [mapping, setMapping] = useState<PpfMappingDraft | null>(null);
  const [rateTable, setRateTable] = useState<PpfRateTable | null>(null);
  const [saving, setSaving] = useState(false);
  const [batchId] = useState(() => crypto.randomUUID());
  const [pendingSelection, setPendingSelection] = useState<PpfImportSelection | null>(null);
  const [savedHolding, setSavedHolding] = useState<Holding | null>(null);

  async function handlePickFile() {
    setPicking(true);
    setPickError(null);
    try {
      const result = await pickAndParsePpfFile();
      if (result.status === 'picked') {
        setFile(result);
        setMapping(guessInitialPpfMapping(result.headers));
        setStep('mapping');
      } else if (result.status === 'error') {
        setPickError(result.message);
      }
      // 'canceled' — stay on this step silently, exactly like bank-import's own file picker cancel.
    } finally {
      setPicking(false);
    }
  }

  const need = useMemo(() => ppfMissingDetailsNeed(holding), [holding]);
  const [missingName, setMissingName] = useState(holding?.name ?? 'PPF');
  const [missingOpeningDate, setMissingOpeningDate] = useState(
    holding?.assetMeta?.ppfOpeningDate != null ? epochToDateInput(holding.assetMeta.ppfOpeningDate) : ''
  );
  const [missingBank, setMissingBank] = useState(holding?.assetMeta?.ppfBank ?? '');
  const [missingAnnual, setMissingAnnual] = useState(
    holding?.assetMeta?.annualContribution != null ? String(holding.assetMeta.annualContribution) : ''
  );

  useEffect(() => {
    getPpfRateTable()
      .then(setRateTable)
      .catch(() => setRateTable(null));
  }, []);

  // Re-detect the date format whenever the date column changes — same smart-detection
  // `useBankImport.ts` runs, seeded once per column choice; the user can still free-edit it
  // afterward without it being clobbered until they change the date column again. No-ops until a
  // file's actually been picked (`file`/`mapping` are null on the initial 'pick' step).
  useEffect(() => {
    if (!file || !mapping) return;
    const detected = detectPpfDateFormat(file.grid, file.headers, mapping.date);
    // Can't be a useMemo instead — the user must still be able to free-edit the result afterward
    // without a later render clobbering their edit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMapping((prev) => (prev ? { ...prev, dateFormat: detected.format } : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-detect on date column change
  }, [mapping?.date, file]);

  const mappingReady = mapping ? ppfMappingReady(mapping) : false;
  const columnMapping = useMemo(() => (mapping ? buildPpfColumnMapping(mapping) : null), [mapping]);
  const mappingPreview = useMemo(() => {
    if (!mappingReady || !file || !columnMapping) return null;
    return reconcilePpfImport(file.grid, columnMapping, holding, rateTable);
  }, [mappingReady, file, columnMapping, holding, rateTable]);

  const rows = mappingPreview?.rows ?? [];
  const minDate = rows.length > 0 ? Math.min(...rows.map((r) => r.date)) : null;
  const maxDate = rows.length > 0 ? Math.max(...rows.map((r) => r.date)) : null;

  // Pre-fill the suggested opening date (from the earliest imported row) once rows are available —
  // never overrides a value the user already typed.
  useEffect(() => {
    if (!need.needsOpeningDate || missingOpeningDate || rows.length === 0) return;
    const suggested = suggestedPpfOpeningDate(rows);
    // Seed once rows arrive, don't fight user edits — same rationale as the effect above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (suggested != null) setMissingOpeningDate(epochToDateInput(suggested));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once, see comment above
  }, [rows, need.needsOpeningDate]);

  function setMappingField(field: keyof Omit<PpfMappingDraft, 'dateFormat'>, value: string) {
    setMapping((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function doCommit(selection: PpfImportSelection, missingDetails: PpfMissingDetailsInput | null) {
    if (!mappingPreview) return;
    setSaving(true);
    try {
      const updated = commitPpfImport(holding, mappingPreview.items, selection, missingDetails, batchId);
      await onSave(updated);
      setSavedHolding(updated);
      setStep('done');
    } catch {
      // Leave the current step showing so the user can retry.
    } finally {
      setSaving(false);
    }
  }

  function handleReviewConfirm(selection: PpfImportSelection) {
    setPendingSelection(selection);
    if (need.needsName || need.needsOpeningDate) {
      setStep('missingDetails');
      return;
    }
    void doCommit(selection, null);
  }

  function handleMissingDetailsConfirm() {
    if (!pendingSelection) return;
    void doCommit(pendingSelection, {
      name: missingName,
      ppfOpeningDate: missingOpeningDate,
      ppfBank: missingBank,
      ppfAnnual: missingAnnual
    });
  }

  if (step === 'pick') {
    return (
      <Modal onClose={onClose} title="Import PPF statement" scrollable>
        <Text className="-mt-2 text-xs text-tertiary leading-relaxed">
          Upload a CSV or Excel export of your PPF passbook/statement from your bank or post office. Penny will ask you
          to confirm which columns are which before importing anything.
        </Text>
        <Pressable
          onPress={() => void handlePickFile()}
          disabled={picking}
          className="bg-surface rounded-xl p-8 items-center gap-3 border-2 border-dashed border-theme"
        >
          <Icon name="ti-file-upload" size={30} color={theme.textTertiary} />
          <Text className="text-sm text-secondary text-center">
            {picking ? 'Reading file…' : 'Tap to choose a CSV or Excel file'}
          </Text>
        </Pressable>
        {pickError && (
          <Banner variant="warning" icon="ti-alert-triangle" title="Couldn't read this file">
            {pickError}
          </Banner>
        )}
      </Modal>
    );
  }

  if (step === 'mapping') {
    if (!file || !mapping) return null; // unreachable in practice — 'mapping' only follows a successful pick
    const dateFormatDetected = detectPpfDateFormat(file.grid, file.headers, mapping.date);
    const fields: { key: 'date' | 'narration' | 'debit' | 'credit' | 'balance'; label: string }[] = [
      { key: 'date', label: 'Date' },
      { key: 'narration', label: 'Narration' },
      { key: 'debit', label: 'Withdrawal / debit' },
      { key: 'credit', label: 'Deposit / credit' },
      { key: 'balance', label: 'Balance (optional)' }
    ];
    const options = headerOptions(file.headers);
    return (
      <Modal
        onClose={onClose}
        title="Import PPF statement"
        scrollable
        footer={
          <Button
            variant="primary"
            fullWidth
            disabled={!mappingReady || (mappingPreview?.rows.length ?? 0) === 0}
            onPress={() => setStep('review')}
          >
            Continue to review
          </Button>
        }
      >
        <Text className="-mt-2 text-xs text-secondary" numberOfLines={1}>
          {file.fileName}
        </Text>
        <Text className="text-xs text-tertiary -mt-2">
          Confirm which columns are which — Penny took a best guess below, but a statement's layout varies by bank/post
          office.
        </Text>

        <View className="gap-3">
          {fields.map(({ key, label }) => (
            <SelectInput
              key={key}
              label={label}
              value={mapping[key]}
              onChange={(v) => setMappingField(key, v)}
              options={options}
            />
          ))}
          <TextInput
            label="Date format"
            value={mapping.dateFormat}
            onChange={(v) => setMapping((prev) => (prev ? { ...prev, dateFormat: v } : prev))}
            placeholder="e.g. DD/MM/YYYY"
            hint="DD, MM, YYYY, YY, or MMM"
          />
          <Text
            className="text-[10px] -mt-2"
            style={{ color: dateFormatDetected.confident ? theme.textTertiary : theme.warning }}
          >
            {dateFormatDetected.confident
              ? 'Detected from the file — change it if this looks wrong.'
              : "Couldn't tell for sure from this file — please confirm the date format."}
          </Text>
        </View>

        {mappingPreview &&
          (mappingPreview.rows.length > 0 ? (
            <Banner
              variant="info"
              icon="ti-table"
              title={`${mappingPreview.rows.length} row${mappingPreview.rows.length === 1 ? '' : 's'} detected${
                minDate !== null && maxDate !== null ? ` · ${formatDate(minDate)}–${formatDate(maxDate)}` : ''
              }`}
            >
              {mappingPreview.rejectedCount > 0
                ? `${mappingPreview.rejectedCount} row${mappingPreview.rejectedCount === 1 ? '' : 's'} couldn't be read.`
                : 'Every row in the file parsed cleanly.'}
            </Banner>
          ) : (
            <Banner variant="warning" icon="ti-alert-triangle" title="No rows could be read from this file">
              Double-check the column mapping above, especially the date format ({mapping.dateFormat}) — it should match
              how dates actually look in your file.
            </Banner>
          ))}
      </Modal>
    );
  }

  if (step === 'review') {
    if (!mappingPreview) return null;
    return (
      <PpfImportReviewSheet
        title={`${holding?.name ?? 'PPF'}${minDate !== null && maxDate !== null ? ` · ${formatDate(minDate)}–${formatDate(maxDate)}` : ''}`}
        items={mappingPreview.items}
        rejectedCount={mappingPreview.rejectedCount}
        confirmLabel={`Import ${mappingPreview.items.length} transaction${mappingPreview.items.length === 1 ? '' : 's'}`}
        saving={saving}
        onConfirm={handleReviewConfirm}
        onClose={onClose}
      />
    );
  }

  if (step === 'missingDetails') {
    const itemCount = mappingPreview?.items.length ?? 0;
    const canContinue =
      (!need.needsName || missingName.trim().length > 0) && (!need.needsOpeningDate || !!missingOpeningDate);
    return (
      <Modal
        onClose={onClose}
        title="A few more details"
        scrollable
        footer={
          <Button
            variant="primary"
            fullWidth
            disabled={!canContinue}
            loading={saving}
            onPress={handleMissingDetailsConfirm}
          >
            {`Continue → Import ${itemCount} transaction${itemCount === 1 ? '' : 's'}`}
          </Button>
        }
      >
        <View
          className="-mt-2 rounded-xl p-2.5 border flex-row gap-2"
          style={{ borderColor: theme.border, backgroundColor: theme.surfaceSecondary }}
        >
          <Icon name="ti-info-circle" size={15} color="#8b5cf6" />
          <Text className="text-[10.5px] text-secondary flex-1 leading-relaxed">
            Your statement doesn't include these — Penny needs them to track maturity and yearly limits.
          </Text>
        </View>

        {need.needsName && (
          <TextInput
            label="Name"
            placeholder="e.g. PPF Account"
            value={missingName}
            onChange={setMissingName}
            autoFocus
          />
        )}

        <PpfFields
          ppfOpeningDate={missingOpeningDate}
          setPpfOpeningDate={setMissingOpeningDate}
          ppfAnnual={missingAnnual}
          setPpfAnnual={setMissingAnnual}
          ppfBank={missingBank}
          setPpfBank={setMissingBank}
        />
      </Modal>
    );
  }

  // step === 'done'
  const summary = savedHolding?.assetMeta?.ppfTransactions ?? [];
  return (
    <Modal onClose={onClose} title="Import complete">
      <View className="items-center pt-1 gap-1.5">
        <Icon name="ti-circle-check" size={36} color={theme.success} />
        <Text className="text-sm font-extrabold text-primary mt-1">Statement imported</Text>
        <Text className="text-xs text-secondary text-center">
          {summary.length} transaction{summary.length === 1 ? '' : 's'} now on record for this account.
        </Text>
      </View>
      <Button variant="primary" fullWidth onPress={onClose}>
        Done
      </Button>
    </Modal>
  );
}
