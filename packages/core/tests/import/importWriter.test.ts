import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db/schema';
import { activityLogRepo, expensesRepo } from '@/core/db/repositories';
import { restoreActivity, subscribeActivity } from '@/core/db/activityLog';
import { deriveKey, generateSalt } from '@/core/crypto/engine';
import { keystore } from '@/core/crypto/keystore';
import {
  writeImportBatch,
  writeImportBatchDetailed,
  undoImportBatch,
  restoreUndoneImport
} from '@/core/import/importWriter';
import { applyConfirmedTransferPairs, type ResolvedPreviewRow } from '@/core/import/importPipeline';
import type { TransferPair } from '@/core/import/importTransferPairing';
import { computeBalance } from '@/core/accounts/balanceCalculator';

async function setupKeystore() {
  keystore.setMasterKey(await deriveKey('test-passphrase', generateSalt(), 1_000));
  await db.expenses.clear();
  await db.activity_log.clear();
  // 2026-08-20 (item 45 real-device testing pass): writeRows() now also upserts into
  // merchant_memory (see importWriter.ts). Each test derives a brand-new random master key, so any
  // row left over from a previous test — encrypted under that test's own now-discarded key — would
  // fail to decrypt here with a "Cipher job failed" error the moment `writeRows` reads it back via
  // `merchantMemoryRepo.getAll()`.
  await db.merchant_memory.clear();
}

function row(overrides: Partial<ResolvedPreviewRow> = {}): ResolvedPreviewRow {
  return {
    date: 1_700_000_000_000,
    amount: 100,
    description: 'Coffee',
    type: 'expense',
    hashtags: [],
    categoryId: 'cat-food',
    categoryName: 'Dining & Café',
    accountId: 'acc-1',
    skipped: false,
    duplicate: false,
    sourceRef: 'ref-1',
    ...overrides
  };
}

describe('writeImportBatch', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  it('writes each ready row and returns the count + an activity log id', async () => {
    const result = await writeImportBatch([row(), row({ sourceRef: 'ref-2', description: 'Tea' })]);
    expect(result.succeededCount).toBe(2);
    expect(result.failed).toHaveLength(0);
    expect(result.activityLogId).not.toBeNull();

    const all = await expensesRepo.getAll();
    expect(all.filter((e) => e.source === 'import')).toHaveLength(2);
  });

  it('excludes duplicate and skipped rows from being written', async () => {
    const result = await writeImportBatch([
      row({ duplicate: true }),
      row({ skipped: true, sourceRef: 'ref-3' }),
      row({ sourceRef: 'ref-4' })
    ]);
    expect(result.succeededCount).toBe(1);
    expect(result.activityLogId).not.toBeNull();
  });

  it('returns a null activityLogId when nothing was written', async () => {
    const result = await writeImportBatch([row({ duplicate: true })]);
    expect(result.succeededCount).toBe(0);
    expect(result.activityLogId).toBeNull();
  });
});

describe('writeImportBatch — confirmed transfer pair regression (real balance-accuracy bug)', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  it('writes a confirmed transfer pair as ONE row, and computeBalance debits one account and credits the other', async () => {
    // The bug: writing both legs of a transfer as independent expense/income rows debited BOTH
    // accounts by `amount` instead of debiting the source and crediting the destination. This test
    // guards against the regression by actually calling computeBalance() after the write, not just
    // asserting row count.
    const outgoing = row({ accountId: 'acc-hdfc', type: 'expense', amount: 5000, sourceRef: 'ref-out' });
    const incoming = row({
      accountId: 'acc-cash',
      type: 'income',
      amount: 5000,
      description: 'Cash withdrawal',
      sourceRef: 'ref-in'
    });
    const pairs: TransferPair[] = [
      {
        outgoingIndex: 0,
        incomingIndex: 1,
        fromAccount: 'HDFC1234',
        toAccount: 'Cash',
        amount: 5000,
        date: outgoing.date
      }
    ];
    const merged = applyConfirmedTransferPairs([outgoing, incoming], pairs);

    const result = await writeImportBatch(merged);
    expect(result.succeededCount).toBe(1);

    const all = await expensesRepo.getAll();
    const written = all.filter((e) => e.source === 'import');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      type: 'transfer',
      accountId: 'acc-hdfc',
      toAccountId: 'acc-cash',
      amount: 5000
    });

    const hdfcBalance = computeBalance('acc-hdfc', 10_000, written);
    const cashBalance = computeBalance('acc-cash', 10_000, written);
    expect(hdfcBalance).toBe(5_000); // debited
    expect(cashBalance).toBe(15_000); // credited
  });
});

