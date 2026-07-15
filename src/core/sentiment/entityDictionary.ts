// Bundled NSE/BSE company dictionary (news-sentiment Phase B, offline). Maps a company + its common
// aliases → { symbol, sector }, so a headline can be linked to the stocks a user owns. PUBLIC data —
// no user data involved. Starter set of widely-held names; grows over time (and can later be
// worker-refreshed like the lexicon). Symbols are plain NSE tickers (no exchange suffix).

export interface EntityEntry {
  symbol: string;
  name: string;
  sector: string;
  /** Lowercase phrases that identify this company in a headline (word-boundary matched). */
  aliases: string[];
}

export const ENTITIES: EntityEntry[] = [
  {
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    sector: 'Energy',
    aliases: ['reliance industries', 'reliance', 'ril']
  },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT', aliases: ['tata consultancy', 'tcs'] },
  { symbol: 'INFY', name: 'Infosys', sector: 'IT', aliases: ['infosys'] },
  { symbol: 'WIPRO', name: 'Wipro', sector: 'IT', aliases: ['wipro'] },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'IT', aliases: ['hcl technologies', 'hcl tech'] },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT', aliases: ['tech mahindra'] },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', sector: 'Banking', aliases: ['hdfc bank'] },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', sector: 'Banking', aliases: ['icici bank', 'icici'] },
  {
    symbol: 'SBIN',
    name: 'State Bank of India',
    sector: 'Banking',
    aliases: ['state bank of india', 'state bank', 'sbi']
  },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking', aliases: ['kotak mahindra', 'kotak'] },
  { symbol: 'AXISBANK', name: 'Axis Bank', sector: 'Banking', aliases: ['axis bank'] },
  { symbol: 'PNB', name: 'Punjab National Bank', sector: 'Banking', aliases: ['punjab national bank', 'pnb'] },
  { symbol: 'BANKBARODA', name: 'Bank of Baroda', sector: 'Banking', aliases: ['bank of baroda'] },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Finance', aliases: ['bajaj finance'] },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Finance', aliases: ['bajaj finserv'] },
  { symbol: 'LICI', name: 'LIC', sector: 'Insurance', aliases: ['life insurance corporation', 'lic'] },
  { symbol: 'HDFCLIFE', name: 'HDFC Life', sector: 'Insurance', aliases: ['hdfc life'] },
  { symbol: 'SBILIFE', name: 'SBI Life', sector: 'Insurance', aliases: ['sbi life'] },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG', aliases: ['hindustan unilever', 'hul'] },
  { symbol: 'ITC', name: 'ITC', sector: 'FMCG', aliases: ['itc'] },
  { symbol: 'NESTLEIND', name: 'Nestle India', sector: 'FMCG', aliases: ['nestle'] },
  { symbol: 'BRITANNIA', name: 'Britannia', sector: 'FMCG', aliases: ['britannia'] },
  { symbol: 'DABUR', name: 'Dabur', sector: 'FMCG', aliases: ['dabur'] },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', sector: 'Auto', aliases: ['maruti suzuki', 'maruti'] },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Auto', aliases: ['tata motors'] },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'Auto', aliases: ['mahindra & mahindra', 'm&m'] },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Auto', aliases: ['bajaj auto'] },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Auto', aliases: ['eicher', 'royal enfield'] },
  { symbol: 'SUNPHARMA', name: 'Sun Pharma', sector: 'Pharma', aliases: ['sun pharma'] },
  { symbol: 'DRREDDY', name: "Dr Reddy's", sector: 'Pharma', aliases: ["dr reddy's", 'dr reddy'] },
  { symbol: 'CIPLA', name: 'Cipla', sector: 'Pharma', aliases: ['cipla'] },
  { symbol: 'DIVISLAB', name: "Divi's Labs", sector: 'Pharma', aliases: ["divi's", 'divis'] },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', aliases: ['bharti airtel', 'airtel'] },
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure', aliases: ['larsen & toubro', 'larsen'] },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Consumer', aliases: ['asian paints'] },
  { symbol: 'TITAN', name: 'Titan', sector: 'Consumer', aliases: ['titan'] },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Cement', aliases: ['ultratech'] },
  { symbol: 'GRASIM', name: 'Grasim', sector: 'Cement', aliases: ['grasim'] },
  { symbol: 'POWERGRID', name: 'Power Grid', sector: 'Power', aliases: ['power grid'] },
  { symbol: 'NTPC', name: 'NTPC', sector: 'Power', aliases: ['ntpc'] },
  { symbol: 'ONGC', name: 'ONGC', sector: 'Energy', aliases: ['ongc'] },
  { symbol: 'GAIL', name: 'GAIL', sector: 'Energy', aliases: ['gail'] },
  { symbol: 'IOC', name: 'Indian Oil', sector: 'Energy', aliases: ['indian oil'] },
  { symbol: 'COALINDIA', name: 'Coal India', sector: 'Mining', aliases: ['coal india'] },
  { symbol: 'TATASTEEL', name: 'Tata Steel', sector: 'Metals', aliases: ['tata steel'] },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', sector: 'Metals', aliases: ['jsw steel'] },
  { symbol: 'HINDALCO', name: 'Hindalco', sector: 'Metals', aliases: ['hindalco'] },
  { symbol: 'VEDL', name: 'Vedanta', sector: 'Metals', aliases: ['vedanta'] },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Conglomerate', aliases: ['adani enterprises'] },
  { symbol: 'ADANIPORTS', name: 'Adani Ports', sector: 'Infrastructure', aliases: ['adani ports'] },
  { symbol: 'DMART', name: 'Avenue Supermarts (DMart)', sector: 'Retail', aliases: ['avenue supermarts', 'dmart'] },
  { symbol: 'ZOMATO', name: 'Zomato', sector: 'Consumer Tech', aliases: ['zomato', 'eternal'] },
  { symbol: 'PAYTM', name: 'Paytm', sector: 'Fintech', aliases: ['paytm', 'one97'] },
  { symbol: 'IRCTC', name: 'IRCTC', sector: 'Travel', aliases: ['irctc'] }
];
