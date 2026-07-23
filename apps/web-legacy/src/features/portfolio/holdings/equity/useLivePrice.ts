import { useEffect, useState } from 'react';
import type { AssetClass } from '@/core/db/types';
import { fetchMfNav } from '@/core/db/priceCache';
import { fetchStockQuote } from '@/core/portfolio/stockApiClient';

// Live price/quote for MF (NAV, 300ms debounce) and stock (Yahoo Finance,
// 700ms debounce). Returns the price plus stock display name and an
// "attempted" flag used to show a not-found hint. Setters are exposed so the
// MF/stock field sections can clear state from their "Clear" buttons.
// All state updates run inside the timeout to satisfy react-hooks/set-state-in-effect.
export function useLivePrice(assetClass: AssetClass, schemeCode: string, symbol: string) {
  const [fetchedPrice, setFetchedPrice] = useState<number | null>(null);
  const [priceFetching, setPriceFetching] = useState(false);
  const [fetchedName, setFetchedName] = useState('');
  const [stockFetchAttempted, setStockFetchAttempted] = useState(false);

  useEffect(() => {
    if (assetClass === 'mf') {
      const sc = schemeCode.trim();
      if (!sc) {
        const t = setTimeout(() => {
          setFetchedPrice(null);
          setPriceFetching(false);
        }, 0);
        return () => clearTimeout(t);
      }
      const t = setTimeout(async () => {
        setPriceFetching(true);
        try {
          const nav = await fetchMfNav(sc);
          setFetchedPrice(nav);
        } catch {
          setFetchedPrice(null);
        } finally {
          setPriceFetching(false);
        }
      }, 300);
      return () => clearTimeout(t);
    }

    if (assetClass === 'stock') {
      const sym = symbol.trim();
      if (!sym) {
        const t = setTimeout(() => {
          setFetchedPrice(null);
          setPriceFetching(false);
          setStockFetchAttempted(false);
          setFetchedName('');
        }, 0);
        return () => clearTimeout(t);
      }
      const t = setTimeout(async () => {
        setStockFetchAttempted(false);
        setPriceFetching(true);
        try {
          const quote = await fetchStockQuote(sym);
          setFetchedPrice(quote.price);
          setFetchedName(quote.name);
        } catch {
          setFetchedPrice(null);
          setFetchedName('');
        } finally {
          setPriceFetching(false);
          setStockFetchAttempted(true);
        }
      }, 700);
      return () => clearTimeout(t);
    }

    const t = setTimeout(() => {
      setFetchedPrice(null);
    }, 0);
    return () => clearTimeout(t);
  }, [assetClass, schemeCode, symbol]);

  return {
    fetchedPrice,
    setFetchedPrice,
    priceFetching,
    fetchedName,
    setFetchedName,
    stockFetchAttempted,
    setStockFetchAttempted
  };
}