describe('writeImportBatchDetailed', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  // 2026-08-14 (manual-testing investigation — "no IMPORT entry appeared in Timeline") — traced the
  // write path itself here (real import, at least one genuinely ready/succeeding row, exactly as asked):
  // it's correct — an activity-log entry IS created and DOES notify `subscribeActivity` subscribers.
  // The actual root cause was on the READ side (`apps/mobile/src/features/activity/useActivityLog.ts`
  // never subscribed to this signal, so an already-mounted Timeline never re-fetched) — fixed separately;
  // this test closes the loop on the write-path half of that investigation.
  it('a real import with at least one succeeding row logs an IMPORT entry AND notifies subscribeActivity', async () => {
    const seen: { action: string; entityCount?: number }[] = [];
    const unsub = subscribeActivity((e) => seen.push({ action: e.action, entityCount: e.entityCount }));

    const detailed = await writeImportBatchDetailed([
      row({ sourceRef: 'ref-timeline-1' }),
      row({ sourceRef: 'ref-timeline-2', description: 'Tea' })
    ]);

    expect(detailed.succeededCount).toBe(2);
    expect(detailed.activityLogId).not.toBeNull();
    expect(seen).toEqual([{ action: 'IMPORT', entityCount: 2 }]);

    const logged = detailed.activityLogId ? await activityLogRepo.get(detailed.activityLogId) : null;
    expect(logged?.action).toBe('IMPORT');

    unsub();
  });

  it('behaves identically to writeImportBatch for count/failed/activityLogId', async () => {
    const rows = [row(), row({ sourceRef: 'ref-detailed-2', description: 'Tea' })];
    const detailed = await writeImportBatchDetailed(rows);
    expect(detailed.succeededCount).toBe(2);
    expect(detailed.failed).toHaveLength(0);
    expect(detailed.activityLogId).not.toBeNull();
  });

  it('also returns each succeeded row paired with its newly-created expense id', async () => {
    const rows = [row({ sourceRef: 'ref-detailed-3' }), row({ sourceRef: 'ref-detailed-4', description: 'Tea' })];
    const detailed = await writeImportBatchDetailed(rows);
    expect(detailed.succeededRows).toHaveLength(2);
    const ids = detailed.succeededRows.map((r) => r.expenseId);
    expect(new Set(ids).size).toBe(2); // distinct ids
    const all = await expensesRepo.getAll();
    for (const { expenseId, row: r } of detailed.succeededRows) {
      const written = all.find((e) => e.id === expenseId);
      expect(written?.description).toBe(r.description);
    }
  });

  it('excludes duplicate/skipped rows from succeededRows too', async () => {
    const detailed = await writeImportBatchDetailed([
      row({ duplicate: true, sourceRef: 'ref-detailed-5' }),
      row({ skipped: true, sourceRef: 'ref-detailed-6' })
    ]);
    expect(detailed.succeededRows).toHaveLength(0);
    expect(detailed.succeededCount).toBe(0);
  });

  // 2026-08-14 (Import Progress screen, redesign §14 item 8) — live progress + cancellation, additive to
  // this one function only; `writeImportBatch` never passes `options` so its behavior is provably
  // untouched (covered by the "behaves identically" test above, still passing unchanged).
  it('writeImportBatch (no options param at all) never gains a cancelled field — behavior provably untouched', async () => {
    const detailed = await writeImportBatch([row({ sourceRef: 'ref-progress-0' })]);
    expect(detailed).not.toHaveProperty('cancelled');
  });

  it('excludes duplicate/skipped rows from the progress total — they were never going to be written', async () => {
    const seen: Array<[number, number]> = [];
    await writeImportBatchDetailed(
      [
        row({ duplicate: true, sourceRef: 'ref-progress-1' }),
        row({ sourceRef: 'ref-progress-2' }),
        row({ skipped: true, sourceRef: 'ref-progress-3' }),
        row({ sourceRef: 'ref-progress-4', description: 'Tea' })
      ],
      { onProgress: (completed, total) => seen.push([completed, total]) }
    );
    // Total is 2 (the two writable rows), not 4 — every reported total agrees.
    expect(seen.every(([, total]) => total === 2)).toBe(true);
    expect(seen.at(-1)).toEqual([2, 2]);
  });

  it('stops writing further rows once shouldCancel returns true, leaving already-written rows in place', async () => {
    let calls = 0;
    const detailed = await writeImportBatchDetailed(
      [
        row({ sourceRef: 'ref-cancel-1' }),
        row({ sourceRef: 'ref-cancel-2', description: 'Tea' }),
        row({ sourceRef: 'ref-cancel-3', description: 'Snacks' })
      ],
      {
        shouldCancel: () => {
          calls++;
          return calls > 1; // let the first row through, then cancel before the second
        }
      }
    );
    expect(detailed.cancelled).toBe(true);
    expect(detailed.succeededCount).toBe(1);
    const all = await expensesRepo.getAll();
    expect(all.filter((e) => e.source === 'import')).toHaveLength(1);
  });

  it('never sets cancelled when the loop runs to completion untouched', async () => {
    const detailed = await writeImportBatchDetailed([row({ sourceRef: 'ref-nocancel-1' })], {
      shouldCancel: () => false
    });
    expect(detailed.cancelled).toBe(false);
    expect(detailed.succeededCount).toBe(1);
  });

  // Verification-round hardening (2026-08-14) — a caller's own `onProgress`/`shouldCancel` must never be
  // able to truncate the write loop or escape this function just because ITS OWN code has a bug. Found
  // as a real, if lower-severity, sibling of the "importPhase gets stuck forever" bug the same round's
  // coordinator caught at the `commitAndImport()` call-site level.
  it('keeps writing every row even when onProgress throws on every call', async () => {
    const detailed = await writeImportBatchDetailed(
      [
        row({ sourceRef: 'ref-throwing-progress-1' }),
        row({ sourceRef: 'ref-throwing-progress-2', description: 'Tea' }),
        row({ sourceRef: 'ref-throwing-progress-3', description: 'Snacks' })
      ],
      {
        onProgress: () => {
          throw new Error('boom — a buggy UI callback');
        }
      }
    );
    expect(detailed.succeededCount).toBe(3);
    expect(detailed.cancelled).toBe(false);
  });

  it('keeps writing every row even when shouldCancel throws on every call (never itself stops the loop)', async () => {
    const detailed = await writeImportBatchDetailed(
      [row({ sourceRef: 'ref-throwing-cancel-1' }), row({ sourceRef: 'ref-throwing-cancel-2', description: 'Tea' })],
      {
        shouldCancel: () => {
          throw new Error('boom — a buggy UI callback');
        }
      }
    );
    expect(detailed.succeededCount).toBe(2);
    expect(detailed.cancelled).toBe(false);
  });
});

