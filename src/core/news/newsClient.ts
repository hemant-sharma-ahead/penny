import type { NewsItem, NewsSource, NewsSourceId } from './newsTypes';

// AllOrigins raw passthrough — returns the XML as-is so we parse with DOMParser.
// Swap this constant to a Cloudflare Worker URL in Phase 2.
const PROXY = 'https://api.allorigins.win/raw?url=';

const NEWS_CACHE_KEY = 'penny_news_cache';
const NEWS_TTL_MS = 45 * 60 * 1000; // 45 minutes

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

interface CacheEntry {
  items: NewsItem[];
  fetchedAt: number;
}

function loadCache(): Map<NewsSourceId, CacheEntry> {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, CacheEntry>;
    return new Map(Object.entries(obj) as [NewsSourceId, CacheEntry][]);
  } catch {
    return new Map();
  }
}

function saveCache(map: Map<NewsSourceId, CacheEntry>): void {
  const obj: Record<string, CacheEntry> = {};
  map.forEach((v, k) => {
    obj[k] = v;
  });
  localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify(obj));
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.fetchedAt < NEWS_TTL_MS;
}

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function parseXml(xml: string, sourceId: NewsSourceId): NewsItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const items = Array.from(doc.querySelectorAll('item'));
  const results: NewsItem[] = [];

  for (const item of items) {
    const title = item.querySelector('title')?.textContent?.trim() ?? '';
    const link = item.querySelector('link')?.textContent?.trim() ?? '';
    const pubDate = item.querySelector('pubDate')?.textContent?.trim() ?? '';
    const description = item.querySelector('description')?.textContent?.trim() ?? '';

    if (!title || !link) continue;

    const publishedAt = pubDate ? new Date(pubDate).getTime() : Date.now();
    const summaryText = description ? stripHtml(description).slice(0, 200) : '';

    results.push({
      id: `${sourceId}-${hashStr(link)}`,
      sourceId,
      title: stripHtml(title),
      link,
      publishedAt: isNaN(publishedAt) ? Date.now() : publishedAt,
      ...(summaryText ? { summary: summaryText } : {})
    });
  }

  return results;
}

export async function fetchNewsFeed(source: NewsSource): Promise<NewsItem[]> {
  const url = PROXY + encodeURIComponent(source.feedUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`News fetch failed: ${res.status}`);
  const xml = await res.text();
  return parseXml(xml, source.id);
}

export async function fetchAllNews(ids: NewsSourceId[]): Promise<NewsItem[]> {
  const cache = loadCache();
  const results: NewsItem[] = [];
  const toFetch: NewsSource[] = [];

  for (const id of ids) {
    const entry = cache.get(id);
    if (entry && isFresh(entry)) {
      results.push(...entry.items);
    } else {
      const src = NEWS_SOURCES.find((s) => s.id === id);
      if (src) toFetch.push(src);
    }
  }

  const fetched = await Promise.allSettled(toFetch.map((src) => fetchNewsFeed(src)));
  fetched.forEach((r, i) => {
    const src = toFetch[i];
    if (r.status === 'fulfilled' && src) {
      cache.set(src.id, { items: r.value, fetchedAt: Date.now() });
      results.push(...r.value);
    }
  });

  saveCache(cache);

  return results.sort((a, b) => b.publishedAt - a.publishedAt);
}

export function clearNewsCache(): void {
  localStorage.removeItem(NEWS_CACHE_KEY);
}
