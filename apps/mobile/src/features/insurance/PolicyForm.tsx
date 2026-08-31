import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '~/context/ToastContext';
import type {
  DiscountType,
  Expense,
  InsurancePolicy,
  InsuranceType,
  PremiumFrequency,
  PremiumPaymentTerm
} from '@/core/db/types';
import { epochToDateInput, formatCurrency, parseNumber } from '@/lib/formatters';
import { addMonths, installmentAmount, firstNextDueDate, isPaidUp } from '@/core/insurance/premiumSchedule';
import { insurerCategoryForType, insurersForCategory } from '@/core/insurance/insurers';
import {
  TextInput,
  OptionButton,
  AmountInput,
  DateInput,
  SegmentedControl,
  Toggle,
  ConfirmDialog,
  Banner
} from '~/components/ui';
import { FormModal } from '~/components/shared';
import { InsurerField } from './InsurerField';
import { Chip } from './Chip';
import { TermLifeFields } from './fields/TermLifeFields';
import { HealthFields } from './fields/HealthFields';
import { VehicleInsuranceFields } from './fields/VehicleInsuranceFields';
import { TravelFields } from './fields/TravelFields';
import type { MarkPaidChoice } from '~/hooks/useInsurancePremiumActions';
import type { useInsurance } from './useInsurance';

interface Props {
  editing: InsurancePolicy | null;
  onSave: (policy: InsurancePolicy) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  insurerMemories: ReturnType<typeof useInsurance>['insurerMemories'];
  rememberInsurer: ReturnType<typeof useInsurance>['rememberInsurer'];
  markAsPaid: ReturnType<typeof useInsurance>['markAsPaid'];
  unmarkPayment: ReturnType<typeof useInsurance>['unmarkPayment'];
  candidateExpenses: ReturnType<typeof useInsurance>['candidateExpenses'];
}

const POLICY_TYPES: { value: InsuranceType; label: string; icon: string; color: string }[] = [
  { value: 'term', label: 'Term', icon: 'ti-umbrella', color: '#ef4444' },
  { value: 'life', label: 'Life / ULIP', icon: 'ti-heart', color: '#8b5cf6' },
  { value: 'health', label: 'Health', icon: 'ti-heart-rate-monitor', color: '#10b981' },
  { value: 'vehicle', label: 'Vehicle', icon: 'ti-car', color: '#f59e0b' },
  { value: 'home', label: 'Home', icon: 'ti-home', color: '#6366f1' },
  { value: 'travel', label: 'Travel', icon: 'ti-plane', color: '#0ea5e9' },
  { value: 'other', label: 'Other', icon: 'ti-shield', color: '#6b7280' }
];

// Full words, not single letters — these render as a full-row pill group now (2026-08-31 relayout),
// with room to spare, unlike the segmented control they replaced.
const FREQ_OPTIONS: { value: PremiumFrequency; label: string }[] = [
  { value: 'M', label: 'Monthly' },
  { value: 'Q', label: 'Quarterly' },
  { value: 'H', label: 'Half-yearly' },
  { value: 'A', label: 'Annual' },
  { value: 'S', label: 'Single' }
];

const FREQ_LABEL: Record<PremiumFrequency, string> = {
  M: 'month',
  Q: 'quarter',
  H: 'half-year',
  A: 'year',
  S: 'one-time'
};

const CATEGORY_LABEL = { life: 'life insurers', health: 'health insurers', general: 'general insurers' } as const;

/** Duration presets per type — whole-year chips, plus age-based chips (Term/Life only, read from the
 *  user's saved profile DOB) and day-based chips (Travel only). Mirrors insurance-redesign-v4.html §②'s
 *  per-type `.duration-presets` chip rows. */
const YEAR_PRESETS: Partial<Record<InsuranceType, number[]>> = {
  term: [5, 10, 15, 20],
  life: [10, 15, 20],
  health: [1, 2, 3],
  vehicle: [1, 2, 3, 5],
  home: [1, 5, 10],
  other: [1, 3, 5]
};
const AGE_PRESETS: Partial<Record<InsuranceType, number[]>> = {
  term: [60, 65],
  life: [70, 99]
};
const DAY_PRESETS: Partial<Record<InsuranceType, number[]>> = {
  travel: [7, 14, 30]
};

/** Quick round-number presets for each type's primary coverage figure (2026-08-31 relayout) — hand-
 *  picked realistic values per category rather than a generic formula, e.g. Term/Life sums assured are
 *  routinely quoted in whole crores while a Vehicle's IDV rarely exceeds a few lakh. Labels are literal,
 *  not derived from `formatCompact` (which would print "50.0L" for a round 50L figure). */
