import { TextInput } from '@/components/ui';

// Computes the PPF maturity label (15-year lock-in) from the account opening date.
function ppfMaturityLabel(openingDateStr: string): { text: string } | null {
  if (!openingDateStr) return null;
  const openMs = new Date(openingDateStr).getTime();
  const maturityMs = openMs + 15 * 365.25 * 24 * 60 * 60 * 1000;
  const maturityDate = new Date(maturityMs);
  const yearsLeft = Math.max(0, Math.round((maturityMs - Date.now()) / (365.25 * 24 * 60 * 60 * 1000)));
  const suffix = yearsLeft > 0 ? ` · ${yearsLeft} yr${yearsLeft !== 1 ? 's' : ''} remaining` : ' · Matured';
  return { text: `Matures ${maturityDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}${suffix}` };
}

interface PpfFieldsProps {
  ppfOpeningDate: string;
  setPpfOpeningDate: (v: string) => void;
  ppfAnnual: string;
  setPpfAnnual: (v: string) => void;
  ppfBank: string;
  setPpfBank: (v: string) => void;
}

// PPF fields: opening date (with derived 15-year maturity label), annual
// contribution, and bank. Transactions are added from the PPF card after saving.
export function PpfFields({
  ppfOpeningDate,
  setPpfOpeningDate,
  ppfAnnual,
  setPpfAnnual,
  ppfBank,
  setPpfBank
}: PpfFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Opening date + derived maturity */}
      <div>
        <TextInput label="Account opening date" type="date" value={ppfOpeningDate} onChange={setPpfOpeningDate} />
        {ppfOpeningDate && ppfMaturityLabel(ppfOpeningDate) && (
          <p className="mt-1 text-xs" style={{ color: '#8b5cf6' }}>
            {ppfMaturityLabel(ppfOpeningDate)?.text}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="Annual contribution (₹)"
          type="number"
          inputMode="decimal"
          placeholder="e.g. 150000"
          value={ppfAnnual}
          onChange={setPpfAnnual}
        />
        <TextInput
          label="Bank / Institution"
          hint="optional"
          placeholder="e.g. SBI"
          value={ppfBank}
          onChange={setPpfBank}
        />
      </div>
      <p className="text-[11px] text-tertiary -mt-1">
        Transactions (deposits, interest, withdrawals) are added from the PPF card after saving.
      </p>
    </div>
  );
}
