import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banner, Button, ListContainer, PageHeader, SectionLabel, Toggle } from '@/components/ui';
import { useRepository } from '@/hooks/useRepository';
import { notifyAccountsChanged, notifyCategoriesChanged, notifyTagsChanged } from '@/hooks/useDataRefresh';
import { accountsRepo, expenseCategoriesRepo, hashtagsRepo } from '@/core/db/repositories';
import { INTENT_GROUP_META } from '@/core/db/defaultCategories';
import { buildParentCategoryMap, groupKey, isHiddenInSafeMode } from '@/core/expenses/categoryGroups';
import { useSettings, type SafeModeVisibility } from '@/context/SettingsContext';
import type { ExpenseCategory } from '@/core/db/types';

interface ModuleToggleDef {
  key: keyof SafeModeVisibility;
  label: string;
  icon: string;
}

const MODULE_TOGGLES: ModuleToggleDef[] = [
  { key: 'loans', label: 'Loans', icon: 'ti-file-invoice' },
  { key: 'iou', label: 'IOU (lent / borrowed)', icon: 'ti-users' },
  { key: 'portfolio', label: 'Portfolio', icon: 'ti-chart-pie' },
  { key: 'goals', label: 'Goals', icon: 'ti-target' },
  { key: 'insurance', label: 'Insurance', icon: 'ti-shield' },
  { key: 'subscriptions', label: 'Subscriptions', icon: 'ti-refresh' }
];

interface RenderedGroup {
  key: string;
  label: string;
  color: string;
  cats: ExpenseCategory[];
}

/** Icon-tile + label + trailing Toggle — the row shape for a single sensitivity switch. */
function ToggleRow({
  icon,
  iconColor,
  label,
  value,
  onChange
}: {
  icon: string;
  iconColor?: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span
        className="w-8 h-8 rounded-[9px] grid place-items-center flex-shrink-0"
        style={{ backgroundColor: iconColor ?? 'var(--color-text-tertiary)' }}
      >
        <i className={`ti ${icon}`} style={{ fontSize: 14, color: '#fff' }} aria-hidden="true" />
      </span>
      <span className="flex-1 min-w-0 text-sm font-medium text-primary truncate">{label}</span>
      <Toggle value={value} onChange={onChange} aria-label={`Hide ${label} in Safe Mode`} />
    </div>
  );
}

export function SafeModeSettingsPage() {
  const navigate = useNavigate();
  const { safeModeVisibility, setSafeModeVisibility } = useSettings();
  const { items: categories, save: saveCategory, loading: categoriesLoading } = useRepository(expenseCategoriesRepo);
  const { items: accounts, save: saveAccount, loading: accountsLoading } = useRepository(accountsRepo);
  const { items: hashtags, save: saveHashtag, loading: hashtagsLoading } = useRepository(hashtagsRepo);
  const sortedHashtags = useMemo(() => [...hashtags].sort((a, b) => b.usageCount - a.usageCount), [hashtags]);

  const parentCategoryMap = useMemo(() => buildParentCategoryMap(categories), [categories]);

  const groups = useMemo<RenderedGroup[]>(() => {
    const leafCats = categories.filter((c) => !c.isGroup);
    const byKey = new Map<string, ExpenseCategory[]>();
    for (const cat of leafCats) {
      const key = groupKey(cat);
      const arr = byKey.get(key);
      if (arr) arr.push(cat);
      else byKey.set(key, [cat]);
    }
    const ordered: RenderedGroup[] = [];
    for (const [key, meta] of Object.entries(INTENT_GROUP_META)) {
      const cats = byKey.get(key);
      if (cats?.length) ordered.push({ key, label: meta.label, color: meta.color, cats });
    }
    for (const parent of parentCategoryMap.values()) {
      const cats = byKey.get(parent.id);
      if (cats?.length) ordered.push({ key: parent.id, label: parent.name, color: parent.color, cats });
    }
    return ordered;
  }, [categories, parentCategoryMap]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Safe Mode"
        leading={
          <Button
            variant="ghost"
            icon="ti-arrow-left"
            aria-label="Back"
            className="w-8 h-8 rounded-lg hover:text-primary"
            onClick={() => navigate(-1)}
          />
        }
      />

      <div className="px-4 py-4 flex flex-col gap-4 flex-1">
        <Banner variant="info">
          Safe Mode shows your everyday numbers so you can check things at a glance in public — toggle on the accounts,
          categories, and modules you'd rather keep hidden there. Everyday spending stays visible by default; income,
          transfers, family support, legal, sin goods, and investments default to hidden. Privacy Mode always hides
          everything; Open Mode always shows everything — these toggles only change what Safe Mode does.
        </Banner>

        <div>
          <SectionLabel>Accounts</SectionLabel>
          {accountsLoading ? (
            <p className="text-xs text-tertiary">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="text-xs text-tertiary">No accounts yet.</p>
          ) : (
            <ListContainer>
              {accounts.map((acc) => (
                <ToggleRow
                  key={acc.id}
                  icon={acc.icon}
                  iconColor={acc.color}
                  label={acc.name}
                  value={!!acc.hideInSafeMode}
                  onChange={(hidden) =>
                    void saveAccount({ ...acc, hideInSafeMode: hidden }).then(notifyAccountsChanged)
                  }
                />
              ))}
            </ListContainer>
          )}
        </div>

        <div>
          <SectionLabel>Tags</SectionLabel>
          <p className="text-xs text-secondary -mt-1 mb-2">
            Independent of a tag's "Set aside" classification (Manage Tags) — a tag can be hidden here without being
            excluded from your daily-living total, or vice versa.
          </p>
          {hashtagsLoading ? (
            <p className="text-xs text-tertiary">Loading…</p>
          ) : sortedHashtags.length === 0 ? (
            <p className="text-xs text-tertiary">No tags yet.</p>
          ) : (
            <ListContainer>
              {sortedHashtags.map((h) => (
                <ToggleRow
                  key={h.id}
                  icon="ti-hash"
                  iconColor="#ec4899"
                  label={h.name}
                  value={!!h.hideInSafeMode}
                  onChange={(hidden) => void saveHashtag({ ...h, hideInSafeMode: hidden }).then(notifyTagsChanged)}
                />
              ))}
            </ListContainer>
          )}
        </div>

        <div>
          <SectionLabel>Other modules</SectionLabel>
          <ListContainer>
            {MODULE_TOGGLES.map((m) => (
              <ToggleRow
                key={m.key}
                icon={m.icon}
                label={m.label}
                value={!safeModeVisibility[m.key]}
                onChange={(hidden) => setSafeModeVisibility(m.key, !hidden)}
              />
            ))}
          </ListContainer>
        </div>

        <div>
          <SectionLabel>Expense &amp; income categories</SectionLabel>
          <p className="text-xs text-secondary -mt-1 mb-2">
            Hiding a category hides it everywhere — transactions and budgets. Everyday spending stays visible by
            default; income, transfers, family &amp; giving, legal, sin goods, and financial default to hidden.
          </p>
          {categoriesLoading ? (
            <p className="text-xs text-tertiary">Loading…</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: g.color }}>
                      {g.label}
                    </span>
                  </div>
                  <ListContainer>
                    {g.cats.map((cat) => (
                      <ToggleRow
                        key={cat.id}
                        icon={cat.icon}
                        iconColor={cat.color}
                        label={cat.name}
                        value={isHiddenInSafeMode(cat)}
                        onChange={(hidden) =>
                          void saveCategory({ ...cat, hideInSafeMode: hidden }).then(notifyCategoriesChanged)
                        }
                      />
                    ))}
                  </ListContainer>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