describe('undoImportBatch', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  it('deletes every expense created by the batch and returns the count', async () => {
    const written = await writeImportBatch([
      row({ sourceRef: 'ref-undo-1' }),
      row({ sourceRef: 'ref-undo-2', description: 'Tea' })
    ]);
    const beforeCount = (await expensesRepo.getAll()).length;
    expect(beforeCount).toBeGreaterThanOrEqual(2);
    expect(written.activityLogId).not.toBeNull();

    const deleted = await undoImportBatch(written.activityLogId ?? '');
    expect(deleted).toBe(2);

    const remaining = await expensesRepo.getAll();
    expect(remaining.filter((e) => e.source === 'import' && e.description === 'Coffee')).toHaveLength(0);
  });

  it('is a no-op the second time (entry already marked restored)', async () => {
    const written = await writeImportBatch([row({ sourceRef: 'ref-undo-3' })]);
    expect(written.activityLogId).not.toBeNull();
    const logId = written.activityLogId ?? '';
    await undoImportBatch(logId);
    const secondCall = await undoImportBatch(logId);
    expect(secondCall).toBe(0);
  });

  it('returns 0 for an unknown activity log id', async () => {
    expect(await undoImportBatch('does-not-exist')).toBe(0);
  });

  it('logs a NEW dated UNDO_IMPORT entry carrying the full deleted records — the original IMPORT entry is marked restored but never mutated into looking like the undo itself', async () => {
    const written = await writeImportBatch([
      row({ sourceRef: 'ref-undo-4' }),
      row({ sourceRef: 'ref-undo-5', description: 'Tea' })
    ]);
    expect(written.activityLogId).not.toBeNull();
    const importLogId = written.activityLogId ?? '';

    await undoImportBatch(importLogId);

    const all = await activityLogRepo.getAll();
    const importEntry = all.find((e) => e.id === importLogId);
    const undoEntry = all.find((e) => e.action === 'UNDO_IMPORT');

    // The original entry is still an IMPORT entry, just restored — never rewritten into an "undo" entry.
    expect(importEntry?.action).toBe('IMPORT');
    expect(importEntry?.restored).toBe(true);

    // A separate, new entry records the undo itself, today, with its own summary/count/snapshot.
    expect(undoEntry).toBeDefined();
    expect(undoEntry?.entityCount).toBe(2);
    expect(undoEntry?.summary).toContain('Undid import');
    const snapshot = JSON.parse(undoEntry?.snapshot ?? '[]') as Array<{ description: string }>;
    expect(snapshot.map((e) => e.description).sort()).toEqual(['Coffee', 'Tea']);

    // The two entries are linked both ways.
    expect(importEntry?.relatedLogId).toBe(undoEntry?.id);
    expect(undoEntry?.relatedLogId).toBe(importLogId);
  });

  it('the new UNDO_IMPORT entry snapshot restores the actual deleted expenses via the generic restoreActivity/entityRegistry path (real, full records — not just ids)', async () => {
    const written = await writeImportBatch([row({ sourceRef: 'ref-undo-6', description: 'Groceries' })]);
    expect(written.activityLogId).not.toBeNull();
    await undoImportBatch(written.activityLogId ?? '');

    expect((await expensesRepo.getAll()).filter((e) => e.description === 'Groceries')).toHaveLength(0);

    const undoEntry = (await activityLogRepo.getAll()).find((e) => e.action === 'UNDO_IMPORT');
    expect(undoEntry).toBeDefined();
    const ok = await restoreActivity(undoEntry?.id ?? '');
    expect(ok).toBe(true);
    expect((await expensesRepo.getAll()).filter((e) => e.description === 'Groceries')).toHaveLength(1);
  });
});

