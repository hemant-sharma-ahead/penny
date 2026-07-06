import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { activityLogRepo, chipInsightsRepo } from '@/core/db/repositories';
import type { ActivityLog, ChipInsight } from '@/core/db/types';
import { useRepository } from '@/hooks/useRepository';
import { usePrivacy } from '@/context/PrivacyContext';
import { maskAmounts } from '@/lib/maskAmounts';
import { weeklyStats } from '@/core/activity/narrate';
import { detectMilestone } from '@/core/activity/milestones';
import { toDateKey, DAY_MS } from '@/lib/date';
import { PATHS } from '@/router/paths';
import type { Story } from './storyTypes';
import { shareStoryImage } from './storyTypes';

const WEEK_GRAD = 'linear-gradient(160deg,#00C47D,#007A4D)';
const DAY_GRAD = 'linear-gradient(160deg,#6366f1,#3b82f6)';
const STREAK_GRAD = 'linear-gradient(160deg,#f59e0b,#d97706)';
const INSIGHT_GRAD = 'linear-gradient(160deg,#8b5cf6,#6d28d9)';
const TIMELINE_GRAD = 'linear-gradient(160deg,#0ea5e9,#0369a1)';

const MODULE_PATH: Record<string, string> = {
  EXPENSES: PATHS.app.expenses,
  SUBSCRIPTIONS: PATHS.app.subscriptions,
  PORTFOLIO: PATHS.app.portfolio,
  GOALS: PATHS.app.goals,
  TAX: PATHS.app.tax,
  INSURANCE: PATHS.app.insurance,
  CASHFLOW: PATHS.app.cashflow
};

/** ISO-week key (year-week) so the weekly story re-lights every new week. */
function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

/** Consecutive days of tracking ending today or yesterday. */
function currentStreak(entries: ActivityLog[], nowMs: number): number {
  const days = new Set<string>();
  for (const e of entries) {
    if (e.entityType === 'system' || e.action === 'CHECKPOINT') continue;
    days.add(toDateKey(e.timestamp));
  }
  if (days.size === 0) return 0;
  let streak = 0;
  let cursor = nowMs;
  // Allow the streak to "end" today or yesterday (so it doesn't break before today's first entry).
  if (!days.has(toDateKey(cursor))) cursor -= DAY_MS;
  while (days.has(toDateKey(cursor))) {
    streak += 1;
    cursor -= DAY_MS;
  }
  return streak;
}

/**
 * Builds the Home "stories" from the activity log, Chip insights, and tracking history. Pure-ish:
 * loads two encrypted stores; everything else is derived. Each story carries a `freshnessKey` so a
 * seen ring re-lights when its content changes.
 */
