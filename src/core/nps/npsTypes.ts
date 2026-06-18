export type NpsChoiceType = 'active' | 'auto';
export type NpsLifecycleFund = 'lc75' | 'lc50' | 'lc25' | 'blc';
export type NpsSchemeType = 'E' | 'C' | 'G' | 'A';

export const NPS_FUND_MANAGERS = [
  { key: 'sbi', label: 'SBI Pension Funds' },
  { key: 'lic', label: 'LIC Pension Fund' },
  { key: 'uti', label: 'UTI Retirement Solutions' },
  { key: 'hdfc', label: 'HDFC Pension Management' },
  { key: 'icici', label: 'ICICI Prudential Pension' },
  { key: 'kotak', label: 'Kotak Mahindra Pension Fund' },
  { key: 'aditya', label: 'Aditya Birla Sun Life Pension' },
  { key: 'tata', label: 'Tata Pension Management' },
  { key: 'axis', label: 'Axis Pension Fund' },
  { key: 'dsp', label: 'DSP Pension Fund' }
] as const;

export type NpsPfmKey = (typeof NPS_FUND_MANAGERS)[number]['key'];

export interface NpsSchemeEntry {
  code: string;
  pfmKey: NpsPfmKey;
  schemeType: NpsSchemeType;
  tier: 'I' | 'II';
  name: string;
}

export interface NpsNavDetail {
  code: string;
  nav: number;
  date: string;
  oneDay: number | null;
  oneMonth: number | null;
  oneYear: number | null;
  threeYear: number | null;
  fiveYear: number | null;
  fetchedAt: number;
}
