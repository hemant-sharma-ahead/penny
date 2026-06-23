# Penny — Component Library Guide

Use this when building UI. All shared components live in `src/components/ui/`. Always use these instead of writing inline Tailwind.

---

## Available components

### `Card`
```tsx
import { Card } from '@/components/ui';

<Card padding="md" onClick={handleClick}>
  {/* content */}
</Card>
```
Props: `padding?: 'sm' | 'md' | 'lg'` (default `md`), `onClick?`, `className?` (layout overrides only — never styling).

### `Modal`
```tsx
import { Modal } from '@/components/ui';

<Modal isOpen={isOpen} onClose={onClose} title="Add Expense" footer={<Button ...>Save</Button>}>
  {/* form content */}
</Modal>
```
Props: `isOpen`, `onClose`, `title?`, `children`, `footer?`, `size?: 'sm' | 'md' | 'lg'` (default `md`).

The Modal handles centring between the header and bottom nav automatically — it applies `paddingTop: 56, paddingBottom: 72` on the overlay. Never recreate this manually.

### `Button`
```tsx
import { Button } from '@/components/ui';

<Button variant="primary" onClick={handleSave} loading={isSaving}>Save</Button>
<Button variant="danger" onClick={handleDelete} icon="trash">Delete</Button>
<Button variant="ghost" onClick={onClose}>Cancel</Button>
```
Props: `variant: 'primary' | 'secondary' | 'danger' | 'ghost'`, `size?: 'sm' | 'md' | 'lg'`, `icon?` (Tabler icon name), `loading?`, `disabled?`, `fullWidth?`.

### `ConfirmDialog`
```tsx
import { ConfirmDialog } from '@/components/ui';

<ConfirmDialog
  isOpen={confirmOpen}
  onClose={() => setConfirmOpen(false)}
  onConfirm={handleDelete}
  title="Delete expense?"
  message="This cannot be undone."
  confirmLabel="Delete"
  confirmVariant="danger"
/>
```
Always use for destructive actions. Never show a plain `window.confirm()`.

### `TextInput`
```tsx
import { TextInput } from '@/components/ui';

<TextInput
  label="Amount"
  value={amount}
  onChange={setAmount}
  type="number"
  inputMode="decimal"
  prefix="₹"
  error={errors.amount}
/>
```
Handles label, error state, prefix/suffix, and `input-surface` styling internally.

### `FormField`
```tsx
import { FormField } from '@/components/ui';

<FormField label="Category" required error={errors.category} hint="Choose the closest match">
  <select className="input-surface ...">
    {/* options */}
  </select>
</FormField>
```
Use when the child is a custom control (select, date picker, custom input) that can't use `TextInput`.

### `SegmentedControl`
```tsx
import { SegmentedControl } from '@/components/ui';

<SegmentedControl
  options={[
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
    { value: 'transfer', label: 'Transfer' },
  ]}
  value={type}
  onChange={setType}
/>
```

### `Badge`
```tsx
import { Badge } from '@/components/ui';

<Badge label="Active" color="green" variant="subtle" />
<Badge label="Overdue" color="red" variant="solid" />
```

### `EmptyState`
```tsx
import { EmptyState } from '@/components/ui';

<EmptyState
  icon="wallet"
  title="No expenses yet"
  description="Tap + to add your first expense"
  action={<Button variant="primary" onClick={openForm}>Add Expense</Button>}
/>
```

### `SectionHeader`
```tsx
import { SectionHeader } from '@/components/ui';

<SectionHeader title="This Month" subtitle="June 2026" action={<Button variant="ghost">See all</Button>} />
```

### `IconChip`
```tsx
import { IconChip } from '@/components/ui';

<IconChip icon="shopping-cart" label="Shopping" selected={selected} onClick={handleSelect} color="blue" />
```
Used for category chips, filter chips, and tag chips.

---

## Privacy components

### `MaskedValue`
```tsx
import { MaskedValue } from '@/components/privacy/MaskedValue';

<MaskedValue value={formatCurrency(expense.amount)} />
```
Shows `••••` in safe/privacy mode, actual value in open mode. Always wrap financial amounts with this.

### `PrivacyAwareText`
```tsx
import { PrivacyAwareText } from '@/components/privacy/PrivacyAwareText';

<PrivacyAwareText
  value={account.name}
  sensitivityLevel="medium"
  fallback="Account"
/>
```
Use for non-numeric values that should still be masked (account names, merchant names).

---

## Hooks

### `useDisclosure`
```ts
import { useDisclosure } from '@/hooks/useDisclosure';

const { isOpen, open, close, toggle } = useDisclosure();
```
Replaces all `useState(false)` modal toggle patterns.

### `useAsync`
```ts
import { useAsync } from '@/hooks/useAsync';

const { data, loading, error, run } = useAsync(async () => {
  return await expensesRepo.getAll();
});
```

---

## The rules

1. **Never recreate these inline.** If you find yourself writing `fixed inset-0 z-60 flex items-center justify-center`, use `<Modal>` instead.

2. **Never pass Tailwind to primitives.** Components accept `className` only for layout (margin, width, grid span) — never for colours, padding, or border-radius.

3. **Semantic tokens inside components.** Inside `Card.tsx`, `Modal.tsx`, etc., always use `bg-surface`, `text-primary`, etc. — never `bg-white`, `text-gray-900`.

4. **React Native portability.** Props must be semantic so a RN version can swap the rendering without changing call sites. Example: `variant="primary"` not `className="bg-green-600"`.

5. **Check `src/components/ui/index.ts`** to see what's exported before looking for alternatives.

---

## When a component doesn't exist yet

If you need a pattern that isn't in `src/components/ui/`, create it there before using it. Apply the same rules: semantic tokens, typed props, no Tailwind in feature files.
