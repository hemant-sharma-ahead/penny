import { useNavigate } from 'react-router-dom';
import { usePrivacy } from '@/context/PrivacyContext';
import { PATHS } from '@/router/paths';
import { Button, PageHeader } from '@/components/ui';
import { useAccounts } from './useAccounts';
import { useAccountForm } from './useAccountForm';
import { AccountList } from './AccountList';
import { AccountFormModal } from './AccountFormModal';

export function AccountsPage() {
  const navigate = useNavigate();
  const { shouldMask } = usePrivacy();
  const { accounts, txns, saving, totalBalance, saveAccount, deleteAccount, reconcileAccount } = useAccounts();
  const form = useAccountForm(saveAccount, accounts);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Accounts"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Go back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(PATHS.app.expenses)}
          />
        }
        actions={
          <Button
            variant="primary"
            icon="ti-plus"
            aria-label="Add account"
            className="w-8 h-8 rounded-lg"
            onClick={form.openAdd}
          />
        }
      />

      <AccountList
        accounts={accounts}
        txns={txns}
        totalBalance={totalBalance}
        shouldMask={shouldMask}
        onAdd={form.openAdd}
        onEdit={form.openEdit}
        deleteAccount={deleteAccount}
        reconcileAccount={reconcileAccount}
      />

      {form.showForm && <AccountFormModal form={form} saving={saving} />}
    </div>
  );
}
