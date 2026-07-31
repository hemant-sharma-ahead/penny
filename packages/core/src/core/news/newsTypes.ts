export type NewsSourceId = 'et-markets' | 'mint' | 'rbi' | 'sebi';

export interface NewsSource {
  id: NewsSourceId;
  label: string;
  category: 'markets' | 'regulatory';
  feedUrl: string;
  color: string;
}

export interface NewsItem {
  id: string;
  sourceId: NewsSourceId;
  title: string;
  link: string;
  publishedAt: number;
  summary?: string;
}
