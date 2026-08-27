import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput as RNTextInput } from 'react-native';
import { Modal, Button, OptionButton } from '~/components/ui';
import { PersonTypeahead, WizardProgress, IOU_EXPENSE_CHOICES, IOU_INCOME_CHOICES } from '~/components/shared';
import type { IouCategoryChoice } from '~/components/shared';
import type { ExpenseCategory, Person } from '@/core/db/types';
import { useThemeColors } from '~/theme/useThemeColors';

// Choice data (label/icon/subtitle per category) now lives in `~/components/shared/iouCategoryChoices.ts`
// — shared with `EntryForm.tsx`'s "Add IOU" popup (2026-08-26) so both surfaces show the same four
// categories the same way instead of drifting independently. Kept as local aliases here purely to avoid
// touching every reference below.
const EXPENSE_CHOICES = IOU_EXPENSE_CHOICES;
const INCOME_CHOICES = IOU_INCOME_CHOICES;
type DirectionChoice = IouCategoryChoice;

interface Props {
  categories: ExpenseCategory[];
  persons: Person[];
  /** Counts of expense-/income-type transactions within the current bulk selection — a question step
   *  only appears for a direction with a non-zero count here (Transfer-type rows in the selection are
   *  excluded from both; they have no IOU direction). */
  expenseCount: number;
  incomeCount: number;
  onApply: (personName: string, categoryByType: { expense?: string; income?: string }) => Promise<void>;
  onClose: () => void;
}

type Step = 'person' | 'expense' | 'income';

/**
 * Guided bulk-add-to-IOU flow (item 11, 2026-08-18 real-device testing pass) — assigns a whole
 * multi-select batch of existing transactions to one person's ledger. Pick one person for the batch,
 * then one category choice per direction actually present in the selection (skipped entirely for a
 * direction with zero selected rows), then a plain-language confirm summary before applying. See
 * `docs/mockups/proposals/iou-quick-fixes-v1.html` §4 — reuses `WizardProgress` (moved to
 * `components/shared/` from `features/import/` so this feature module could reuse it) for the step
 * chrome and `PersonTypeahead` (item 12) for the person step, rather than inventing either.
 */
