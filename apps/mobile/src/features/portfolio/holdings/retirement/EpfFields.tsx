import { View, Text } from 'react-native';
import { TextInput, AmountInput } from '~/components/ui';

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
    <View className="gap-3">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <TextInput
            label="UAN"
            hint="optional"
            keyboardType="numeric"
            placeholder="12-digit UAN"
            value={epfUan}
            onChange={setEpfUan}
          />
        </View>
        <View className="flex-1">
          <TextInput
            label="Birth year"
            hint="optional"
            keyboardType="numeric"
            placeholder="e.g. 1990"
            value={epfBirthYear}
            onChange={setEpfBirthYear}
          />
        </View>
      </View>
      <TextInput
        label="Current employer"
        placeholder="e.g. TCS, Infosys, Wipro"
        value={epfCompany}
        onChange={setEpfCompany}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <AmountInput
            label="Basic + DA (₹/mo)"
            placeholder="e.g. 60000"
            value={epfBasicSalary}
            onChange={setEpfBasicSalary}
          />
        </View>
        <View className="flex-1">
          <TextInput
            label="Joining date (YYYY-MM-DD)"
            value={epfJoiningDate}
            onChange={setEpfJoiningDate}
            placeholder="e.g. 2020-04-01"
          />
        </View>
      </View>
      <Text className="text-[11px] text-tertiary">
        Add previous employers and transaction history from the EPF card after saving.
      </Text>
    </View>
  );
}
