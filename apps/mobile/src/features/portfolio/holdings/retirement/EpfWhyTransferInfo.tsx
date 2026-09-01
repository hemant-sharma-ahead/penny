// "Why transfer, not withdraw?" + how-to steps (2026-08-30) — shown inside the pending-transfer section
// of `EpfEmployerDetailModal.tsx`. Content sourced from EPFO's own published transfer rules (verified
// against the user's own research during this feature's design) — general educational guidance, not
// specific to any one holding's own data, so it's a plain static component with no props.
import { View, Text } from 'react-native';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';

interface InfoSection {
  icon: string;
  label: string;
  body: string;
}

const WHY_TRANSFER: InfoSection[] = [
  {
    icon: 'ti-receipt-tax',
    label: 'Tax exemption needs continuity',
    body: 'EPF withdrawals are tax-free only after 5 years of continuous service. Withdrawing between jobs resets that clock to zero — transferring instead chains your service periods together, keeping the exemption intact.'
  },
  {
    icon: 'ti-chart-line',
    label: 'Compounding keeps working',
    body: "Money left inside the EPF system keeps earning EPFO's guaranteed interest continuously — cashing out mid-career stops that early."
  },
  {
    icon: 'ti-award',
    label: 'Pension eligibility needs 10 years',
    body: 'A lifelong monthly pension under the EPS scheme needs 10 total years of eligible service. Transferring pools your years together toward that milestone — withdrawing between jobs can break the streak.'
  }
];

const WHAT_DOESNT_TRANSFER: InfoSection = {
  icon: 'ti-alert-circle',
  label: "The EPS (pension) balance doesn't move as cash",
  body: "Your employee share, employer share, and accumulated interest move fully into the new passbook. The EPS component only carries forward as service-history months toward the 10-year pension milestone — it's normal for the OLD passbook to still show its own historical EPS numbers afterward; that doesn't mean the transfer failed."
};

const HOW_TO_STEPS = [
  'Log in to the EPFO Member Portal with your UAN and password.',
  'Go to Online Services → "One Member – One EPF Account (Transfer Request)."',
  'Verify your profile and PF details for both the old and current accounts.',
  "Choose your CURRENT (active) employer to attest the claim — their HR/portal access is usually faster than a former employer's.",
  'Authenticate with the OTP sent to your Aadhaar-registered mobile number.'
];

function Section({ icon, label, body, color }: InfoSection & { color: string }) {
  return (
    <View className="flex-row gap-2">
      <Icon name={icon} size={14} color={color} />
      <View className="flex-1">
        <Text className="text-[11px] font-bold text-primary">{label}</Text>
        <Text className="text-[10.5px] text-secondary leading-relaxed mt-0.5">{body}</Text>
      </View>
    </View>
  );
}

export function EpfWhyTransferInfo() {
  const theme = useThemeColors();
  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-[9.5px] font-extrabold uppercase tracking-wide" style={{ color: theme.success }}>
          Why transfer, not withdraw
        </Text>
        {WHY_TRANSFER.map((s) => (
          <Section key={s.label} {...s} color={theme.success} />
        ))}
      </View>
      <View className="gap-2">
        <Text className="text-[9.5px] font-extrabold uppercase tracking-wide" style={{ color: theme.warning }}>
          What doesn&apos;t transfer
        </Text>
        <Section {...WHAT_DOESNT_TRANSFER} color={theme.warning} />
      </View>
      <View className="gap-1.5">
        <Text className="text-[9.5px] font-extrabold uppercase tracking-wide" style={{ color: theme.info }}>
          How to transfer (EPFO Member Portal)
        </Text>
        <Text className="text-[10px] text-tertiary">
          Requires an active UAN with Aadhaar-linked, verified KYC (Aadhaar, PAN, bank account).
        </Text>
        {HOW_TO_STEPS.map((step, i) => (
          <View key={step} className="flex-row gap-2">
            <Text className="text-[10.5px] font-bold" style={{ color: theme.info }}>
              {i + 1}.
            </Text>
            <Text className="text-[10.5px] text-secondary leading-relaxed flex-1">{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
