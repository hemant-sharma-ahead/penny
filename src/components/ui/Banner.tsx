import type { ReactNode } from 'react';
import { STATUS, tint, ink } from '@/lib/statusColors';

type BannerVariant = 'info' | 'warning' | 'danger' | 'success';

interface BannerProps {
  variant: BannerVariant;
  /** Tabler icon name; defaults to a sensible icon per variant. Pass null to hide. */
  icon?: string | null;
  children: ReactNode;
  className?: string;
}

const VARIANT: Record<BannerVariant, { color: string; icon: string }> = {
  info: { color: STATUS.info, icon: 'ti-info-circle' },
  warning: { color: STATUS.warning, icon: 'ti-alert-triangle' },
  danger: { color: STATUS.danger, icon: 'ti-alert-triangle' },
  success: { color: STATUS.success, icon: 'ti-circle-check' }
};

/**
 * Inline callout/alert — subtle tinted background, status-colored icon, and a readable
 * (theme-aware) message. Replaces hand-rolled `bg-*-50 border-*-200 text-*-700` callouts.
 */
export function Banner({ variant, icon, children, className = '' }: BannerProps) {
  const { color, icon: defaultIcon } = VARIANT[variant];
  const iconName = icon === undefined ? defaultIcon : icon;

  return (
    <div
      className={`rounded-xl border p-3 flex gap-2 ${className}`}
      style={{ backgroundColor: tint(color, 12), borderColor: tint(color, 30) }}
    >
      {iconName && (
        <i className={`ti ${iconName} flex-shrink-0 mt-0.5`} style={{ fontSize: 16, color }} aria-hidden="true" />
      )}
      <div className="text-xs leading-relaxed" style={{ color: ink(color) }}>
        {children}
      </div>
    </div>
  );
}
