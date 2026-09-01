// Shared "pending transfer" resolution logic (2026-08-30) — extracted from `EpfAllTransactionsSheet`
// (`RetirementSheets.tsx`) so the SAME state/handlers can also back the new Employer Detail popup's own
// pending-transfer section (`EpfEmployerDetailModal.tsx`) without duplicating this fairly involved
// mutation logic in two places, which would risk the two silently diverging over time. A hook, not a
// plain function — every caller here is a component that's mounted/unmounted per-employer (never inside
// a `.map()` over multiple employers in the same render), so the Rules of Hooks are satisfied.
import { useMemo, useState } from 'react';
import type { EpfEmployer, EpfTransaction, Holding } from '@/core/db/types';
import { epfPendingTransferSuccessor, epfResolvedTransfer, resolveAnyTxnOwner } from './epfEmployerScoping';

export function useEpfPendingTransfer(
  holding: Holding,
  employer: EpfEmployer | null,
  onSave: (updated: Holding) => Promise<void>
) {
  const allEmployers = useMemo(() => holding.assetMeta?.epfEmployers ?? [], [holding.assetMeta?.epfEmployers]);
  const allTransactions = useMemo(() => holding.assetMeta?.epfTransactions ?? [], [holding.assetMeta?.epfTransactions]);

  const pendingTransferSuccessor = useMemo(
    () => (employer ? epfPendingTransferSuccessor(employer, allEmployers, allTransactions) : null),
    [employer, allEmployers, allTransactions]
  );
  // Already-answered "It was transferred" — shown as a small persistent confirmation instead of the
  // answer just silently vanishing with no trace.
  const resolvedTransfer = useMemo(
    () => (employer ? epfResolvedTransfer(employer, allEmployers, allTransactions) : null),
    [employer, allEmployers, allTransactions]
  );
  // Session-only "not sure yet" dismiss — deliberately NOT persisted like `pendingTransferDismissed`
  // ("it was withdrawn," a real answer): this is for "I genuinely don't know yet," which should keep
  // asking on a future visit, just not clutter THIS one. A plain boolean (not a Set) is enough since
  // this hook is always scoped to exactly one employer per instance.
  const [hiddenForNow, setHiddenForNow] = useState(false);
  // Prefills the "record transfer" amount from this employer's own most recent real `withdrawal` — in
  // every real case found so far, the closing settlement THAT withdrawal already records IS the amount
  // that (per the user's own confirmation) actually moved to the destination, so it's the most useful
  // starting guess — always editable, never silently trusted as exact.
  const suggestedAmount = useMemo(() => {
    if (!pendingTransferSuccessor || !employer) return 0;
    const withdrawals = allTransactions.filter(
      (t) => t.type === 'withdrawal' && resolveAnyTxnOwner(t, allEmployers)?.id === employer.id
    );
    const latest = [...withdrawals].sort((a, b) => b.date - a.date)[0];
    return latest?.amount ?? 0;
  }, [pendingTransferSuccessor, employer, allTransactions, allEmployers]);

  const [showConfirm, setShowConfirm] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  // Which employer the money actually went to — defaults to the suggested destination, but always
  // user-changeable (real reported bug: the destination can't always just be assumed to be whichever
  // employer is chronologically next — see `epfPendingTransferSuccessor`'s own doc comment). Every
  // OTHER employer in the holding is a valid choice, not just the suggested one.
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const destinationOptions = useMemo(() => allEmployers.filter((e) => e.id !== employer?.id), [allEmployers, employer]);
  const destination = destinationOptions.find((e) => e.id === destinationId) ?? null;

  function openConfirm() {
    setAmountDraft(suggestedAmount > 0 ? String(suggestedAmount) : '');
    setDestinationId(pendingTransferSuccessor?.id ?? destinationOptions[0]?.id ?? null);
    setShowConfirm(true);
  }

  /** "It was transferred" — records a real `transfer_in` on the CHOSEN destination employer for the
   *  confirmed amount, restoring it to the holding's total corpus (it was already correctly subtracted
   *  at the OLD employer via its own `withdrawal` — this is the missing other half). Dated to the
   *  destination's own `fromDate` — the earliest point it could plausibly have landed there; always
   *  editable after the fact via the destination's own transaction list. Stamps
   *  `transferredFromEmployerId` so this exact gap is recognized as resolved regardless of which
   *  employer ends up being the real destination. */
  async function confirmTransfer() {
    if (!destination || !employer || resolving) return;
    const amount = Math.round(Number(amountDraft));
    if (!Number.isFinite(amount) || amount <= 0) return;
    setResolving(true);
    try {
      const newTxn: EpfTransaction = {
        id: crypto.randomUUID(),
        type: 'transfer_in',
        date: destination.fromDate,
        amount,
        employeeAmount: amount,
        employerId: destination.id,
        transferredFromEmployerId: employer.id,
        sourceParticulars: `Transferred from ${employer.companyName}`
      };
      const updated: Holding = {
        ...holding,
        assetMeta: { ...holding.assetMeta, epfTransactions: [...allTransactions, newTxn] },
        updatedAt: Date.now()
      };
      await onSave(updated);
      setShowConfirm(false);
    } catch {
      // Leave the confirm modal open so the user can retry.
    } finally {
      setResolving(false);
    }
  }

  /** "It was withdrawn" — the balance genuinely left EPF (already correctly recorded via the old
   *  employer's own `withdrawal` transaction); just stops the banner asking again. */
  async function dismissAsWithdrawn() {
    if (!employer || dismissing) return;
    setDismissing(true);
    try {
      const updated: Holding = {
        ...holding,
        assetMeta: {
          ...holding.assetMeta,
          epfEmployers: allEmployers.map((e) => (e.id === employer.id ? { ...e, pendingTransferDismissed: true } : e))
        },
        updatedAt: Date.now()
      };
      await onSave(updated);
    } catch {
      // Leave the banner showing so the user can retry.
    } finally {
      setDismissing(false);
    }
  }

  return {
    pendingTransferSuccessor,
    resolvedTransfer,
    hiddenForNow,
    hideForNow: () => setHiddenForNow(true),
    showConfirm,
    setShowConfirm,
    amountDraft,
    setAmountDraft,
    destinationId,
    setDestinationId,
    destinationOptions,
    destination,
    resolving,
    dismissing,
    openConfirm,
    confirmTransfer,
    dismissAsWithdrawn
  };
}
