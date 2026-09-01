import { useEffect, useState } from 'react';
import { Banner } from '~/components/ui';
import { isTipDismissed, dismissTip } from '~/lib/tipsStorage';

interface Props {
  /** Stable id — also the dismiss-persistence key (`penny_tips_dismissed`). */
  id: string;
  text: string;
  /** The real, already-computed condition that decides whether this nudge is even eligible right now
   *  (e.g. `selected.size >= 3`) — this component only owns the dismiss/persist part, not the "when." */
  active: boolean;
}

/**
 * Tier 1 "Did You Know" contextual nudge (2026-08-16) — a small dismissible `Banner variant="info"`
 * rendered exactly where it's relevant, firing only when `active` is true and it hasn't already been
 * dismissed. Fires at most once, ever, per `id`: dismissing (✕) suppresses it forever, same as the
 * existing `penny_vacation_note_dismissed`/`penny_recurring_due_dismissed` convention. Callers should
 * ALSO call `dismissTip(id)` directly the moment the user actually performs the hinted action (see each
 * call site) — "dismissed or acted upon" both permanently suppress it, per the approved design.
 */
export function TipNudgeBanner({ id, text, active }: Props) {
  // `null` = not yet loaded from storage — never renders while unknown, avoids a flash-then-hide.
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void isTipDismissed(id).then((d) => {
      if (!cancelled) setDismissed(d);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!active || dismissed !== false) return null;

  return (
    <Banner
      variant="info"
      icon="ti-bulb"
      onDismiss={() => {
        setDismissed(true);
        void dismissTip(id);
      }}
    >
      {text}
    </Banner>
  );
}
