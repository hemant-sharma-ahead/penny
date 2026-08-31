import { View } from 'react-native';
import { TextInput, DateInput } from '~/components/ui';

interface TravelFieldsProps {
  destination: string;
  setDestination: (v: string) => void;
  tripStartDate: string;
  setTripStartDate: (v: string) => void;
  tripEndDate: string;
  setTripEndDate: (v: string) => void;
}

/** Travel-specific fields (insurance-redesign-v4.html §②'s `#fields-travel`). */
export function TravelFields({
  destination,
  setDestination,
  tripStartDate,
  setTripStartDate,
  tripEndDate,
  setTripEndDate
}: TravelFieldsProps) {
  return (
    <View className="gap-3">
      <TextInput
        label="Destination(s)"
        value={destination}
        onChange={setDestination}
        placeholder="e.g. Thailand, Singapore"
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateInput label="Trip start" value={tripStartDate} onChange={setTripStartDate} />
        </View>
        <View className="flex-1">
          <DateInput label="Trip end" value={tripEndDate} onChange={setTripEndDate} />
        </View>
      </View>
    </View>
  );
}
