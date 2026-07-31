import { useEffect, useMemo, useState } from 'react';

type ZxcvbnFn = (password: string) => { score: number };

/**
 * Lazy-loads zxcvbn (a large dictionary bundle, kept out of the initial chunk)
 * and returns the strength score (0–4) for the given passphrase. Score is 0
 * until the module has loaded.
 */
export function usePassphraseStrength(passphrase: string): { score: number; ready: boolean } {
  const [zxcvbnFn, setZxcvbnFn] = useState<ZxcvbnFn | null>(null);

  useEffect(() => {
    let active = true;
    void import('zxcvbn').then((m) => {
      if (active) setZxcvbnFn(() => m.default as ZxcvbnFn);
    });
    return () => {
      active = false;
    };
  }, []);

  const score = useMemo(() => (passphrase && zxcvbnFn ? zxcvbnFn(passphrase).score : 0), [passphrase, zxcvbnFn]);

  return { score, ready: zxcvbnFn !== null };
}