export function BulkAddToIouModal({ categories, persons, expenseCount, incomeCount, onApply, onClose }: Props) {
  const theme = useThemeColors();
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const questionSteps = useMemo<Step[]>(() => {
    const steps: Step[] = ['person'];
    if (expenseCount > 0) steps.push('expense');
    if (incomeCount > 0) steps.push('income');
    return steps;
  }, [expenseCount, incomeCount]);

  const [stepIdx, setStepIdx] = useState(0);
  const [personName, setPersonName] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState<string | undefined>();
  const [incomeCategoryId, setIncomeCategoryId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const personInputRef = useRef<RNTextInput>(null);

  const onConfirmStep = stepIdx >= questionSteps.length;
  const currentStep: Step | 'confirm' = onConfirmStep ? 'confirm' : (questionSteps[stepIdx] as Step);
  const totalCount = expenseCount + incomeCount;
  const trimmedName = personName.trim();

  const canAdvance =
    currentStep === 'person'
      ? trimmedName.length > 0
      : currentStep === 'expense'
        ? !!expenseCategoryId
        : currentStep === 'income'
          ? !!incomeCategoryId
          : true;

  function goNext() {
    if (!canAdvance) return;
    setStepIdx((i) => i + 1);
  }

  function goBack() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  async function handleApply() {
    setBusy(true);
    try {
      await onApply(trimmedName, {
        ...(expenseCategoryId ? { expense: expenseCategoryId } : {}),
        ...(incomeCategoryId ? { income: incomeCategoryId } : {})
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  function renderChoices(choices: DirectionChoice[], value: string | undefined, onPick: (id: string) => void) {
    return (
      <View className="gap-2">
        {choices.map((c) => {
          const cat = categoryById.get(c.categoryId);
          return (
            <OptionButton
              key={c.categoryId}
              label={cat?.name ?? c.fallbackLabel}
              icon={cat?.icon ?? c.fallbackIcon}
              description={c.subtitle(trimmedName || 'them')}
              selected={value === c.categoryId}
              color={cat?.color}
              onPress={() => onPick(c.categoryId)}
            />
          );
        })}
      </View>
    );
  }

  return (
    <Modal
      onClose={onClose}
      title="Add to IOU ledger"
      onShow={() => {
        if (currentStep === 'person') personInputRef.current?.focus();
      }}
      footer={
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button variant="secondary" fullWidth disabled={busy} onPress={stepIdx === 0 ? onClose : goBack}>
              {stepIdx === 0 ? 'Cancel' : 'Back'}
            </Button>
          </View>
          <View className="flex-1">
            {currentStep === 'confirm' ? (
              <Button fullWidth loading={busy} onPress={() => void handleApply()}>
                Apply
              </Button>
            ) : (
              <Button fullWidth disabled={!canAdvance} onPress={goNext}>
                Next
              </Button>
            )}
          </View>
        </View>
      }
    >
      {currentStep !== 'confirm' && (
        <WizardProgress
          stepIndex={stepIdx}
          totalSteps={questionSteps.length}
          stepLabel={
            currentStep === 'person'
              ? 'Person'
              : currentStep === 'expense'
                ? `${expenseCount} expense-type transaction${expenseCount === 1 ? '' : 's'}`
                : `${incomeCount} income-type transaction${incomeCount === 1 ? '' : 's'}`
          }
        />
      )}

      {currentStep === 'person' && (
        <View className="gap-2">
          <Text className="text-xs font-medium text-secondary">
            Add {totalCount} transaction{totalCount === 1 ? '' : 's'} to
          </Text>
          <PersonTypeahead
            ref={personInputRef}
            persons={persons}
            query={personName}
            onQueryChange={setPersonName}
            onSelect={(p) => setPersonName(p.name)}
            placeholder="Type a name…"
          />
          <Text className="text-xs text-tertiary">One person for the whole batch — no per-row picker.</Text>
        </View>
      )}

      {currentStep === 'expense' && (
        <View className="gap-2">
          <Text className="text-sm text-secondary">Lending or returning money you&apos;d borrowed?</Text>
          {renderChoices(EXPENSE_CHOICES, expenseCategoryId, setExpenseCategoryId)}
        </View>
      )}

      {currentStep === 'income' && (
        <View className="gap-2">
          <Text className="text-sm text-secondary">Borrowed money or collecting a debt?</Text>
          {renderChoices(INCOME_CHOICES, incomeCategoryId, setIncomeCategoryId)}
        </View>
      )}

      {currentStep === 'confirm' && (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-primary">Ready to apply</Text>
          <View className="rounded-xl border border-theme bg-surface-2 p-3 gap-1">
            <Text className="text-sm text-primary">
              {totalCount} transaction{totalCount === 1 ? '' : 's'} →{' '}
              <Text style={{ fontWeight: '700', color: theme.primary }}>{trimmedName}</Text>
            </Text>
            {expenseCategoryId && (
              <Text className="text-sm text-secondary">
                · {expenseCount} as{' '}
                <Text style={{ fontWeight: '700', color: theme.primary }}>
                  {categoryById.get(expenseCategoryId)?.name ??
                    EXPENSE_CHOICES.find((c) => c.categoryId === expenseCategoryId)?.fallbackLabel}
                </Text>
              </Text>
            )}
            {incomeCategoryId && (
              <Text className="text-sm text-secondary">
                · {incomeCount} as{' '}
                <Text style={{ fontWeight: '700', color: theme.primary }}>
                  {categoryById.get(incomeCategoryId)?.name ??
                    INCOME_CHOICES.find((c) => c.categoryId === incomeCategoryId)?.fallbackLabel}
                </Text>
              </Text>
            )}
          </View>
          <Text className="text-xs text-tertiary">
            Creates one ledger entry per transaction, linked back to it — same linking as a single transaction&apos;s
            own Lent/Borrowed panel.
          </Text>
        </View>
      )}
    </Modal>
  );
}
