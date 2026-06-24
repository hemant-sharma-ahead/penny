import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { PATHS } from '@/router/paths';
import { Button } from '@/components/ui';
import { useAccounts } from './useAccounts';
import { useAccountForm } from './useAccountForm';
import { AccountList } from './AccountList';
import { AccountFormModal } from './AccountFormModal';

export function AccountsPage() {
  const navigate = useNavigate();
  const { mode } = usePrivacy();
  const { accounts, txns, saving, totalBalance, saveAccount, deleteAccount } = useAccounts();
  const form = useAccountForm(saveAccount);

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-theme flex items-center gap-3">
        <Button
          variant="ghost"
          icon="ti-arrow-left"
          aria-label="Go back"
          className="w-8 h-8 rounded-lg hover:text-primary"
          onClick={() => navigate(PATHS.app.expenses)}
        />
        <h2 className="text-xl font-semibold text-primary flex-1">Accounts</h2>
        <Button
          variant="primary"
          icon="ti-plus"
          aria-label="Add account"
          className="w-8 h-8 rounded-lg"
          onClick={form.openAdd}
        />
      </div>

      <AccountList
        accounts={accounts}
        txns={txns}
        totalBalance={totalBalance}
        mode={mode}
        onAdd={form.openAdd}
        onEdit={form.openEdit}
        deleteAccount={deleteAccount}
      />

      {form.showForm && <AccountFormModal form={form} saving={saving} />}
    </div>
  );
}
