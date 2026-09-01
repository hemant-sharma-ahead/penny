import type { Account, BankPresetId } from '@/core/db/types';

/**
 * Real official brand colors for presets with no licensed logo mark yet (see `BankLogo.tsx`'s
 * `BANK_LOGOS` doc comment for why) — colors aren't copyrightable, so these are safe to use even
 * without a mark, tinting the generic fallback icon with the bank's own color instead of leaving it
 * on the account-type default. Verified against each bank's own brand materials, 2026-08-19
 * (account-card redesign, item 49). The other 5 unsourced presets (bob/yesbank/pnb/canara/idfcfirst)
 * have no verified color here either — inventing one would be as dishonest as inventing a logo mark,
 * so they stay on the plain account-type default until sourced.
 *
 * Lives in its own file, not `BankLogo.tsx`, purely because a component file with a second, non-
 * component export trips `react-refresh/only-export-components` — no other reason to split it.
 */
const BANK_ACCENT_COLORS: Partial<Record<BankPresetId, string>> = {
  sbi: '#00B5EF',
  kotak: '#ED1C24',
  indusind: '#98272A'
};

/** Resolves the color a fallback (non-logo) bank icon/badge should use — the bank's real brand color
 *  when known (`BANK_ACCENT_COLORS`) even without a licensed mark, otherwise the plain account-type
 *  default (`account.color`). Used by both `BankLogo.tsx` itself (the icon glyph) and any caller that
 *  separately needs to tint a badge *background* to match — see `AccountList.tsx`. */
export function bankAccentColor(account: Pick<Account, 'bankId' | 'color'>): string {
  const accent = account.bankId ? BANK_ACCENT_COLORS[account.bankId] : undefined;
  return accent ?? account.color;
}
