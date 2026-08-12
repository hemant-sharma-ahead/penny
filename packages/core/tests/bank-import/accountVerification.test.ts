import { describe, expect, it } from 'vitest';
import { computeAccountVerificationStatus } from '@/core/bank-import/accountVerification';
import type { BankStatementImportRecord, Expense } from '@/core/db/types';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day).getTime();
const ACCOUNT = 'acc-1';
const OPENING = 50_000;

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'e',
    amount: 0,
    categoryId: 'cat',
    description: '',
    date: d(2026, 4, 1),
    hashtags: [],
    isRecurring: false,
    type: 'expense',
    accountId: ACCOUNT,
    createdAt: 0,
    updatedAt: 0,
    ...overrides
  };
}

const NO_GAPS_PARAMS = {
  accountId: ACCOUNT,
  openingBalance: OPENING,
  accountTxns: [] as Expense[],
  importRecords: [] as BankStatementImportRecord[],
  coveredRanges: []
};

describe('computeAccountVerificationStatus — clean account', () => {
  it('no findings ⇒ no badge', () => {
    const status = computeAccountVerificationStatus(NO_GAPS_PARAMS);
    expect(status.needsAttention).toBe(false);
    expect(status.activeFinding).toBeUndefined();
    expect(status.allFindings).toHaveLength(0);
  });
});

describe('computeAccountVerificationStatus — checkpoint mismatch only', () => {
  it('surfaces the checkpoint-mismatch finding', () => {
    const accountTxns = [
      expense({ id: 'a', amount: 1000, type: 'income', date: d(2026, 4, 1), statementBalance: OPENING + 1000 }),
      expense({ id: 'b', amount: 500, type: 'income', date: d(2026, 4, 5), statementBalance: OPENING + 2000 }) // off by 500
    ];
    const status = computeAccountVerificationStatus({ ...NO_GAPS_PARAMS, accountTxns });
    expect(status.needsAttention).toBe(true);
    expect(status.activeFinding?.kind).toBe('checkpoint-mismatch');
    expect(status.activeFinding?.checkpointMismatch?.signature).toBe('steps-partway');
  });
});

describe('computeAccountVerificationStatus — standing gap only', () => {
  it('surfaces the standing-gap finding when a covered range has an unlinked expense', () => {
    const accountTxns = [expense({ id: 'gap-1', date: d(2026, 4, 10) })];
    const status = computeAccountVerificationStatus({
      ...NO_GAPS_PARAMS,
      accountTxns,
      coveredRanges: [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      importRecords: [] // nothing links 'gap-1'
    });
    expect(status.needsAttention).toBe(true);
    expect(status.activeFinding?.kind).toBe('standing-gap');
    expect(status.activeFinding?.standingGapExpenses?.map((e) => e.id)).toEqual(['gap-1']);
  });
});

describe('computeAccountVerificationStatus — a batch that just fully imported itself (real on-device bug, 2026-08-09)', () => {
  it('flags nothing when every transaction the new covered range spans has its own real import record', () => {
    // Reproduces the exact on-device scenario: a first-ever import of 13 rows (9 matched against
    // existing transactions, 4 newly created) into a bank account, all falling inside the ONE covered
    // range this same import just established. Every one of them has a genuine
    // `BankStatementImportRecord` (`linkRecord()`'s own commit-time write) — so, given the CORRECT,
    // real provenance the caller is supposed to pass, none of them should ever be a standing gap. This
    // pins the pure function's contract; the actual bug (found via tracing) was `apps/mobile`'s
    // `useAccountVerification.ts` feeding this an unrefreshed, stale `importRecords` snapshot after
    // commit — a wiring bug in a React hook, outside this package, with no equivalent test harness.
    const matchedIds = Array.from({ length: 9 }, (_, i) => `matched-${i}`);
    const createdIds = Array.from({ length: 4 }, (_, i) => `created-${i}`);
    const allIds = [...matchedIds, ...createdIds];
    const accountTxns = allIds.map((id, i) => expense({ id, date: d(2026, 4, 5 + i) }));
    const importRecords: BankStatementImportRecord[] = allIds.map((id, i) => ({
      id: `rec-${i}`,
      batchId: 'batch-1',
      accountId: ACCOUNT,
      rawNarration: `NARRATION ${i}`,
      normalizedKey: `KEY-${i}`,
      date: d(2026, 4, 5 + i),
      amount: 100,
      type: 'expense',
      linkedTxnId: id,
      createdAt: 0
    }));

    const status = computeAccountVerificationStatus({
      ...NO_GAPS_PARAMS,
      accountTxns,
      importRecords,
      // The one `ImportBatchSummary`-shaped range this same commit just appended to
      // `Account.coveredStatementRanges`, spanning every one of the 13 rows above.
      coveredRanges: [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }]
    });

    expect(status.needsAttention).toBe(false);
    expect(status.activeFinding).toBeUndefined();
    expect(status.allFindings.find((f) => f.kind === 'standing-gap')).toBeUndefined();
  });
});