const COVERAGE_PRESETS: Partial<Record<InsuranceType, { amount: number; label: string }[]>> = {
  term: [
    { amount: 2500000, label: '25L' },
    { amount: 5000000, label: '50L' },
    { amount: 10000000, label: '1Cr' },
    { amount: 20000000, label: '2Cr' },
    { amount: 50000000, label: '5Cr' }
  ],
  life: [
    { amount: 2500000, label: '25L' },
    { amount: 5000000, label: '50L' },
    { amount: 10000000, label: '1Cr' },
    { amount: 20000000, label: '2Cr' }
  ],
  health: [
    { amount: 300000, label: '3L' },
    { amount: 500000, label: '5L' },
    { amount: 1000000, label: '10L' },
    { amount: 2500000, label: '25L' },
    { amount: 5000000, label: '50L' }
  ],
  vehicle: [
    { amount: 300000, label: '3L' },
    { amount: 500000, label: '5L' },
    { amount: 800000, label: '8L' },
    { amount: 1200000, label: '12L' }
  ],
  home: [
    { amount: 2500000, label: '25L' },
    { amount: 5000000, label: '50L' },
    { amount: 10000000, label: '1Cr' },
    { amount: 20000000, label: '2Cr' }
  ]
};

/** The one "how much does this cover" number every type but Travel/Other has, and its label/placeholder
 *  — surfaced as its own hero field right after the type picker (2026-08-31 relayout; previously buried
 *  inside each type's trailing type-specific block, near the very bottom of the form). `null` for
 *  Travel/Other, which have no such concept. */
function primaryCoverageMeta(type: InsuranceType): { label: string; placeholder: string } | null {
  switch (type) {
    case 'term':
    case 'life':
      return { label: 'Sum assured', placeholder: 'e.g. 10000000' };
    case 'health':
      return { label: 'Sum insured', placeholder: 'e.g. 1000000' };
    case 'vehicle':
      return { label: 'IDV (Insured Declared Value)', placeholder: 'e.g. 580000' };
    case 'home':
      return { label: 'Structure value insured', placeholder: 'e.g. 6000000' };
    default:
      return null;
  }
}

function ageEndDate(dobIso: string, targetAge: number): number {
  return addMonths(new Date(dobIso).getTime(), targetAge * 12);
}

/**
 * Add/Edit Insurance. One form, fields adapt to the selected type: universal fields always shown,
 * type-conditional blocks swap based on `type`.
 *
 * **Dense 2-column grid layout** (2026-08-31 relayout, per direct user feedback on the original flat
 * one-field-per-row form: "sum assured is at the bottom", "keep taps minimal, do not waste space") —
 * paired fields sit two-to-a-row; the primary coverage figure (Sum assured/Sum insured/IDV/Structure
 * value, whichever applies) is its own hero field right after the type picker, with quick-amount preset
 * pills directly below it; Insurer pairs with Annual premium; Plan name pairs with Policy number; Start
 * date pairs with End date, with the duration preset chips (no separate "Policy duration" label — they
 * exist purely to set the End date above them) directly below; Payment frequency is a full-row pill
 * group (was a segmented control sharing a row with Premium); first-year discount stays its own full
 * row; Premium payment term pairs inline with Next premium due; Nominee is its own full row, after
 * Mark-as-paid.
 *
 * Mark-as-paid/un-mark write DIRECTLY to the persisted policy (via the `markAsPaid`/`unmarkPayment`
 * props, backed by `~/hooks/useInsurancePremiumActions.ts`) — independent of this form's own Save
 * button, since it's a real, immediate action ("before the payment finalizes", not a draft edit). This
 * form reads `editing.premiumPayments`/`editing.nextPremiumDueDate` fresh on every render (never a
 * mount-time snapshot) so a mark/unmark applied while this form stays open shows up immediately — the
 * same "never snapshot, always re-resolve live" rule the EPF employer-detail-modal incident established
 * (see docs/ARCHITECTURE.md's matching decision-log entry); `InsurancePage.tsx` re-resolves `editing` by
 * id from its own live `policies` list on every render for exactly this reason.
 */
