import { useState } from 'react';
import { View, Text } from 'react-native';
import { TextInput, DismissibleChip } from '~/components/ui';
import { Chip } from '../Chip';

interface HealthFieldsProps {
  membersCovered: string[];
  setMembersCovered: (v: string[]) => void;
  coPayPct: string;
  setCoPayPct: (v: string) => void;
}

const COPAY_PRESETS = ['0', '10', '20'];

/** Health-specific fields — "Sum insured" moved into `PolicyForm.tsx`'s generic top-of-form primary-
 *  coverage hero field in the 2026-08-31 dense-grid relayout (every type's primary coverage number is
 *  now universal-in-position). "Members covered" is a free-form list of names/relations (e.g. "Self",
 *  "Spouse", "Child 1") rather than fixed demo chips, since real households vary. */
export function HealthFields({ membersCovered, setMembersCovered, coPayPct, setCoPayPct }: HealthFieldsProps) {
  const [newMember, setNewMember] = useState('');

  function addMember() {
    const name = newMember.trim();
    if (!name || membersCovered.includes(name)) return;
    setMembersCovered([...membersCovered, name]);
    setNewMember('');
  }

  return (
    <View className="gap-3">
      <View>
        <Text className="text-xs font-medium text-secondary mb-1">Members covered</Text>
        <View className="flex-row flex-wrap gap-1.5 mb-2">
          {membersCovered.map((m) => (
            <DismissibleChip
              key={m}
              label={m}
              onDismiss={() => setMembersCovered(membersCovered.filter((x) => x !== m))}
            />
          ))}
        </View>
        <View className="flex-row gap-2 items-end">
          <View className="flex-1">
            <TextInput value={newMember} onChange={setNewMember} placeholder="e.g. Self, Spouse, Child 1" />
          </View>
          <Chip label="+ Add" active={false} onPress={addMember} />
        </View>
      </View>

      <View>
        <Text className="text-xs font-medium text-secondary mb-1">Co-pay % (optional)</Text>
        <View className="flex-row gap-1.5 mb-2">
          {COPAY_PRESETS.map((p) => (
            <Chip key={p} label={`${p}%`} active={coPayPct === p} onPress={() => setCoPayPct(p)} />
          ))}
        </View>
        <TextInput value={coPayPct} onChange={setCoPayPct} placeholder="e.g. 10" keyboardType="number-pad" />
      </View>
    </View>
  );
}