describe('computeAccountVerificationStatus — anchor disagreement only', () => {
  it('surfaces the anchor-disagreement finding, LIVE-recomputed from accountTxns (not a stored value)', () => {
    // New anchor: ₹10,000 as of 1-Jan-2026. One ₹41,000 credit inside the window implies the OLD
    // (2-Apr-2026) anchor should have been ₹51,000 — but it's recorded as ₹49,000, a ₹2,000 gap.
    const status = computeAccountVerificationStatus({
      accountId: ACCOUNT,
      openingBalance: 10_000,
      openingBalanceAsOfDate: d(2026, 1, 1),
      accountTxns: [expense({ id: 'w1', type: 'income', amount: 41_000, date: d(2026, 2, 1) })],
      importRecords: [],
      coveredRanges: [],
      anchorReference: {
        oldOpeningBalance: 49_000,
        oldAnchorDate: d(2026, 4, 2),
        newOpeningBalance: 10_000,
        detectedAt: d(2026, 8, 6)
      }
    });
    expect(status.needsAttention).toBe(true);
    expect(status.activeFinding?.kind).toBe('anchor-disagreement');
    expect(status.activeFinding?.anchorDisagreement?.diff).toBe(2_000);
  });
});

describe('computeAccountVerificationStatus — priority when multiple findings fire at once', () => {
  it('checkpoint-mismatch wins over anchor-disagreement and standing-gap', () => {
    const accountTxns = [
      // Dated AFTER `anchorReference.oldAnchorDate` (2-Apr) — deliberately, since a checkpoint dated
      // BEFORE/inside the disputed window is now excluded from mismatch-detection entirely (found
      // 2026-08-09, reviewing this fix: mismatch-detection must not double-report the same root cause
      // the anchor-disagreement finding below already owns — see `accountVerification.ts`'s own
      // `mismatchOpeningBalance`/`mismatchAnchorDate` doc comment). This keeps the two findings
      // genuinely independent, the realistic way they'd actually coexist in production.
      expense({ id: 'a', amount: 1000, type: 'income', date: d(2026, 4, 10), statementBalance: OPENING + 500 }),
      expense({ id: 'gap-1', date: d(2026, 4, 15) })
    ];
    const status = computeAccountVerificationStatus({
      accountId: ACCOUNT,
      openingBalance: OPENING,
      openingBalanceAsOfDate: d(2026, 1, 1),
      accountTxns,
      importRecords: [],
      coveredRanges: [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }],
      // Deliberately disagrees (both `accountTxns` fall after `oldAnchorDate`, so the window is empty —
      // implied = `newOpeningBalance` unchanged = 50,000, vs. recorded 0) — this test only cares that all
      // three finding kinds fire simultaneously and priority picks checkpoint-mismatch, not the exact
      // disagreement numbers.
      anchorReference: {
        oldOpeningBalance: 0,
        oldAnchorDate: d(2026, 4, 2),
        newOpeningBalance: 50_000,
        detectedAt: d(2026, 8, 6)
      }
    });
    expect(status.allFindings).toHaveLength(3);
    expect(status.activeFinding?.kind).toBe('checkpoint-mismatch');
  });
});

