# Penny — Adding a Feature Module

Use this when adding a new feature module (a new section of the app) from scratch.

---

## The target structure

Every feature module must follow this exact three-layer pattern. Read `penny-standards.md` for the full rationale.

```
src/features/{name}/
  use{Name}.ts          ← Layer 2: ALL state + data fetching + mutations
  {Name}Page.tsx        ← Layer 3: thin UI (≤400 lines)
  {Name}Form.tsx        ← Layer 3: thin form (≤200 lines)

src/core/{domain}/
  {name}Calculator.ts   ← Layer 1: pure calculations (100% RN-portable)
  {name}Utils.ts        ← Layer 1: pure utilities (domain-specific helpers)
```

**Never put calculations or data fetching in a Page or Form component.**

**Multi-domain features** (a page hosting several independent sub-domains, e.g. Portfolio's asset
categories + IPO) use the **vertical-slice** variant: the page is a thin housing/router and each
sub-domain is a self-contained folder (cards + section + modal + fields + class hooks/helpers
co-located), with a `shared/` folder for only what ≥2 slices use. See "Vertical slices for
multi-domain pages" in `penny-standards.md`, and `src/features/portfolio/` as the reference.

---

## Checklist

### 1. Read before touching code

- Check `docs/features/` — does a doc for this feature exist? If yes, read it fully.
- Check `docs/SCHEMA.md` — does the required Dexie store exist? If not, you'll need to add one.
- Check `docs/ROADMAP.md` — is this feature planned for a specific phase? Don't jump ahead.
- Run `penny-standards` — ensure all non-negotiables are fresh in mind.

### 2. Dexie store (if new)

Add the new store to `src/core/db/schema.ts`:

```ts
// Add to PennyDatabase class
newStore: Table<NewStoreType, string>;

// Add to schema version (bump minor version)
.version(N).stores({
  existing_store: '...existing...',
  new_store: 'id, fieldToIndex, ...',
});
```

Add the TypeScript interface to `src/core/db/types/index.ts`.

Add a repository instance to `src/core/db/repositories.ts`:

```ts
export const newStoreRepo = new EncryptedRepository<NewStoreType>(
  db.newStore,
  ['sensitiveField1', 'sensitiveField2'] // fields to encrypt
);
```

All primary keys must be UUIDs (not auto-increment — sync-readiness). Use `crypto.randomUUID()`.

### 3. File structure

Create `src/features/{moduleName}/`:

```
src/features/{moduleName}/
  {ModuleName}Page.tsx        ← route-level component, owns layout
  {ModuleName}Form.tsx        ← add/edit form (opens as Modal)
  use{ModuleName}.ts          ← all data fetching + mutations for this feature
  types.ts                    ← feature-local types (if not already in core/db/types)
```

Do not create sub-folders unless the feature is large enough to warrant it.

### 4. Route wiring

Add the route to `src/router/index.tsx`:

```tsx
{
  path: '/app/new-module',
  element: <AuthGuard><NewModulePage /></AuthGuard>,
}
```

If accessible from the bottom nav, add a nav item in the appropriate bottom nav component.

### 5. Page component pattern

```tsx
// {ModuleName}Page.tsx
export function NewModulePage() {
  const { items, isLoading, createItem, updateItem, deleteItem } = useNewModule();
  const disclosure = useDisclosure();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h1 className="text-primary font-semibold text-lg">Module Name</h1>
        <Button variant="ghost" icon="plus" onClick={disclosure.open} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-secondary text-sm">Loading...</span>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon="icon-name" title="No items yet" description="Add your first item" />
      ) : (
        <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
          {items.map((item) => (
            <Card key={item.id} onClick={() => handleEdit(item)}>
              {/* card content */}
            </Card>
          ))}
        </div>
      )}

      {/* FAB or add button */}
      <NewModuleForm isOpen={disclosure.isOpen} onClose={disclosure.close} />
    </div>
  );
}
```

### 6. Hook pattern

```ts
// use{ModuleName}.ts
export function useNewModule() {
  const [items, setItems] = useState<NewItemType[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    newStoreRepo.getAll().then((data) => {
      setItems(data);
      setIsLoading(false);
    });
  }, []);

  const createItem = useCallback(async (data: Omit<NewItemType, 'id'>) => {
    const item: NewItemType = { id: crypto.randomUUID(), ...data };
    await newStoreRepo.add(item);
    setItems((prev) => [item, ...prev]);
    return item;
  }, []);

  // ... updateItem, deleteItem

  return { items, isLoading, createItem, updateItem, deleteItem };
}
```

### 7. Privacy layer

Wrap any amounts or sensitive fields with `<MaskedValue>`:

```tsx
import { MaskedValue } from '@/components/privacy/MaskedValue';
<MaskedValue value={formatCurrency(item.amount)} />;
```

Use `usePrivacy()` to check the current mode if you need conditional rendering.

### 8. Activity log (Timeline)

Log user-initiated mutations so they appear in the **Timeline** (Undo, Recently Deleted, history, streaks).
Log at the **hook/intent layer** — never inside the generic repository (that would also capture seeding,
migrations, and price-cache writes).

**Simplest path** — if your module uses `useRepository`, swap it for `useLoggedRepository`; you get
CREATE/UPDATE logging plus a DELETE Undo toast for free:

```ts
const { items, save, remove } = useLoggedRepository(myThingRepo, {
  entityType: 'myThing',
  summarize: (t) => `myThing: ${t.name}`,
  diffFields: ['name', 'amount'] // optional — powers beautiful diffs on UPDATE
});
```

Also register `myThing → myThingRepo.put` in `src/core/db/entityRegistry.ts` so Undo can restore it.

**Compound/bulk flows** — call `logActivity` directly (it returns the new id for Undo wiring):

```ts
const logId = logActivity({
  action: 'DELETE',
  entityType: 'myThing',
  entityId: item.id,
  summary: `Deleted myThing: ${item.name}`,
  snapshot: JSON.stringify(item) // enables restore
});
showToast({
  message: `Deleted ${item.name}`,
  actionLabel: 'Undo',
  onAction: async () => {
    await restoreActivity(logId);
    reload();
  }
});
```

Do **not** log system/side-effect writes (seeding, migrations, price cache, hashtags).

### 9. Demo data

If the feature has realistic sample data, add it to `src/core/db/seedDemoData.ts`. Keep amounts realistic for an Indian urban professional.

### 10. Feature documentation

Create `docs/features/{moduleName}.md` using the standard template in `docs/README.md`. Fill in all sections, especially "Planned improvements" and "Ideas welcome".

---

## What NOT to do

- Do not import from another `src/features/` folder
- Do not import `dexie` directly — use the repository
- Do not access `window.crypto.subtle` directly — only `src/core/crypto/`
- Do not use raw Tailwind colours — only semantic tokens
- Do not add a bottom sheet — modals are always centred
