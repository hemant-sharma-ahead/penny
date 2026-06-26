import { useEffect, useState } from 'react';
import type { Holding } from '@/core/db/types';
import { fetchMfSchemeDetail, type MfSchemeDetail } from '@/core/portfolio/mfApiClient';

// Owns the MF scheme detail (fund house / category / type). Seeds from the
// holding being edited, then refreshes from MFAPI.in whenever the scheme code
// changes. A failed fetch leaves the existing detail untouched.
export function useMfSchemeDetail(enabled: boolean, schemeCode: string, editing: Holding | null) {
  const [schemeDetail, setSchemeDetail] = useState<MfSchemeDetail | null>(
    editing?.assetMeta?.mfFundHouse
      ? {
          fundHouse: editing.assetMeta.mfFundHouse ?? '',
          schemeCategory: editing.assetMeta.mfSchemeCategory ?? '',
          schemeType: editing.assetMeta.mfSchemeType ?? ''
        }
      : null
  );

  useEffect(() => {
    if (!enabled || !schemeCode.trim()) return;
    let cancelled = false;
    void (async () => {
      const detail = await fetchMfSchemeDetail(schemeCode.trim());
      if (!cancelled && detail) setSchemeDetail(detail);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, schemeCode]);

  return { schemeDetail, setSchemeDetail };
}
