// Pure "NER-lite": link a headline to the companies/sectors it mentions, using the bundled entity
// dictionary. No AI, no network, no state. Word-boundary matched, longest alias first with span
// consumption so "SBI Life" doesn't also match bare "SBI". See docs/MARKET_SENTIMENT_RESEARCH.md.

import { ENTITIES } from './entityDictionary';

export interface EntityMatch {
  symbol: string;
  name: string;
  sector: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface AliasMatcher {
  re: RegExp;
  length: number;
  symbol: string;
  name: string;
  sector: string;
}

// Precompiled once at module load, sorted longest-alias-first so specific names win over short ones.
const MATCHERS: AliasMatcher[] = ENTITIES.flatMap((e) =>
  e.aliases.map((alias) => ({
    re: new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i'),
    length: alias.length,
    symbol: e.symbol,
    name: e.name,
    sector: e.sector
  }))
).sort((a, b) => b.length - a.length);

function overlaps(ranges: [number, number][], start: number, end: number): boolean {
  return ranges.some(([s, e]) => start < e && end > s);
}

/** Companies mentioned in a headline (deduped by symbol, longest-alias-first). */
export function tagEntities(text: string): EntityMatch[] {
  const claimed: [number, number][] = [];
  const bySymbol = new Map<string, EntityMatch>();

  for (const m of MATCHERS) {
    if (bySymbol.has(m.symbol)) continue;
    const hit = m.re.exec(text);
    if (!hit) continue;
    const start = hit.index;
    const end = start + hit[0].length;
    if (overlaps(claimed, start, end)) continue;
    claimed.push([start, end]);
    bySymbol.set(m.symbol, { symbol: m.symbol, name: m.name, sector: m.sector });
  }

  return [...bySymbol.values()];
}
