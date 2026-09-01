import { useEffect, useState } from 'react';
import type { AssetClass } from '@/core/db/types';
import { fetchMfNav } from '@/core/db/priceCache';
import { fetchStockQuote } from '@/core/portfolio/stockApiClient';

// Live price/quote for MF (NAV, 300ms debounce) and stock (Yahoo Finance,
// 700ms debounce). Returns the price plus stock display name and an
// "attempted" flag used to show a not-found hint. `setFetchedPrice` is
// exposed so MfFields' "Clear" button can reset state outside this hook's
// own lifecycle. All state updates run inside the timeout to satisfy
// react-hooks/set-state-in-effect.
//
// The stock branch's found/not-found/fetching display state (fetchedPrice,
// fetchedName, stockFetchAttempted) is deliberately only ever reset from
// *inside* the 700ms timeout callback below, never synchronously as the
// caller's raw keystrokes come in — StockFields.tsx used to clear these
// eagerly on every onChangeText, which made the "found stock" display
// flicker/reset on every character even though the actual network fetch was
// already correctly debounced. Resetting only when the timeout itself fires
// means the previous result stays visible while the user is still typing,
// and disappears exactly once, at the same moment a real new fetch attempt
// begins (found + fixed 2026-08-24).
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
        // Clear the previous symbol's result right here, not in the caller's onChangeText —
        // see the comment above this hook for why that distinction is the actual bug fix.
        setStockFetchAttempted(false);
        setFetchedPrice(null);
        setFetchedName('');
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