describe('restoreUndoneImport', () => {
  beforeEach(async () => {
    await setupKeystore();
  });

  it('restores every expense the undo removed AND flips the original IMPORT entry back to not-restored, so it can be undone again', async () => {
    const written = await writeImportBatch([
      row({ sourceRef: 'ref-redo-1' }),
      row({ sourceRef: 'ref-redo-2', description: 'Tea' })
    ]);
    expect(written.activityLogId).not.toBeNull();
    const importLogId = written.activityLogId ?? '';
    await undoImportBatch(importLogId);
    expect((await expensesRepo.getAll()).length).toBe(0);
    const undoEntry = (await activityLogRepo.getAll()).find((e) => e.action === 'UNDO_IMPORT');
    expect(undoEntry).toBeDefined();

    const ok = await restoreUndoneImport(undoEntry?.id ?? '');
    expect(ok).toBe(true);

    // The two original expenses are back.
    expect((await expensesRepo.getAll()).map((e) => e.description).sort()).toEqual(['Coffee', 'Tea']);

    // The original IMPORT entry is undoable again (restored flipped back to false) — symmetric with the
    // very first undo, so the whole batch isn't left in a dead-end state.
    const importEntry = await activityLogRepo.get(importLogId);
    expect(importEntry?.restored).toBe(false);

    // And undoing it a second time works exactly like the first.
    const deletedAgain = await undoImportBatch(importLogId);
    expect(deletedAgain).toBe(2);
    expect((await expensesRepo.getAll()).length).toBe(0);
  });

  it('returns false for an unknown/already-restored entry, per the underlying restoreActivity guard', async () => {
    expect(await restoreUndoneImport('does-not-exist')).toBe(false);
  });
});