describe('computeAccountVerificationStatus — dismiss is scoped to the specific finding', () => {
  it('dismissing a standing-gap finding does not suppress a later, different checkpoint mismatch', () => {
    const accountTxns = [expense({ id: 'gap-1', date: d(2026, 4, 10) })];
    const params = {
      ...NO_GAPS_PARAMS,
      accountTxns,
      coveredRanges: [{ start: d(2026, 4, 1), end: d(2026, 4, 30) }]
    };
    const before = computeAccountVerificationStatus(params);
    const fingerprint = before.activeFinding?.fingerprint;
    expect(fingerprint).toBeDefined();

    // Dismiss the standing-gap finding.
    const dismissed = [{ fingerprint: fingerprint as string, dismissedAt: Date.now() }];
    const afterDismiss = computeAccountVerificationStatus({ ...params, dismissed });
    expect(afterDismiss.needsAttention).toBe(false);
    expect(afterDismiss.dismissedFinding?.kind).toBe('standing-gap');

    // A NEW, unrelated checkpoint mismatch appears later — must surface despite the unrelated dismissal.
    const withMismatch = {
      ...params,
      accountTxns: [
        ...accountTxns,
        expense({ id: 'ck-1', amount: 500, type: 'income', date: d(2026, 5, 1), statementBalance: OPENING + 1000 })
      ],
      dismissed
    };
    const afterNewMismatch = computeAccountVerificationStatus(withMismatch);
    expect(afterNewMismatch.needsAttention).toBe(true);
    expect(afterNewMismatch.activeFinding?.kind).toBe('checkpoint-mismatch');
    // The standing-gap finding is still dismissed (still firing, still acknowledged).
    expect(afterNewMismatch.dismissedFinding?.kind).toBe('standing-gap');
  });

  it('a different checkpoint pair produces a different fingerprint, so it is not silenced by an old dismissal', () => {
    const dismissed = [{ fingerprint: 'checkpoint:groceries-1:salary-2', dismissedAt: Date.now() }];
    const accountTxns = [
      expense({ id: 'a', amount: 1000, type: 'income', date: d(2026, 4, 1), statementBalance: OPENING + 500 })
    ];
    const status = computeAccountVerificationStatus({ ...NO_GAPS_PARAMS, accountTxns, dismissed });
    expect(status.needsAttention).toBe(true);
    expect(status.activeFinding?.kind).toBe('checkpoint-mismatch');
  });

  it('re-dismissing the exact same fingerprint keeps it muted, not active', () => {
    const accountTxns = [
      expense({ id: 'a', amount: 1000, type: 'income', date: d(2026, 4, 1), statementBalance: OPENING + 500 })
    ];
    const first = computeAccountVerificationStatus({ ...NO_GAPS_PARAMS, accountTxns });
    const fingerprint = first.activeFinding?.fingerprint as string;
    const status = computeAccountVerificationStatus({
      ...NO_GAPS_PARAMS,
      accountTxns,
      dismissed: [{ fingerprint, dismissedAt: Date.now() }]
    });
    expect(status.needsAttention).toBe(false);
    expect(status.activeFinding).toBeUndefined();
    expect(status.dismissedFinding?.kind).toBe('checkpoint-mismatch');
  });
});

