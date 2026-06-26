import { TextInput, AmountInput } from '@/components/ui';

interface EpfFieldsProps {
  epfUan: string;
  setEpfUan: (v: string) => void;
  epfBirthYear: string;
  setEpfBirthYear: (v: string) => void;
  epfCompany: string;
  setEpfCompany: (v: string) => void;
  epfBasicSalary: string;
  setEpfBasicSalary: (v: string) => void;
  epfJoiningDate: string;
  setEpfJoiningDate: (v: string) => void;
}

// EPF fields: UAN, birth year, current employer (basic + joining date).
// Previous employers and transaction history are added from the EPF card.
export function EpfFields({
  epfUan,
  setEpfUan,
  epfBirthYear,
  setEpfBirthYear,
  epfCompany,
  setEpfCompany,
  epfBasicSalary,
  setEpfBasicSalary,
  epfJoiningDate,
  setEpfJoiningDate
}: EpfFieldsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <TextInput
          label="UAN"
          hint="optional"
          inputMode="numeric"
          placeholder="12-digit UAN"
          value={epfUan}
          onChange={setEpfUan}
        />
        <TextInput
          label="Birth year"
          hint="optional"
          type="number"
          inputMode="numeric"
          placeholder="e.g. 1990"
          value={epfBirthYear}
          onChange={setEpfBirthYear}
        />
      </div>
      <TextInput
        label="Current employer"
        placeholder="e.g. TCS, Infosys, Wipro"
        value={epfCompany}
        onChange={setEpfCompany}
      />
      <div className="grid grid-cols-2 gap-3">
        <AmountInput
          label="Basic + DA (₹/mo)"
          placeholder="e.g. 60000"
          value={epfBasicSalary}
          onChange={setEpfBasicSalary}
        />
        <TextInput label="Joining date" type="date" value={epfJoiningDate} onChange={setEpfJoiningDate} />
      </div>
      <p className="text-[11px] text-tertiary">
        Add previous employers and transaction history from the EPF card after saving.
      </p>
    </div>
  );
}
