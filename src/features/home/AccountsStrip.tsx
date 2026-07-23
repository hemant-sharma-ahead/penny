import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { formatCurrency } from '@/lib/formatters';
import { PATHS } from '@/router/paths';
import { Button, IconBadge } from '@/components/ui';
import type { AccountBalance } from './useHome';

export function AccountsStrip({ accounts }: { accounts: AccountBalance[] }) {
  const { shouldMask } = usePrivacy();
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-tertiary">Accounts</p>
        <Button
          variant="ghost"
          size="sm"
          style={{ color: 'var(--color-primary)' }}
          onClick={() => navigate(PATHS.app.accounts)}
        >
          Manage →
        </Button>
      </div>
      <div className="flex gap-2.5 overflow-x-auto pb-0.5 -mx-4 px-4">
        {accounts.map((acc) => (
          <button
            key={acc.id}
            onClick={() => navigate(PATHS.app.accounts)}
            className="flex-shrink-0 surface rounded-2xl px-3.5 py-3 flex flex-col gap-1 min-w-[120px] text-left active:opacity-70"
          >
            <IconBadge icon={acc.icon} color={acc.color} bg={acc.color + '22'} size="sm" />
            <p className="text-[11px] font-medium text-secondary truncate mt-0.5">{acc.name}</p>
            <p className="text-sm font-bold text-primary">
              {shouldMask(acc.hideInSafeMode) ? '••••' : formatCurrency(acc.balance)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
