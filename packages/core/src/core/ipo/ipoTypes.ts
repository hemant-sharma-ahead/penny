export type IpoStatus = 'upcoming' | 'open' | 'closed' | 'listed';
export type IpoCategory = 'mainboard' | 'sme';

export interface IpoItem {
  id: number;
  name: string;
  category: IpoCategory;
  status: IpoStatus;
  price: number | null;
  lotSize: number | null;
  issueSize: string | null;
  openDate: string | null;
  closeDate: string | null;
  boaDate: string | null;
  listingDate: string | null;
  gmpValue: number | null;
  gmpPercent: number;
  subscription: string | null;
  listingGain: number | null;
  listingPrice: number | null;
  detailPath: string;
  updatedAt: string;
}

export interface IpoCache {
  data: IpoItem[];
  fetchedAt: number;
}

export interface IpoSubRow {
  seq: number;
  bidDate: string;
  qib: string;
  nii: string;
  niiBig: string;
  niiSmall: string;
  rii: string;
  emp: string;
  total: string;
}

export interface IpoSubDetail {
  rows: IpoSubRow[];
  fetchedAt: number;
}

// Raw shape returned by investorgain.com performance-history endpoint (report 486)
export interface RawHistoricalIpoRow {
  '~id': number;
  '~orderby': number;
  IPO: string;
  Symbol: string;
  'Listing Date': string; // "31-Dec-2024"
  IPO_Size: number;
  Subscription: string;
  'IPO Price': string; // "&#8377;239.00"
  'Listing Price': string; // HTML span with price and gain%
  LTP: string; // HTML span
  LTP_Percent: string;
  '~URLRewrite_Folder_Name': string;
  'Last Updated': string;
  '~IPO_Category': 'IPO' | 'SME';
}

// Raw shape returned by investorgain.com internal API
export interface RawIpoRow {
  '~id': number;
  '~ipo_name': string;
  '~gmp_percent_calc': string;
  '~Srt_Open': string;
  '~Srt_Close': string;
  '~Srt_BoA_Dt': string;
  '~Str_Listing': string;
  '~IPO_Category': string;
  '~Highlight_Row': string;
  '~urlrewrite_folder_name': string;
  Name: string;
  GMP: string;
  Sub: string;
  'Price (₹)': string;
  'IPO Size': string;
  Lot: string;
  'Updated-On': string;
  [key: string]: unknown;
}

export interface RawIpoResponse {
  reportTableData: RawIpoRow[];
  totalRecords: number;
  currentTime: string;
}
