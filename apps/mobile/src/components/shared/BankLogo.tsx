import type { ReactNode } from 'react';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '~/components/Icon';
import type { Account, BankPresetId } from '@/core/db/types';
import { bankAccentColor } from './bankAccentColor';

interface BrandLogo {
  viewBox: string;
  /** Real, verified brand color — never overridden, even when a caller passes `color` (that prop only
   *  ever affects the fallback `<Icon>` path below). A recognizable brand mark keeping its true color
   *  regardless of surrounding selection/theming state is the correct behavior, not a gap. */
  color: string;
  d: string;
}

/**
 * Real per-bank logos (docs/plans/real-device-testing-pass.md item 44) — 4 of the 12
 * `BankPresetId`s have a real, CC0-licensed mark available (Simple Icons: hdfcbank, icicibank,
 * axisbank, hsbc slugs). Paths/colors verified directly against the published Simple Icons SVG
 * source (cross-checked across two independent CDN mirrors), not fabricated.
 *
 * 2026-08-20: added `hsbc` — Simple Icons *does* carry it (a real gap in the original item-44 pass,
 * which asserted only 3 of 12 were available without actually checking HSBC specifically). Checked
 * again for the remaining 8 (sbi/kotak/indusind/bob/yesbank/pnb/canara/idfcfirst/custom) before
 * adding this note: Simple Icons' catalog genuinely has no entry for any of them (it's a
 * general/tech-brand set, not an Indian-banking-specific one). The one other place real SVG marks
 * for sbi/kotak/indusind exist (github.com/praveenpuglia/indian-banks) ships with no LICENSE file
 * at all — unclear rights, not safe to redistribute in a shipped app — so they're not included
 * here either. They render the honest generic fallback below until a properly-licensed source
 * (e.g. each bank's own official press/brand-asset page) is sourced, which is its own follow-up,
 * not something to fake with a lookalike mark.
 */
const BANK_LOGOS: Partial<Record<BankPresetId, BrandLogo>> = {
  hdfc: {
    viewBox: '0 0 24 24',
    color: '#004C8F',
    d: 'M.572 0v10.842h3.712V4.485h6.381V0Zm12.413 0v4.485h6.383v6.357h4.06V0Zm-4.64 8.53v6.938h6.963V8.53ZM.572 13.153V24h10.093v-4.486h-6.38v-6.361zm18.796 0v6.361h-6.383V24h10.443V13.153Z'
  },
  icici: {
    viewBox: '0 0 24 24',
    color: '#B02A30',
    d: 'M21.9258 2.0961C19.279-1.6476 12.698-.2426 7.2138 5.2416c-5.484 5.475-7.7865 12.9625-5.1397 16.7062.8728 1.2386 2.1837 1.902 3.7386 2.0522 1.0516.0078 1.9129-1.1846 2.6158-2.7774.7252-1.6678 1.1694-3.218 1.5138-4.6592.5077-2.2934.544-3.934.29-4.2786-.435-.5801-1.4321-.435-2.5561.2176-.544.2991-1.26.0997-.408-.9336.8612-1.0425 4.2605-3.5625 5.4933-3.9523 1.3415-.3898 2.8734.136 2.3568 1.6226-.3706 1.0847-5.0473 13.486-1.596 12.2719 1.1049-.747 2.205-1.6497 3.2639-2.7086 5.4841-5.475 7.7865-12.9625 5.1396-16.7063zm-5.3662 3.209c-1.0969 1.0968-2.52 1.4865-3.1364.852-.6617-.6345-.272-2.0577.8249-3.1726 1.1058-1.115 2.529-1.4594 3.1454-.834.6345.6436.2448 2.0487-.834 3.1545z'
  },
  axis: {
    viewBox: '0 0 24 24',
    color: '#97144D',
    d: 'M11.978 1.596 0 22.404h7.453l8.265-14.369Zm.027 12.896 4.533 7.903H24l-4.533-7.903z'
  },
  hsbc: {
    viewBox: '0 0 24 24',
    color: '#DB0011',
    d: 'm24 12.007-5.996 5.997V5.996L24 12.007zm-5.996-6.01H6.01l5.996 6.01 5.997-6.01zM0 12.006l6.01 5.997V5.996L0 12.007zm6.01 5.997h11.994l-5.997-5.997-5.996 5.997z'
  }
};

export interface BankLogoProps {
  /** Full `Account`, or just the 3 fields this needs — `bankId` drives the real-logo match; `icon`/
   *  `color` are the existing fallback, unchanged from what every call site rendered before this
   *  component existed. */
  account: Pick<Account, 'bankId' | 'icon' | 'color'>;
  size: number;
  /** Fallback-only color override (e.g. AccountChips' white-on-solid-square treatment). Never affects
   *  a matched real logo — see `BrandLogo.color`'s doc comment. Defaults to `bankAccentColor(account)`
   *  (the bank's real color when known, else `account.color`). */
  color?: string;
}

/**
 * Single resolution seam for "what icon does this account show" — real per-bank logo when
 * `account.bankId` matches one of the 4 sourced so far (`BANK_LOGOS`), otherwise the generic-icon
 * fallback tinted with `bankAccentColor()` (a known brand color when available, else
 * `account.color`). Every account-icon render site should go through this instead of calling `<Icon>`
 * directly, so a newly-sourced bank logo only needs adding to `BANK_LOGOS` once, not re-wired at each
 * call site.
 */
export function BankLogo({ account, size, color }: BankLogoProps): ReactNode {
  const brand = account.bankId ? BANK_LOGOS[account.bankId] : undefined;
  if (brand) {
    return (
      <Svg width={size} height={size} viewBox={brand.viewBox}>
        <Path d={brand.d} fill={brand.color} />
      </Svg>
    );
  }
  return <Icon name={account.icon} size={size} color={color ?? bankAccentColor(account)} />;
}
