import { dueDateInfo } from '@/lib/date';

interface DueDateBadgeProps {
  dueDateMs: number;
  nowMs: number;
  /** Days threshold for "urgent" red state. Default 7. */
  warningDays?: number;
  /** Label to show when past due. Default "Xd overdue". Pass "Expired" for insurance. */
  expiredLabel?: string;
}

export function DueDateBadge({ dueDateMs, nowMs, warningDays, expiredLabel }: DueDateBadgeProps) {
  const { text, color, bg } = dueDateInfo(dueDateMs, nowMs, warningDays, expiredLabel);
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-lg flex-shrink-0"
      style={{ color, backgroundColor: bg }}
    >
      {text}
    </span>
  );
}