describe('computeAccountVerificationStatus — openingBalanceAsOfDate priority fallback (real bug, 2026-08-09)', () => {
  it('once the fabricated checkpoint-mismatch is correctly excluded, the genuine anchor-disagreement finding surfaces as activeFinding — no re-decision needed, the earlier "keep + flag for later" choice just becomes visible again', () => {
    const ANCHOR_DATE = d(2026, 4, 2);
    const ANCHOR_BALANCE = 50_000;
    // A backfilled, real, internally-consistent pre-anchor checkpoint that the ₹50,000 anchor was never
    // meant to cover — exactly the shape that used to fabricate a 'checkpoint-mismatch' before the
    // `openingBalanceAsOfDate` exclusion fix (checkpointDiagnostics.test.ts has the full worked example).
    const accountTxns = [
      expense({ id: 'pre-1', type: 'income', amount: 10_000, date: d(2026, 1, 5), statementBalance: 40_000 }),
      // Post-anchor, correctly verified against the ₹50,000 anchor.
      expense({ id: 'post-1', type: 'expense', amount: 3_000, date: d(2026, 4, 10), statementBalance: 47_000 })
    ];
    // A SEPARATE, later anchor-shift disagreement (about a DIFFERENT, still-later boundary — 1-May —
    // independent of the pre-1/post-1 checkpoint fixture above), the user's own "keep, flag for later"
    // (§14b) choice: window `[ANCHOR_DATE, oldAnchorDate)` = `[2-Apr, 1-May)`, which contains exactly
    // `post-1` (expense ₹3,000, 10-Apr) ⇒ implied = 50,000 (`newOpeningBalance` — the backfill's own
    // un-back-derived claim, NEVER the account's own back-derived `openingBalance`, see
    // `recomputeAnchorAgreement`'s own doc comment) − 3,000 = 47,000; recorded old anchor was 49,000 ⇒
    // diff = −2,000.
    const anchorReference = {
      oldOpeningBalance: 49_000,
      oldAnchorDate: d(2026, 5, 1),
      newOpeningBalance: 50_000,
      detectedAt: d(2026, 8, 6)
    };

    // Without `openingBalanceAsOfDate` threaded through — updated 2026-08-09 alongside the
    // `mismatchOpeningBalance`/`mismatchAnchorDate` fix (`accountVerification.ts`'s own doc comment):
    // mismatch-detection now falls back to `anchorReference.oldAnchorDate` (1-May) whenever a reference
    // is present, REGARDLESS of whether the caller also threaded `openingBalanceAsOfDate` — so this no
    // longer reproduces the old bogus-checkpoint-mismatch bug at all (both `pre-1` and `post-1` are
    // excluded, being dated before 1-May). The anchor-disagreement recompute itself still correctly
    // requires `openingBalanceAsOfDate` to run at all (it needs to know the account's own CURRENT anchor
    // date to scope its comparison window) — so with it missing, nothing fires here: an inert, safe
    // outcome, never a fabricated finding, even from this intentionally-incomplete caller input.
    const withoutAnchorDate = computeAccountVerificationStatus({
      accountId: ACCOUNT,
      openingBalance: ANCHOR_BALANCE,
      accountTxns,
      importRecords: [],
      coveredRanges: [],
      anchorReference
    });
    expect(withoutAnchorDate.allFindings).toHaveLength(0);
    expect(withoutAnchorDate.activeFinding).toBeUndefined();

    // With `openingBalanceAsOfDate` correctly threaded through (the account's real, CURRENT anchor —
    // `ANCHOR_DATE`/2-Apr, excluding `pre-1`'s 5-Jan date from the checkpoint walk exactly as the
    // pre-existing checkpointDiagnostics.ts fix already does), the fabricated checkpoint-mismatch
    // disappears and the genuine, LIVE-recomputed anchor-disagreement finding is what the badge/detail
    // banner should show instead — the user's earlier "flag for later" choice just becomes visible
    // again, with no new decision required.
    const status = computeAccountVerificationStatus({
      accountId: ACCOUNT,
      openingBalance: ANCHOR_BALANCE,
      openingBalanceAsOfDate: ANCHOR_DATE,
      accountTxns,
      importRecords: [],
      coveredRanges: [],
      anchorReference
    });
    expect(status.allFindings.find((f) => f.kind === 'checkpoint-mismatch')).toBeUndefined();
    expect(status.needsAttention).toBe(true);
    expect(status.activeFinding?.kind).toBe('anchor-disagreement');
    expect(status.activeFinding?.anchorDisagreement?.diff).toBe(-2_000);
  });
});

describe('computeAccountVerificationStatus — anchorReference live recompute (found + fixed 2026-08-09, "frozen forever" bug)', () => {
  it('surfaces no anchor-disagreement finding once accountTxns reconcile cleanly, even though anchorReference is still set (a corrective import/edit/delete resolved the ledger without anyone clearing the flag)', () => {
    // Same shape as the "anchor disagreement only" test above (new anchor ₹10,000 @ 1-Jan-2026, old
    // anchor recorded as ₹49,000 @ 2-Apr-2026) — but this time a corrective transaction has since been
    // added inside the window, so the LIVE recompute now reconciles exactly: 10,000 + 39,000 = 49,000.
    const anchorReference = {
      oldOpeningBalance: 49_000,
      oldAnchorDate: d(2026, 4, 2),
      newOpeningBalance: 10_000,
      detectedAt: d(2026, 8, 6)
    };
    const accountTxns = [expense({ id: 'w1', type: 'income', amount: 39_000, date: d(2026, 2, 1) })];

    const status = computeAccountVerificationStatus({
      accountId: ACCOUNT,
      openingBalance: 10_000,
      openingBalanceAsOfDate: d(2026, 1, 1),
      accountTxns,
      importRecords: [],
      coveredRanges: [],
      anchorReference
    });

    expect(status.allFindings.find((f) => f.kind === 'anchor-disagreement')).toBeUndefined();
    expect(status.activeFinding).toBeUndefined();
    expect(status.needsAttention).toBe(false);
  });

  it('a corrective edit that FIXES a previously-disagreeing ledger makes the finding disappear on the very next call — no stale snapshot survives it', () => {
    const anchorReference = {
      oldOpeningBalance: 49_000,
      oldAnchorDate: d(2026, 4, 2),
      newOpeningBalance: 10_000,
      detectedAt: d(2026, 8, 6)
    };
    const baseParams = {
      accountId: ACCOUNT,
      openingBalance: 10_000,
      openingBalanceAsOfDate: d(2026, 1, 1),
      importRecords: [] as BankStatementImportRecord[],
      coveredRanges: [],
      anchorReference
    };

    // Before the correction: a ₹41,000 credit implies ₹51,000, disagreeing with the recorded ₹49,000
    // by ₹2,000 — the exact on-device repro (chose "Keep, flag", then later re-imported a corrected
    // statement that fixed the actual error).
    const before = computeAccountVerificationStatus({
      ...baseParams,
      accountTxns: [expense({ id: 'w1', type: 'income', amount: 41_000, date: d(2026, 2, 1) })]
    });
    expect(before.activeFinding?.kind).toBe('anchor-disagreement');
    expect(before.activeFinding?.anchorDisagreement?.diff).toBe(2_000);

    // After the correction (the same row edited down by ₹2,000 to its real amount) — computed fresh,
    // not from any cache — the finding is simply gone, unlike the pre-fix frozen `anchorDisagreement`
    // snapshot, which would have kept showing the stale ₹2,000 gap forever.
    const after = computeAccountVerificationStatus({
      ...baseParams,
      accountTxns: [expense({ id: 'w1', type: 'income', amount: 39_000, date: d(2026, 2, 1) })]
    });
    expect(after.allFindings.find((f) => f.kind === 'anchor-disagreement')).toBeUndefined();
    expect(after.needsAttention).toBe(false);
  });
});

