// Shared across newsClient.ts (web) and newsClient.native.ts — kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md). See docs/EXTERNAL_APIS.md.
import type { NewsSource } from './newsTypes';

// AllOrigins raw passthrough — returns the XML as-is. Swap this constant to a Cloudflare Worker URL
// in Phase 2 if proxy rate limits/reliability become a problem (see docs/features/news.md).
export const NEWS_PROXY = 'https://api.allorigins.win/raw?url=';

export const NEWS_TTL_MS = 45 * 60 * 1000; // 45 minutes

export const NEWS_SOURCES: NewsSource[] = [
  {
    id: 'et-markets',
    label: 'ET Markets',
    category: 'markets',
    feedUrl: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
    color: '#f97316'
  },
  {
    id: 'mint',
    label: 'Mint',
    category: 'markets',
    feedUrl: 'https://www.livemint.com/rss/markets',
    color: '#0ea5e9'
  },
  {
    id: 'rbi',
    label: 'RBI',
    category: 'regulatory',
    feedUrl: 'https://www.rbi.org.in/pressreleases_rss.xml',
    color: '#10b981'
  },
  {
    id: 'sebi',
    label: 'SEBI',
    category: 'regulatory',
    feedUrl: 'https://www.sebi.gov.in/sebirss.xml',
    color: '#8b5cf6'
  }
];
