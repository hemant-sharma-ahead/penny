// Shared across newsClient.ts (web) and newsClient.native.ts — kept in exactly one place per the
// platform-variance-minimization principle (docs/ARCHITECTURE.md). See docs/EXTERNAL_APIS.md.
import type { NewsSource } from './newsTypes';

// AllOrigins raw passthrough — returns the XML as-is. Fallback only: newsClient.ts/newsClient.native.ts
// prefer NEWS_PROXY_BASE (apps' own penny-api-proxy Worker, see workers/api-proxy/src/news.ts) when
// configured, and only fall back to this public proxy when no Worker is set up. Kept after AllOrigins
// started 408-timing-out on the RBI/SEBI feeds specifically (2026-07-27), since a Worker-less dev setup
// still needs *something* to get past RSS feeds' missing CORS headers.
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
