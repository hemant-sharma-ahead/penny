import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextInput } from '@/components/ui';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_META } from '@/core/accounts/meta';
import type { AccountType } from '@/core/db/types';
import { PATHS } from '@/router/paths';
import { useOnboardingDraft, type DraftAccount } from '@/context/OnboardingDraftContext';
import { OnboardingBack } from './OnboardingBack';

/** Quick-add for the account types that already exist, so expense tracking works immediately after
 *  setup instead of requiring a trip to the Accounts page first. Fully optional — skippable. */
export function AddAccountsScreen() {
  const navigate = useNavigate();
  const { accountsToCreate = [], setDraft } = useOnboardingDraft();
  const [type, setType] = useState<AccountType>('bank');
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  function addCurrent(list: DraftAccount[]): DraftAccount[] {
    const trimmed = name.trim();
    if (!trimmed) return list;
    return [...list, { name: trimmed, type, openingBalance: Number(openingBalance) || 0 }];
  }

  function handleAddAnother() {
    const next = addCurrent(accountsToCreate);
    if (next === accountsToCreate) return; // nothing to add
    setDraft({ accountsToCreate: next });
    setName('');
    setOpeningBalance('');
  }

  function handleContinue() {
    setDraft({ accountsToCreate: addCurrent(accountsToCreate) });
    navigate(PATHS.onboarding.backupSetup);
  }

  function removeAccount(index: number) {
    setDraft({ accountsToCreate: accountsToCreate.filter((_, i) => i !== index) });
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-surface px-6 py-10">
      <OnboardingBack to={PATHS.onboarding.lifeHousehold} />
      <div className="flex-1 w-full max-w-sm mx-auto flex flex-col">
        <div className="mb-6 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <i className="ti ti-building-bank text-white" style={{ fontSize: 28 }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-semibold text-primary mb-2">Add your accounts</h2>
          <p className="text-secondary text-sm">
            Optional — add the ones you'll track expenses from. You can always add more later.
          </p>
        </div>

        {accountsToCreate.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {accountsToCreate.map((acc, i) => (
              <span
                key={`${acc.name}-${i}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full pl-2.5 pr-1.5 py-1.5 bg-surface-2 text-secondary"
              >
                <i
                  className={`ti ${ACCOUNT_TYPE_META[acc.type].icon}`}
                  style={{ fontSize: 12, color: ACCOUNT_TYPE_META[acc.type].color }}
                  aria-hidden="true"
                />
                {acc.name}
                <button
                  type="button"
                  aria-label={`Remove ${acc.name}`}
                  onClick={() => removeAccount(i)}
                  className="text-tertiary hover:text-danger"
                >
                  <i className="ti ti-x" style={{ fontSize: 12 }} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 mb-4">
          {ACCOUNT_TYPES.map((t) => {
            const meta = ACCOUNT_TYPE_META[t];
            const selected = type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 ${selected ? 'border-[var(--color-primary)]' : 'border-theme'}`}
                style={
                  selected ? { backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, transparent)' } : undefined
                }
              >
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: meta.color }}
                >
                  <i className={`ti ${meta.icon} text-white`} style={{ fontSize: 16 }} aria-hidden="true" />
                </span>
                <span className="text-xs font-semibold text-primary">{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 mb-4">
          <TextInput
            label={`${ACCOUNT_TYPE_META[type].label} account name`}
            value={name}
            onChange={setName}
            placeholder={`e.g. HDFC ${ACCOUNT_TYPE_META[type].label}`}
          />
          <TextInput
            label="Opening balance (optional)"
            type="number"
            value={openingBalance}
            onChange={setOpeningBalance}
            placeholder="0"
          />
        </div>

        <p className="text-[10px] text-tertiary mb-6 flex items-start gap-1 leading-relaxed">
          <i className="ti ti-device-mobile mt-0.5 flex-shrink-0" style={{ fontSize: 11 }} aria-hidden="true" />
          <span>
            Account names and balances are encrypted on-device — never sent anywhere, even in a backup, unless you
            enable one.
          </span>
        </p>

        <div className="mt-auto flex flex-col gap-2.5">
          <Button variant="secondary" fullWidth onClick={handleAddAnother} disabled={!name.trim()}>
            Add another account
          </Button>
          <Button variant="primary" size="lg" fullWidth onClick={handleContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
