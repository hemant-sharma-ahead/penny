import { View, Text } from 'react-native';
import { TextInput, AmountInput } from '~/components/ui';
import type { AssetClass } from '@/core/db/types';
import type { SharedHoldingState } from './useSharedHoldingFields';

interface SharedFieldsProps {
  assetClass: AssetClass;
  shared: SharedHoldingState;
}

const NAME_PLACEHOLDER: Partial<Record<AssetClass, string>> = {
  fd: 'e.g. SBI FD 7.1%',
  nps: 'e.g. My NPS Account',
  ppf: 'e.g. PPF Account',
  epf: 'e.g. EPF Account',
  property: 'e.g. 2BHK Whitefield'
};

// Name is sourced elsewhere for these (RC fetch / Yahoo / MFAPI search).
const HIDE_NAME: AssetClass[] = ['vehicle', 'stock', 'mf'];
// Manual amount entry — others are auto-computed (units×price, corpus, weight…).
const SHOW_AMOUNT: AssetClass[] = ['nps', 'ppf', 'property', 'other'];
// Manual current value — retirement/auto-priced classes hide it.
const SHOW_CURRENT_VALUE: AssetClass[] = ['property', 'other'];

// The shared "Name" field — rendered ABOVE the class-specific fields.
export function SharedNameField({ assetClass, shared }: SharedFieldsProps) {
  if (HIDE_NAME.includes(assetClass)) return null;
  return (
    <TextInput
      label="Name"
      placeholder={NAME_PLACEHOLDER[assetClass] ?? 'e.g. Gold holdings'}
      value={shared.name}
      onChange={shared.setName}
      autoFocus
    />
  );
}

// The shared amount / current-value / notes fields — rendered BELOW the
// class-specific fields, showing only those that apply to `assetClass`.
export function SharedValueFields({ assetClass, shared }: SharedFieldsProps) {
  const { investedAmount, setInvestedAmount, currentValue, setCurrentValue, notes, setNotes } = shared;

  const amountLabel =
    assetClass === 'nps' || assetClass === 'ppf'
      ? 'Current corpus / balance (₹)'
      : assetClass === 'property'
        ? 'Purchase price (₹)'
        : 'Amount invested (₹)';

  return (
    <>
      {SHOW_AMOUNT.includes(assetClass) && (
        <AmountInput label={amountLabel} placeholder="0" value={investedAmount} onChange={setInvestedAmount} />
      )}

      {SHOW_CURRENT_VALUE.includes(assetClass) && (
        <View>
          <AmountInput
            label={assetClass === 'property' ? 'Current market value (₹)' : 'Current value (₹)'}
            {...(assetClass !== 'property' && { hint: 'optional, fetched automatically for MF/stocks' })}
            placeholder={assetClass === 'property' ? 'e.g. 6500000' : 'Leave blank to use invested amount'}
            value={currentValue}
            onChange={setCurrentValue}
          />
          {assetClass === 'property' && (
            <Text className="text-[10px] text-tertiary mt-1">
              You can update this anytime from the card — a staleness reminder appears after 90 days.
            </Text>
          )}
        </View>
      )}

      {/* Notes — hidden for vehicle */}
      {assetClass !== 'vehicle' && (
        <TextInput
          label="Notes"
          hint="optional"
          placeholder="e.g. held in Zerodha, SBI Kolar branch"
          value={notes}
          onChange={setNotes}
        />
      )}
    </>
  );
}
