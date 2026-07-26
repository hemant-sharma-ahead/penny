import { useEffect, useState } from 'react';
import { searchMfSchemes, type MfSearchResult } from '@/core/portfolio/mfApiClient';

// Debounced (400ms) MFAPI.in fund search. Disabled when not MF, when the query
// is too short, or once a scheme has been picked. Mirrors the original effect:
// all state changes happen inside a timeout so the dropdown clears on the next
// tick rather than synchronously.
export function useMfSearch(enabled: boolean, query: string, schemeCode: string) {
  const [results, setResults] = useState<MfSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!enabled || query.trim().length < 2 || !!schemeCode) {
      const t = setTimeout(() => {
        setResults([]);
        setDropdownOpen(false);
      }, 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchMfSchemes(query.trim());
        setResults(r);
        setDropdownOpen(r.length > 0);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [enabled, query, schemeCode]);

  return { results, searching, dropdownOpen, setDropdownOpen };
}
