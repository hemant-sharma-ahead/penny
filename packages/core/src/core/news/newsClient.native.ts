import type { NewsItem, NewsSource, NewsSourceId } from './newsTypes';
import { NEWS_PROXY as ALLORIGINS_PROXY, NEWS_TTL_MS, NEWS_SOURCES } from './newsClient.constants';
import { NEWS_PROXY_BASE } from '@/core/net/apiBase';

export { NEWS_SOURCES };

interface CacheEntry {
  items: NewsItem[];
  fetchedAt: number;
}

/**
 * RN port of core/news/newsClient.ts. Two browser-only pieces needed replacing:
 * - Web's `loadCache`/`saveCache` use synchronous `localStorage` — per the same precedent as
 *   `ipo/ipoClient.native.ts`/`nps/npsClient.native.ts`, mobile drops the persistent cross-session cache
 *   and keeps an in-memory `Map` for the lifetime of the app instead (still avoids refetching every
 *   re-render/navigation within a session; every cold start re-fetches).
 * - Web's `parseXml` uses the browser's `DOMParser`, which doesn't exist on RN at all (unlike the
 *   localStorage cases elsewhere, there's no async-storage-style swap for a missing DOM API). RSS feeds
 *   here are simple enough that a small regex-based tag extractor (handling optional `CDATA` wrapping,
 *   which these feeds use for `title`/`description`) replaces it without pulling in an XML parsing
 *   dependency — consistent with this file's own existing `stripHtml` already being regex-based, not a
 *   real HTML parser.
 */
const cache = new Map<NewsSourceId, CacheEntry>();

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

/** Extracts one XML tag's inner text from an `<item>` block, unwrapping `<![CDATA[...]]>` if present. */
function extractTag(itemXml: string, tag: string): string {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return '';
  const raw = match[1] ?? '';
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : raw)?.trim() ?? '';
}

function parseXml(xml: string, sourceId: NewsSourceId): NewsItem[] {
  const itemBlocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];
  const results: NewsItem[] = [];

  for (const block of itemBlocks) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description');

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
  const url = NEWS_PROXY_BASE
    ? `${NEWS_PROXY_BASE}/${source.id}`
    : ALLORIGINS_PROXY + encodeURIComponent(source.feedUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`News fetch failed: ${res.status}`);
  const xml = await res.text();
  return parseXml(xml, source.id);
}

export async function fetchAllNews(ids: NewsSourceId[]): Promise<NewsItem[]> {
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

  return results.sort((a, b) => b.publishedAt - a.publishedAt);
}

export function clearNewsCache(): void {
  cache.clear();
}
