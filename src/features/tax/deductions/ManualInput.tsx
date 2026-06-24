import { TextInput } from '@/components/ui';

interface ManualInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}

/** A labelled inline numeric input for entering a manual deduction amount. */
export function ManualInput({ label, value, onChange }: ManualInputProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs flex-1 min-w-0 truncate text-secondary">{label}</span>
      <div className="flex-shrink-0 w-28">
        <TextInput type="number" inputMode="decimal" prefix="₹" placeholder="0" value={value} onChange={onChange} />
      </div>
    </div>
  );
}
