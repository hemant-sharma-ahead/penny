// "New employer detected" import-time setup step — see docs/plans/epf-passbook-import.md's
// 2026-08-11 follow-up round §10.9. Always asked before `commitUnit` creates a brand-new employer
// (never silently inferred from a contribution's deposit date), with a second date only when a
// genuine mid-month switch is detected (an existing "current" employer's own start date precedes
// this new unit). Mockup: docs/mockups/proposals/epf-employer-switch-v1.html §1/§2.
import { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { Modal, DateInput, Button } from '~/components/ui';
import { Icon } from '~/components/Icon';
import { useThemeColors } from '~/theme/useThemeColors';
import { tint, ink } from '~/lib/color';
import { epfDaysInMonth, checkProRataConsistency, type EpfProRataConsistency } from '@/core/portfolio/epfCalculations';
import type { EpfNewEmployerSetup, EpfProRataInput } from './epfImportLogic';

function buildDateKey(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

function monthKeyFromDateKey(key: string): string {
  return key.slice(0, 7);
}

function dayFromDateKey(key: string): number {
  return Number(key.slice(8, 10));
}

function dateKeyToMs(key: string): number {
  return new Date(`${key}T00:00:00`).getTime();
}

function ProRataNote({ check }: { check: EpfProRataConsistency }) {
  const theme = useThemeColors();
  const color = check.consistent ? theme.success : theme.warning;
  return (
    <View
      className="flex-row gap-1.5 rounded-lg px-2.5 py-2 mt-1.5"
      style={{ backgroundColor: tint(color, check.consistent ? 10 : 12) }}
    >
      <Icon name={check.consistent ? 'ti-circle-check' : 'ti-alert-triangle'} size={13} color={color} />
      <Text className="text-[10px] flex-1 leading-relaxed" style={{ color: ink(color, theme.textPrimary) }}>
        {check.consistent
          ? `This implies ~${check.impliedWorkedDays} of ${check.totalDays} days worked — the passbook shows ₹${check.actualAmount.toLocaleString('en-IN')}, consistent with that.`
          : `A full month would predict ₹${check.impliedAmount.toLocaleString('en-IN')} — the passbook shows ₹${check.actualAmount.toLocaleString('en-IN')}. Double-check this date if you're not sure.`}
      </Text>
    </View>
  );
}

interface EpfNewEmployerSetupSheetProps {
  setup: EpfNewEmployerSetup;
  onConfirm: (result: { joinDateMs: number; oldEmployerLastDayMs?: number }) => void;
  onClose: () => void;
}

export function EpfNewEmployerSetupSheet({ setup, onConfirm, onClose }: EpfNewEmployerSetupSheetProps) {
  const theme = useThemeColors();
  const [joinDateKey, setJoinDateKey] = useState(() => buildDateKey(setup.suggestedJoinMonth, setup.suggestedJoinDay));
  const [lastDayKey, setLastDayKey] = useState(() =>
    setup.priorEmployer
      ? buildDateKey(setup.priorEmployer.suggestedLastWorkingMonth, setup.priorEmployer.suggestedLastWorkingDay)
      : ''
  );

  function proRataCheck(
    input: EpfProRataInput | undefined,
    dateKey: string,
    edge: 'start' | 'end'
  ): EpfProRataConsistency | null {
    if (!input || !dateKey) return null;
    const daysInMonth = epfDaysInMonth(monthKeyFromDateKey(dateKey));
    return checkProRataConsistency(dayFromDateKey(dateKey), daysInMonth, input.actualAmount, input.fullAmount, edge);
  }

  const joinCheck = useMemo(
    () => proRataCheck(setup.joinProRata, joinDateKey, 'start'),
    [setup.joinProRata, joinDateKey]
  );
  const leavingCheck = useMemo(
    () => proRataCheck(setup.priorEmployer?.leavingProRata, lastDayKey, 'end'),
    [setup.priorEmployer, lastDayKey]
  );

  function handleConfirm() {
    onConfirm({
      joinDateMs: dateKeyToMs(joinDateKey),
      ...(setup.priorEmployer && lastDayKey ? { oldEmployerLastDayMs: dateKeyToMs(lastDayKey) } : {})
    });
  }

  return (
    <Modal
      onClose={onClose}
      title="New employer detected"
      scrollable
      footer={
        <Button variant="primary" fullWidth onPress={handleConfirm}>
          Confirm &amp; continue
        </Button>
      }
    >
      <View
        className="rounded-xl border p-3 flex-row gap-2 -mt-1"
        style={{ backgroundColor: theme.surfaceSecondary, borderColor: theme.border }}
      >
        <Icon name="ti-info-circle" size={15} color={theme.textTertiary} />
        <Text className="text-[11px] text-secondary flex-1 leading-relaxed">
          {setup.priorEmployer ? (
            <>
              This looks like a switch — <Text style={{ fontWeight: '700' }}>{setup.priorEmployer.companyName}</Text> is
              still marked "current" but this passbook is for{' '}
              <Text style={{ fontWeight: '700' }}>{setup.companyName}</Text>, starting around the same time.
            </>
          ) : (
            <>
              This passbook is for <Text style={{ fontWeight: '700' }}>{setup.companyName}</Text>, an employer we
              haven't seen before. When did you actually join?
            </>
          )}
        </Text>
      </View>

      <DateInput label={`Joining date at ${setup.companyName}`} value={joinDateKey} onChange={setJoinDateKey} />
      {joinCheck && <ProRataNote check={joinCheck} />}

      {setup.priorEmployer && (
        <>
          <DateInput
            label={`Last working day at ${setup.priorEmployer.companyName}`}
            value={lastDayKey}
            onChange={setLastDayKey}
          />
          {leavingCheck && <ProRataNote check={leavingCheck} />}
          <Text className="text-[10px] text-tertiary leading-relaxed mt-1">
            Both dates are editable — pick the real ones if you remember them exactly. This stops{' '}
            {setup.priorEmployer.companyName} from showing fabricated months after this point, and prevents{' '}
            {setup.companyName}'s contributions being misattributed.
          </Text>
        </>
      )}
    </Modal>
  );
}
