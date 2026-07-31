/** Risk profile → accent colour for goal progress rings and badges. */
export const RISK_COLORS: Record<string, string> = {
  conservative: '#3b82f6',
  moderate: '#10b981',
  aggressive: '#ef4444'
};

/** Risk profile → assumed annual return (%) used for SIP projections. */
export const RISK_RETURNS: Record<string, number> = {
  conservative: 7,
  moderate: 11,
  aggressive: 14
};

export function getRiskColor(risk: string): string {
  return RISK_COLORS[risk] ?? '#10b981';
}

export function getRiskReturn(risk: string): number {
  return RISK_RETURNS[risk] ?? 11;
}