describe('computeAccountVerificationStatus — a checkpointed row inside the disputed window must not ALSO fabricate a checkpoint-mismatch (real gap found reviewing this fix, 2026-08-09)', () => {
  it('excludes the disputed window from mismatch-detection so the account’s own real, back-derived anchor never gets flagged against a backfill statement’s own (differently-calibrated) checkpoints', () => {
    // Mirrors the real on-device scenario exactly: "Keep, flag" was chosen, so the account's CURRENT
    // fields already sit at the back-derived new anchor (₹18,000 as of 1-Jan) — correct for
    // `computeBalance()`'s total, but NOT calibrated to reproduce the backfill statement's OWN
    // originally-imported checkpoint values along the way (those were calibrated to the backfill's own,
    // different, ₹20,000 implied opening). Walking the full ledger from ₹18,000 would therefore make
    // this checkpoint disagree by a flat, fabricated amount — a SECOND finding for the exact same root
    // cause the anchor-disagreement finding below already owns.
    // `newOpeningBalance: 20,000` — the backfill's OWN un-back-derived claim (its first checkpointed
    // row's own stated balance, 57,000, minus its own +37,000 credit), NOT the account's real, back-
    // derived `openingBalance` of 18,000 below (see `recomputeAnchorAgreement`'s own doc comment for why
    // using the back-derived value here would be a SECOND, separate bug — found + fixed 2026-08-09,
    // on-device: it makes the live check tautologically always agree).
    const anchorReference = {
      oldOpeningBalance: 50_000,
      oldAnchorDate: d(2026, 4, 2),
      newOpeningBalance: 20_000,
      detectedAt: d(2026, 8, 6)
    };
    const accountTxns = [
      // Inside the disputed window [1-Jan, 2-Apr) — a real checkpointed row from the backfill's own
      // (uncorrected) import: 18,000 + 37,000 = 55,000, but the statement itself says 57,000.
      expense({ id: 'w1', type: 'income', amount: 37_000, date: d(2026, 1, 5), statementBalance: 57_000 })
    ];

    const status = computeAccountVerificationStatus({
      accountId: ACCOUNT,
      openingBalance: 18_000,
      openingBalanceAsOfDate: d(2026, 1, 1),
      accountTxns,
      importRecords: [],
      coveredRanges: [],
      anchorReference
    });

    // No fabricated checkpoint-mismatch — the disputed window is excluded from mismatch-detection
    // entirely (mismatch-detection instead uses the OLD anchor, under which this same row is excluded by
    // the ordinary pre-anchor filter).
    expect(status.allFindings.find((f) => f.kind === 'checkpoint-mismatch')).toBeUndefined();
    // The genuine anchor-disagreement finding still fires, live-recomputed from the backfill's own real
    // claim: implied = 20,000 + 37,000 = 57,000 vs the recorded old anchor of 50,000 ⇒ diff = 7,000.
    expect(status.activeFinding?.kind).toBe('anchor-disagreement');
    expect(status.activeFinding?.anchorDisagreement?.diff).toBe(7_000);
  });
});