export function useHomeStories(): Story[] {
  const navigate = useNavigate();
  const { shouldMask } = usePrivacy();
  // Stories mix activity log + insights from every module without a live category/account
  // reference here — treated as an aggregate view: visible in Safe, hidden only in Privacy.
  const masked = shouldMask(false);
  const [now] = useState(() => Date.now());
  const { items: activity } = useRepository(activityLogRepo);
  const { items: insights } = useRepository(chipInsightsRepo);

  return useMemo<Story[]>(() => {
    const entries = [...activity].sort((a, b) => b.timestamp - a.timestamp);
    const stories: Story[] = [];

    // 1 ── Weekly Wrapped ────────────────────────────────────────────────────
    const week = weeklyStats(entries, now);
    if (week) {
      const isSunday = new Date(now).getDay() === 0;
      stories.push({
        id: 'week',
        label: isSunday ? 'Week ready 🎉' : 'Your week',
        emoji: '✨',
        gradient: WEEK_GRAD,
        freshnessKey: `week:${isoWeekKey(new Date(now))}:${week.total}`,
        slides: [
          { big: '✨', caption: 'Your week on Penny' },
          { big: String(week.total), caption: `change${week.total === 1 ? '' : 's'} this week` },
          { big: week.busiestDay ?? '—', caption: 'your busiest day' },
          { big: `${week.added}·${week.removed}`, caption: 'added · removed' },
          { big: '🔒', caption: 'All private. All on your device.' }
        ],
        onShare: () =>
          void shareStoryImage({
            title: 'My week on Penny',
            big: String(week.total),
            lines: [
              'changes this week',
              `Busiest day · ${week.busiestDay ?? '—'}`,
              `${week.added} added · ${week.removed} removed`
            ],
            filename: 'penny-week.png'
          })
      });
    }

    // 2 ── On this day ────────────────────────────────────────────────────────
    const today = new Date(now);
    const memories = entries
      .filter((e) => {
        const d = new Date(e.timestamp);
        return (
          d.getDate() === today.getDate() &&
          d.getMonth() === today.getMonth() &&
          d.getFullYear() < today.getFullYear() &&
          e.entityType !== 'system'
        );
      })
      .slice(0, 4);
    if (memories.length > 0) {
      stories.push({
        id: 'onthisday',
        label: 'On this day',
        emoji: '📅',
        gradient: DAY_GRAD,
        freshnessKey: `onthisday:${toDateKey(now)}`,
        slides: [
          { big: '📅', caption: 'On this day…', sub: 'A look back at the same date in past years' },
          ...memories.map((e) => ({
            big: String(new Date(e.timestamp).getFullYear()),
            caption: maskAmounts(e.summary, masked)
          }))
        ]
      });
    }

    // 3 ── Streak & milestone ─────────────────────────────────────────────────
    const streak = currentStreak(entries, now);
    const milestone = detectMilestone(entries);
    if (streak >= 2 || milestone) {
      const slides = [];
      if (streak >= 2) {
        slides.push({ big: `${streak}🔥`, caption: `day tracking streak`, sub: 'Keep it going — log something today' });
      }
      if (milestone) slides.push({ big: '🏆', caption: milestone.label });
      if (slides.length === 0) slides.push({ big: '🌱', caption: 'Your tracking story starts here' });
      stories.push({
        id: 'streak',
        label: streak >= 2 ? `${streak}-day streak` : 'Milestone',
        emoji: streak >= 2 ? '🔥' : '🏆',
        gradient: STREAK_GRAD,
        freshnessKey: `streak:${streak}:${milestone?.key ?? 'none'}`,
        slides
      });
    }

    // 4 ── Chip insights ──────────────────────────────────────────────────────
    const liveInsights = (insights as ChipInsight[])
      .filter((i) => !i.isRead)
      .sort((a, b) => b.generatedAt - a.generatedAt)
      .slice(0, 5);
    const first = liveInsights[0];
    if (first) {
      const slides = liveInsights.flatMap((i) => {
        const cards = [{ big: '💡', caption: maskAmounts(i.headline, masked) }];
        if (i.consequence) cards.push({ big: '⚠️', caption: maskAmounts(i.consequence, masked) });
        return cards;
      });
      stories.push({
        id: 'insights',
        label: 'Insights',
        emoji: '💡',
        gradient: INSIGHT_GRAD,
        freshnessKey: `insights:${liveInsights.map((i) => i.id).join(',')}`,
        slides,
        cta: {
          label: first.actionLabel ?? 'Review now',
          onClick: () => navigate(MODULE_PATH[first.moduleTag] ?? PATHS.app.chip)
        }
      });
    }

    // 5 ── Timeline (recent activity → full Timeline page) ────────────────────
    // Tax now surfaces as an actionable guidance quick-win (Home advisor), not a story.
    const recent = entries.filter((e) => e.entityType !== 'system').slice(0, 4);
    if (recent.length > 0) {
      stories.push({
        id: 'timeline',
        label: 'Timeline',
        emoji: '🕘',
        gradient: TIMELINE_GRAD,
        freshnessKey: `timeline:${recent[0]?.timestamp ?? 0}`,
        slides: [
          { big: '🕘', caption: 'Your timeline', sub: "Everything you've tracked — undo or restore anytime" },
          ...recent.map((e) => ({ big: '•', caption: maskAmounts(e.summary, masked) }))
        ],
        cta: { label: 'Open timeline →', onClick: () => navigate(PATHS.app.timeline) }
      });
    }

    return stories;
  }, [activity, insights, masked, navigate, now]);
}
