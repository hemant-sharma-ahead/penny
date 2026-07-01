// Server-side vahandetails fetch (RC + challans). Returns RAW upstream JSON — all parsing stays in
// the client (src/core/vehicle/rcClient.ts), the single source of truth for the RC/challan shape.

const VAHAN_BASE = 'https://backend.vahandetails.com/api';

export interface VahanRaw {
  rc: unknown;
  challans: unknown;
}

/** Fetch RC details (+ challans) for a normalized reg number. Throws on RC failure / not-found. */
export async function fetchVahan(regno: string, apiKey: string): Promise<VahanRaw> {
  const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey };
  const body = JSON.stringify({ rc_number: regno });

  const [rcRes, chRes] = await Promise.all([
    fetch(`${VAHAN_BASE}/get-rc-details`, { method: 'POST', headers, body }),
    fetch(`${VAHAN_BASE}/get-challans-details`, { method: 'POST', headers, body })
  ]);

  if (!rcRes.ok) throw new Error(`RC fetch failed: ${rcRes.status}`);
  const rc = (await rcRes.json()) as { status?: unknown; data?: unknown; message?: string };
  if (!rc.status || !rc.data) throw new Error(typeof rc.message === 'string' ? rc.message : 'Vehicle not found');

  const challans = chRes.ok ? await chRes.json() : null;
  return { rc, challans };
}
