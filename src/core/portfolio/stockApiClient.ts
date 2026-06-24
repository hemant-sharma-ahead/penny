// Yahoo Finance chart-API client — live quote (price + display name) for an
// Indian equity symbol. Defaults to the NSE (.NS) suffix when none is given.
import { YF_BASE } from '@/core/db/priceCache';

export interface StockQuote {
  price: number | null;
  name: string;
}

export async function fetchStockQuote(symbol: string): Promise<StockQuote> {
  interface YfChartMeta {
    regularMarketPrice?: number;
    shortName?: string;
    longName?: string;
  }
  interface YfChartResp {
    chart?: { result?: Array<{ meta?: YfChartMeta }> };
  }
  try {
    const sym = symbol.trim().toUpperCase();
    const yfSymbol = sym.endsWith('.NS') || sym.endsWith('.BO') ? sym : `${sym}.NS`;
    const res = await fetch(`${YF_BASE}/v8/finance/chart/${yfSymbol}?interval=1d&range=1d`);
    if (!res.ok) return { price: null, name: '' };
    const json = (await res.json()) as YfChartResp;
    const meta = json.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? null;
    const name = meta?.longName ?? meta?.shortName ?? '';
    return { price: typeof price === 'number' ? price : null, name };
  } catch {
    return { price: null, name: '' };
  }
}