export function PolicyForm({
  editing,
  onSave,
  onDelete,
  onClose,
  insurerMemories,
  rememberInsurer,
  markAsPaid,
  unmarkPayment,
  candidateExpenses
}: Props) {
  const { profile } = useProfile();
  const { showToast } = useToast();

  const [type, setType] = useState<InsuranceType>(editing?.type ?? 'term');
  const [planName, setPlanName] = useState(editing?.planName ?? '');
  const [insurer, setInsurer] = useState(editing?.insurer ?? '');
  const [policyNumber, setPolicyNumber] = useState(editing?.policyNumber ?? '');
  const [startDate, setStartDate] = useState(() => epochToDateInput(editing?.startDate ?? Date.now()));

  const [durationPreset, setDurationPreset] = useState<string | null>(null); // UI highlight only, e.g. "years:15" | "age:60" | "days:14" | "custom"
  const [endDate, setEndDate] = useState(() => {
    if (editing?.endDate) return epochToDateInput(editing.endDate);
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return epochToDateInput(d.getTime());
  });
  const [endDateIsCustom, setEndDateIsCustom] = useState(editing?.endDateIsCustom ?? false);

  const [annualPremium, setAnnualPremium] = useState(editing ? String(editing.annualPremium) : '');
  const [paymentFrequency, setPaymentFrequency] = useState<PremiumFrequency>(editing?.paymentFrequency ?? 'A');
  const [firstYearDiscountEnabled, setFirstYearDiscountEnabled] = useState(editing?.firstYearDiscountEnabled ?? false);
  const [discountType, setDiscountType] = useState<DiscountType>(editing?.discountType ?? 'pct');
  const [discountValue, setDiscountValue] = useState(editing?.discountValue ? String(editing.discountValue) : '10');

  const [nextPremiumDueDate, setNextPremiumDueDate] = useState(() => {
    if (editing?.nextPremiumDueDate) return epochToDateInput(editing.nextPremiumDueDate);
    const auto = firstNextDueDate({ startDate: new Date(startDate).getTime(), paymentFrequency });
    return auto ? epochToDateInput(auto) : '';
  });
  const [nextPremiumDueDateIsCustom, setNextPremiumDueDateIsCustom] = useState(
    editing?.nextPremiumDueDateIsCustom ?? false
  );

  // Term/Life fields
  const [sumAssured, setSumAssured] = useState(editing?.sumAssured ? String(editing.sumAssured) : '');
  const [premiumPaymentTerm, setPremiumPaymentTerm] = useState<PremiumPaymentTerm>(
    editing?.premiumPaymentTerm ?? 'regular'
  );
  const [limitedPayYears, setLimitedPayYears] = useState(
    editing?.limitedPayYears ? String(editing.limitedPayYears) : ''
  );
  const [nominees, setNominees] = useState(editing?.nominees ?? '');
  const [maturityBenefit, setMaturityBenefit] = useState(
    editing?.maturityBenefit ? String(editing.maturityBenefit) : ''
  );
  const [isULIP, setIsULIP] = useState(editing?.isULIP ?? false);

  // Health fields
  const [sumInsured, setSumInsured] = useState(editing?.sumInsured ? String(editing.sumInsured) : '');
  const [membersCovered, setMembersCovered] = useState<string[]>(editing?.membersCovered ?? ['Self']);
  const [coPayPct, setCoPayPct] = useState(editing?.coPayPct !== undefined ? String(editing.coPayPct) : '');

  // Vehicle fields
  const [vehicleRegNumber, setVehicleRegNumber] = useState(editing?.vehicleRegNumber ?? '');
  const [idv, setIdv] = useState(editing?.idv ? String(editing.idv) : '');
  const [ncbPct, setNcbPct] = useState(editing?.ncbPct !== undefined ? String(editing.ncbPct) : '');

  // Home fields
  const [structureValue, setStructureValue] = useState(editing?.structureValue ? String(editing.structureValue) : '');

  // Travel fields
  const [destination, setDestination] = useState(editing?.destination ?? '');
  const [tripStartDate, setTripStartDate] = useState(
    editing?.tripStartDate ? epochToDateInput(editing.tripStartDate) : ''
  );
  const [tripEndDate, setTripEndDate] = useState(editing?.tripEndDate ? epochToDateInput(editing.tripEndDate) : '');

  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [saving, setSaving] = useState(false);

  // Mark-as-paid inline choice panel — appears where the button was.
  const [payChoice, setPayChoice] = useState<'menu' | 'link' | null>(null);
  const [linkCandidates, setLinkCandidates] = useState<Expense[] | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [confirmUndo, setConfirmUndo] = useState<{ paymentId: string; expenseId: string } | null>(null);

  const isLife = type === 'life';
  const isTermOrLife = type === 'term' || type === 'life';
  const showDueSchedule = isTermOrLife && paymentFrequency !== 'S';
  const insurerCategory = insurerCategoryForType(type);

  // Whichever state pair backs the current type's primary "how much does this cover" figure — the one
  // field every type but Travel/Other has, now a shared hero field instead of five separate near-
  // duplicate inputs buried in each type's own trailing block. See `primaryCoverageMeta`'s doc comment.
  const primaryCoverageValue =
    type === 'term' || type === 'life'
      ? sumAssured
      : type === 'health'
        ? sumInsured
        : type === 'vehicle'
          ? idv
          : type === 'home'
            ? structureValue
            : '';
  const setPrimaryCoverageValue =
    type === 'term' || type === 'life'
      ? setSumAssured
      : type === 'health'
        ? setSumInsured
        : type === 'vehicle'
          ? setIdv
          : type === 'home'
            ? setStructureValue
            : () => {};
  const primaryCoverageMetaForType = primaryCoverageMeta(type);
  const coveragePresets = COVERAGE_PRESETS[type] ?? [];

  // Stable per-mount "now" — not called inline during render (an impure `Date.now()` call during render
  // is unstable across re-renders), matching this app's established
  // `const [nowMs] = useState(() => Date.now())` convention (e.g. `useHealthScore.ts`, `useTaxData.ts`).
  const [nowMs] = useState(() => Date.now());
  // True once a Limited Pay Term/Life policy has finished its pay term (still within cover) — see
  // `isPaidUp`'s own doc comment. Drives the "Paid up" banner below in place of the due-schedule/
  // mark-as-paid UI, and gates the auto-recompute effect right below this.
  const paidUp = editing ? isPaidUp(editing, nowMs) : false;

  // Live payment history / next-due-date resync (never a mount-time snapshot) — see this file's own
  // module doc comment. Only resyncs when a mark/unmark actually changed the count, not on every
  // unrelated re-render (which would otherwise clobber in-progress typing elsewhere in this form).
  // setState wrapped in a same-tick timeout, not called directly in the effect body — the established
  // `react-hooks/set-state-in-effect` fix already used elsewhere (`useLivePrice.ts`/`RetirementSheets.tsx`).
  //
  // Explicitly clears (not just "skips updating") the displayed due date once `editing.nextPremiumDueDate`
  // is `undefined` — the ONLY way that happens is a Limited Pay policy's pay term completing
  // (`applyMarkAsPaid()`'s own doc comment), so leaving the last real due date on screen here would keep
  // showing a stale, no-longer-true "next premium due" after the policy is actually paid up (2026-08-31
  // fix — the `paidUp` banner below is what should show instead, driven by this cleared value).
  const livePaymentsCount = editing?.premiumPayments?.length ?? 0;
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => {
      setNextPremiumDueDate(editing.nextPremiumDueDate ? epochToDateInput(editing.nextPremiumDueDate) : '');
      setNextPremiumDueDateIsCustom(editing.nextPremiumDueDateIsCustom ?? false);
      setPayChoice(null);
      setLinkCandidates(null);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePaymentsCount]);

  // Auto-recompute "Next premium due" from start date + frequency, unless the user overrode it or the
  // policy has already paid up (a paid-up policy has nothing left to auto-schedule — see `paidUp` below).
  useEffect(() => {
    if (nextPremiumDueDateIsCustom || !showDueSchedule || paidUp) return;
    const auto = firstNextDueDate({ startDate: new Date(startDate).getTime(), paymentFrequency });
    if (!auto) return;
    const t = setTimeout(() => setNextPremiumDueDate(epochToDateInput(auto)), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, paymentFrequency, showDueSchedule, paidUp]);

  function selectType(next: InsuranceType) {
    setType(next);
    setInsurer(''); // silently reset — decided, no confirm dialog
    setDurationPreset(null);
  }

  function selectYearsPreset(years: number) {
    setDurationPreset(`years:${years}`);
    setEndDateIsCustom(false);
    setEndDate(epochToDateInput(addMonths(new Date(startDate).getTime(), years * 12)));
  }

  function selectDaysPreset(days: number) {
    setDurationPreset(`days:${days}`);
    setEndDateIsCustom(false);
    setEndDate(epochToDateInput(new Date(startDate).getTime() + days * 86_400_000));
  }

  // Real bug (2026-08-31 user report): this used to silently no-op with zero feedback when the
  // profile had no saved DOB — tapping "Till 60"/"Till 65" visibly did nothing, reading as broken
  // rather than as "needs your date of birth first." Now says so.
  function selectAgePreset(age: number) {
    if (!profile?.dob) {
      showToast({
        variant: 'warning',
        message: 'Add your date of birth in Settings → Profile to use age-based durations like "Till 60".'
      });
      return;
    }
    setDurationPreset(`age:${age}`);
    setEndDateIsCustom(true); // not derived from startDate + a fixed duration
    setEndDate(epochToDateInput(ageEndDate(profile.dob, age)));
  }

  const draftForMath = useMemo(
    () => ({
      annualPremium: parseNumber(annualPremium) || 0,
      paymentFrequency,
      startDate: new Date(startDate).getTime(),
      firstYearDiscountEnabled,
      discountType,
      discountValue: parseNumber(discountValue) || 0
    }),
    [annualPremium, paymentFrequency, startDate, firstYearDiscountEnabled, discountType, discountValue]
  );

  const nextDueMs = nextPremiumDueDate ? new Date(nextPremiumDueDate).getTime() : nowMs;
  const nextInstallment = installmentAmount(draftForMath, nextDueMs);
  const fullInstallment = installmentAmount({ ...draftForMath, firstYearDiscountEnabled: false }, nextDueMs);

  const installmentPreview =
    paymentFrequency === 'S'
      ? `One-time payment of ${formatCurrency(fullInstallment)}`
      : firstYearDiscountEnabled
        ? `Year 1: ${formatCurrency(nextInstallment)}/${FREQ_LABEL[paymentFrequency]} · Year 2+: ${formatCurrency(fullInstallment)}/${FREQ_LABEL[paymentFrequency]}`
        : `= ${formatCurrency(fullInstallment)} per ${FREQ_LABEL[paymentFrequency]}`;

  async function openMarkPaidMenu() {
    setPayChoice('menu');
    setLinkCandidates(null);
  }

  async function openLinkCandidates() {
    if (!editing) return;
    setPayBusy(true);
    try {
      setLinkCandidates(await candidateExpenses(editing));
      setPayChoice('link');
    } finally {
      setPayBusy(false);
    }
  }

  async function chooseMarkPaid(choice: MarkPaidChoice) {
    if (!editing) return;
    setPayBusy(true);
    try {
      await markAsPaid(editing, choice);
    } finally {
      setPayBusy(false);
      setPayChoice(null);
      setLinkCandidates(null);
    }
  }

  function requestUndo(paymentId: string, linkedExpenseId?: string) {
    if (!editing) return;
    if (linkedExpenseId) {
      setConfirmUndo({ paymentId, expenseId: linkedExpenseId });
    } else {
      void unmarkPayment(editing, paymentId, false);
    }
  }

  function handleSave() {
    const premium = parseNumber(annualPremium);
    if (!planName.trim() || !insurer.trim() || isNaN(premium) || premium <= 0) return;
    setSaving(true);
    const now = Date.now();
    const pn = policyNumber.trim();
    const nom = nominees.trim();
    const notesVal = notes.trim();

    const startMs = new Date(startDate).getTime();
    const endMs = endDate ? new Date(endDate).getTime() : undefined;
    const durationYears = durationPreset?.startsWith('years:') ? Number(durationPreset.split(':')[1]) : undefined;
    const durationDays = durationPreset?.startsWith('days:') ? Number(durationPreset.split(':')[1]) : undefined;

    const category = insurerCategory;
    const insurerName = insurer.trim();

    // `coverageAmount` is a required field on `InsurancePolicy` (pre-dates this redesign) — the new
    // form has no standalone "Coverage amount" input, so derive it from whichever type-specific field
    // represents "how much this policy covers" (Term/Life's Sum assured, Health's Sum insured,
    // Vehicle's IDV, Home's Structure value). Travel/Other have no such concept in the mockup and fall
    // back to the previous saved value (0 for a new policy) — harmless, since `CoverageSummary.tsx`
    // only ever sums `coverageAmount` for term/life/health.
    const coverage =
      type === 'term' || type === 'life'
        ? parseNumber(sumAssured) || 0
        : type === 'health'
          ? parseNumber(sumInsured) || 0
          : type === 'vehicle'
            ? parseNumber(idv) || 0
            : type === 'home'
              ? parseNumber(structureValue) || 0
              : (editing?.coverageAmount ?? 0);

    const policy: InsurancePolicy = {
      id: editing?.id ?? crypto.randomUUID(),
      type,
      insurer: insurerName,
      ...(pn ? { policyNumber: pn } : {}),
      coverageAmount: coverage,
      annualPremium: premium,
      // Health/Vehicle/Home/Travel/Other still use `renewalDate` as their flat annual-renewal date —
      // reuse the computed end date the first year it's due, else the existing renewal date.
      renewalDate: editing?.renewalDate ?? endMs ?? startMs,
      ...(nom ? { nominees: nom } : {}),
      ...(notesVal ? { notes: notesVal } : {}),
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,

      planName: planName.trim(),
      startDate: startMs,
      ...(durationYears !== undefined ? { durationYears } : {}),
      ...(durationDays !== undefined ? { durationDays } : {}),
      ...(endMs !== undefined ? { endDate: endMs } : {}),
      endDateIsCustom,
      paymentFrequency,
      firstYearDiscountEnabled,
      ...(firstYearDiscountEnabled ? { discountType, discountValue: parseNumber(discountValue) || 0 } : {}),
      ...(showDueSchedule && nextPremiumDueDate
        ? { nextPremiumDueDate: new Date(nextPremiumDueDate).getTime(), nextPremiumDueDateIsCustom }
        : {}),
      ...(editing?.premiumPayments ? { premiumPayments: editing.premiumPayments } : {}),

      ...(isTermOrLife
        ? {
            ...(sumAssured ? { sumAssured: parseNumber(sumAssured) } : {}),
            premiumPaymentTerm,
            ...(premiumPaymentTerm === 'limited' && limitedPayYears
              ? { limitedPayYears: parseNumber(limitedPayYears) }
              : {})
          }
        : {}),
      ...(isLife ? { isULIP, ...(maturityBenefit ? { maturityBenefit: parseNumber(maturityBenefit) } : {}) } : {}),
      ...(type === 'health'
        ? {
            ...(sumInsured ? { sumInsured: parseNumber(sumInsured) } : {}),
            membersCovered,
            ...(coPayPct ? { coPayPct: parseNumber(coPayPct) } : {})
          }
        : {}),
      ...(type === 'vehicle'
        ? {
            ...(vehicleRegNumber.trim() ? { vehicleRegNumber: vehicleRegNumber.trim().toUpperCase() } : {}),
            ...(idv ? { idv: parseNumber(idv) } : {}),
            ...(ncbPct ? { ncbPct: parseNumber(ncbPct) } : {})
          }
        : {}),
      ...(type === 'home' ? (structureValue ? { structureValue: parseNumber(structureValue) } : {}) : {}),
      ...(type === 'travel'
        ? {
            ...(destination.trim() ? { destination: destination.trim() } : {}),
            ...(tripStartDate ? { tripStartDate: new Date(tripStartDate).getTime() } : {}),
            ...(tripEndDate ? { tripEndDate: new Date(tripEndDate).getTime() } : {})
          }
        : {})
    };

    const isCustomInsurer = !insurersForCategory(category).includes(insurerName);
    onSave(policy)
      .then(() => (isCustomInsurer ? rememberInsurer(category, insurerName) : undefined))
      .catch(() => {})
      .finally(() => setSaving(false));
  }

  function handleDelete() {
    if (!editing) return;
    onDelete(editing.id).catch(() => {});
  }

  const paymentHistory = [...(editing?.premiumPayments ?? [])].reverse(); // newest first

  return (
    <FormModal
      title={editing ? 'Edit insurance' : 'Add insurance'}
      onClose={onClose}
      onSave={handleSave}
      onDelete={editing ? handleDelete : undefined}
      saving={saving}
      saveLabel={editing ? 'Update' : 'Add policy'}
    >
      <View>
        <Text className="text-xs font-medium text-secondary mb-1">Insurance type</Text>
        <View className="flex-row flex-wrap gap-2">
          {POLICY_TYPES.map((pt) => (
            <View key={pt.value} className="w-[23%]">
              <OptionButton
                compact
                label={pt.label.split(' ')[0] ?? pt.label}
                icon={pt.icon}
                color={pt.color}
                selected={type === pt.value}
                onPress={() => selectType(pt.value)}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Primary coverage hero field — the one number every type but Travel/Other leads with, now
          surfaced right after the type picker instead of buried at the bottom (2026-08-31 relayout). */}
      {primaryCoverageMetaForType && (
        <View>
          <AmountInput
            label={primaryCoverageMetaForType.label}
            value={primaryCoverageValue}
            onChange={setPrimaryCoverageValue}
            placeholder={primaryCoverageMetaForType.placeholder}
          />
          {coveragePresets.length > 0 && (
            <View className="flex-row flex-wrap gap-1.5 mt-1.5">
              {coveragePresets.map((p) => (
                <Chip
                  key={p.amount}
                  label={p.label}
                  active={parseNumber(primaryCoverageValue) === p.amount}
                  onPress={() => setPrimaryCoverageValue(String(p.amount))}
                />
              ))}
            </View>
          )}
        </View>
      )}

      <View className="flex-row gap-3">
        <View className="flex-1">
          <InsurerField
            category={insurerCategory}
            categoryLabel={CATEGORY_LABEL[insurerCategory]}
            value={insurer}
            onChange={setInsurer}
            insurerMemories={insurerMemories}
          />
        </View>
        <View className="flex-1">
          <AmountInput
            label="Annual premium (before any discount)"
            value={annualPremium}
            onChange={setAnnualPremium}
            placeholder="e.g. 12000"
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextInput
            label="Policy / plan name"
            value={planName}
            onChange={setPlanName}
            placeholder="e.g. iSelect Smart360"
            autoFocus
          />
        </View>
        <View className="flex-1">
          <TextInput
            label="Policy number (optional)"
            value={policyNumber}
            onChange={setPolicyNumber}
            placeholder="e.g. P-12345678"
          />
        </View>
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateInput label="Start date" value={startDate} onChange={setStartDate} />
        </View>
        <View className="flex-1">
          <DateInput
            label={`End date${endDateIsCustom ? ' (custom)' : ' (auto — from duration)'}`}
            value={endDate}
            onChange={(v) => {
              setEndDate(v);
              setEndDateIsCustom(true);
              setDurationPreset('custom');
            }}
          />
        </View>
      </View>

      {/* No separate "Policy duration" label — these chips exist purely to set the End date above them,
          so they sit directly under the date row they control (2026-08-31 relayout). */}
      <View className="flex-row flex-wrap gap-1.5">
        {(YEAR_PRESETS[type] ?? []).map((y) => (
          <Chip
            key={`y${y}`}
            label={`${y}Y`}
            active={durationPreset === `years:${y}`}
            onPress={() => selectYearsPreset(y)}
          />
        ))}
        {(DAY_PRESETS[type] ?? []).map((d) => (
          <Chip
            key={`d${d}`}
            label={d === 30 ? '1 month' : d === 14 ? '2 weeks' : `${d} days`}
            active={durationPreset === `days:${d}`}
            onPress={() => selectDaysPreset(d)}
          />
        ))}
        {type === 'travel' && (
          <Chip
            label="Annual (multi-trip)"
            active={durationPreset === 'years:1'}
            onPress={() => selectYearsPreset(1)}
          />
        )}
        {(AGE_PRESETS[type] ?? []).map((a) => (
          <Chip
            key={`a${a}`}
            label={a === 99 ? 'Whole life' : `Till ${a}`}
            active={durationPreset === `age:${a}`}
            onPress={() => selectAgePreset(a)}
          />
        ))}
        <Chip label="Custom" active={durationPreset === 'custom'} onPress={() => setDurationPreset('custom')} />
      </View>

      {/* Payment frequency — a full-row pill group (2026-08-31 relayout; was a segmented control sharing
          half a row with Premium, too cramped for 5 real options). */}
      <View>
        <Text className="text-xs font-medium text-secondary mb-1">Payment frequency</Text>
        <View className="flex-row flex-wrap gap-1.5">
          {FREQ_OPTIONS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              active={paymentFrequency === f.value}
              onPress={() => setPaymentFrequency(f.value)}
            />
          ))}
        </View>
      </View>

      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-xs font-medium text-primary">Apply first-year discount</Text>
          <Text className="text-[10px] text-tertiary mt-0.5">Insurer discount on year-1 premium only</Text>
        </View>
        <Toggle
          value={firstYearDiscountEnabled}
          onChange={setFirstYearDiscountEnabled}
          accessibilityLabel="Apply first-year discount"
        />
      </View>

      {firstYearDiscountEnabled && (
        <View className="gap-2">
          <SegmentedControl
            options={[
              { value: 'pct', label: '% off' },
              { value: 'flat', label: '₹ flat off' }
            ]}
            value={discountType}
            onChange={setDiscountType}
          />
          {discountType === 'pct' ? (
            <View className="flex-row gap-1.5">
              {['10', '15', '20'].map((v) => (
                <Chip key={v} label={`${v}%`} active={discountValue === v} onPress={() => setDiscountValue(v)} />
              ))}
            </View>
          ) : (
            <AmountInput value={discountValue} onChange={setDiscountValue} placeholder="e.g. 500" />
          )}
        </View>
      )}

      <View className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'rgba(0,168,107,0.1)' }}>
        <Text className="text-[10px] text-secondary">{installmentPreview}</Text>
      </View>

      {isTermOrLife && (
        <View className="gap-3 pt-2" style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.3)' }}>
          <Text className="text-[9.5px] font-bold uppercase tracking-wide text-tertiary">Premium payment schedule</Text>

          {paidUp ? (
            // Mirrors `PolicyCard.tsx`'s own `'paidUp'` note (same message/tone) — a Limited Pay policy
            // that finished its pay term has nothing left to schedule, so the due-date field and
            // "Mark as paid" flow are replaced entirely rather than shown stale/inert (2026-08-31 fix).
            <Banner variant="success">Paid up — cover continues without further premiums.</Banner>
          ) : (
            <>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-xs font-medium text-secondary mb-1">Premium payment term</Text>
                  <SegmentedControl
                    options={[
                      { value: 'regular', label: 'Regular' },
                      { value: 'limited', label: 'Limited pay' }
                    ]}
                    value={premiumPaymentTerm}
                    onChange={setPremiumPaymentTerm}
                  />
                </View>
                <View className="flex-1">
                  {showDueSchedule && (
                    <DateInput
                      label={`Next premium due${nextPremiumDueDateIsCustom ? '' : ' (auto)'}`}
                      value={nextPremiumDueDate}
                      onChange={(v) => {
                        setNextPremiumDueDate(v);
                        setNextPremiumDueDateIsCustom(true);
                      }}
                    />
                  )}
                </View>
              </View>

              {premiumPaymentTerm === 'limited' && (
                <TextInput
                  label="Pay for how many years?"
                  value={limitedPayYears}
                  onChange={setLimitedPayYears}
                  placeholder="e.g. 10"
                  keyboardType="number-pad"
                />
              )}

              {editing &&
                (payChoice === null ? (
                  <Pressable
                    onPress={() => void openMarkPaidMenu()}
                    className="self-end bg-primary px-4 py-2.5 rounded-xl"
                    style={{ backgroundColor: '#00a86b' }}
                  >
                    <Text className="text-xs font-bold" style={{ color: '#04140d' }}>
                      ✓ Mark as paid
                    </Text>
                  </Pressable>
                ) : payChoice === 'menu' ? (
                  <View className="gap-2">
                    <Text className="text-[10px] font-semibold text-secondary">
                      Next payment: {formatCurrency(nextInstallment)} — what should happen to your ledger?
                    </Text>
                    <Pressable
                      className="bg-surface-3 border border-theme rounded-lg px-3 py-2.5"
                      onPress={() => void chooseMarkPaid({ kind: 'log' })}
                    >
                      <Text className="text-[10.5px] font-bold text-primary">🧾 Log a new expense</Text>
                    </Pressable>
                    <Pressable
                      className="bg-surface-3 border border-theme rounded-lg px-3 py-2.5"
                      onPress={() => void openLinkCandidates()}
                    >
                      <Text className="text-[10.5px] font-bold text-primary">🔗 Link an existing expense</Text>
                    </Pressable>
                    <Pressable
                      className="bg-surface-3 border border-theme rounded-lg px-3 py-2.5"
                      onPress={() => void chooseMarkPaid({ kind: 'skip' })}
                    >
                      <Text className="text-[10.5px] font-bold text-primary">Skip — just track the payment</Text>
                    </Pressable>
                    <Pressable onPress={() => setPayChoice(null)}>
                      <Text className="text-[10px] text-tertiary">← Back</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View className="gap-2">
                    <Text className="text-[10px] font-semibold text-secondary">
                      {linkCandidates?.length
                        ? `${linkCandidates.length} recent expenses near this amount`
                        : 'No recent expenses nearby'}
                    </Text>
                    {(linkCandidates ?? []).map((e) => (
                      <Pressable
                        key={e.id}
                        className="flex-row items-center justify-between bg-surface-3 border border-theme rounded-lg px-3 py-2.5"
                        onPress={() => void chooseMarkPaid({ kind: 'link', expenseId: e.id })}
                      >
                        <Text className="text-[10px] text-secondary flex-1" numberOfLines={1}>
                          {e.description}
                        </Text>
                        <Text className="text-[10px] font-bold text-primary ml-2">{formatCurrency(e.amount)}</Text>
                      </Pressable>
                    ))}
                    <Pressable onPress={() => setPayChoice('menu')}>
                      <Text className="text-[10px] text-tertiary">← Back</Text>
                    </Pressable>
                  </View>
                ))}
              {payBusy && <Text className="text-[10px] text-tertiary">Working…</Text>}
            </>
          )}

          {paymentHistory.length > 0 && (
            <View>
              <Text className="text-xs font-medium text-secondary mb-1">Payment history</Text>
              {paymentHistory.map((p, idx) => (
                <View key={p.id} className="flex-row items-center justify-between py-1.5 border-t border-theme">
                  <Text className="text-[10px] text-secondary flex-1" numberOfLines={1}>
                    {epochToDateInput(p.paidMs)}
                    {p.linkedExpenseId ? ' · 🔗 linked to an expense' : ''}
                  </Text>
                  <Text className="text-[10px] font-bold text-primary mr-2">{formatCurrency(p.amount)}</Text>
                  {idx === 0 && (
                    <Pressable onPress={() => requestUndo(p.id, p.linkedExpenseId)}>
                      <Text className="text-[9px] font-bold" style={{ color: '#ef4444' }}>
                        Undo
                      </Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          <TextInput
            label="Nominee(s) (optional)"
            value={nominees}
            onChange={setNominees}
            placeholder="e.g. Spouse, Child"
          />
        </View>
      )}

      {isLife && (
        <View
          className="pt-2 gap-3"
          style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.3)', borderStyle: 'dashed' }}
        >
          <Text className="text-[9.5px] font-bold uppercase tracking-wide text-tertiary">
            Life / Endowment / ULIP-specific
          </Text>
          <TermLifeFields
            maturityBenefit={maturityBenefit}
            setMaturityBenefit={setMaturityBenefit}
            isULIP={isULIP}
            setIsULIP={setIsULIP}
          />
        </View>
      )}

      {type === 'health' && (
        <View
          className="pt-2 gap-3"
          style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.3)', borderStyle: 'dashed' }}
        >
          <Text className="text-[9.5px] font-bold uppercase tracking-wide text-tertiary">Health-specific</Text>
          <HealthFields
            membersCovered={membersCovered}
            setMembersCovered={setMembersCovered}
            coPayPct={coPayPct}
            setCoPayPct={setCoPayPct}
          />
        </View>
      )}

      {type === 'vehicle' && (
        <View
          className="pt-2 gap-3"
          style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.3)', borderStyle: 'dashed' }}
        >
          <Text className="text-[9.5px] font-bold uppercase tracking-wide text-tertiary">Vehicle-specific</Text>
          <VehicleInsuranceFields
            vehicleRegNumber={vehicleRegNumber}
            setVehicleRegNumber={setVehicleRegNumber}
            ncbPct={ncbPct}
            setNcbPct={setNcbPct}
          />
        </View>
      )}

      {type === 'travel' && (
        <View
          className="pt-2 gap-3"
          style={{ borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.3)', borderStyle: 'dashed' }}
        >
          <Text className="text-[9.5px] font-bold uppercase tracking-wide text-tertiary">Travel-specific</Text>
          <TravelFields
            destination={destination}
            setDestination={setDestination}
            tripStartDate={tripStartDate}
            setTripStartDate={setTripStartDate}
            tripEndDate={tripEndDate}
            setTripEndDate={setTripEndDate}
          />
        </View>
      )}

      <TextInput
        label="Notes (optional)"
        value={notes}
        onChange={setNotes}
        placeholder="e.g. Family floater, includes dental"
      />

      <ConfirmDialog
        isOpen={confirmUndo !== null}
        onClose={() => {
          if (confirmUndo && editing) void unmarkPayment(editing, confirmUndo.paymentId, false);
          setConfirmUndo(null);
        }}
        onConfirm={() => {
          if (confirmUndo && editing) void unmarkPayment(editing, confirmUndo.paymentId, true);
          setConfirmUndo(null);
        }}
        title="Remove the linked expense too?"
        message="This payment was linked to a real expense in your ledger. Remove/unlink that expense as well, or just stop tracking this premium payment and leave the expense untouched?"
        confirmLabel="Yes, remove expense"
        cancelLabel="No, just untrack"
        confirmVariant="danger"
      />
    </FormModal>
  );
}
