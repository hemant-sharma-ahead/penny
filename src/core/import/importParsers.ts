export interface ParsedRow {
  date: number; // epoch ms
  amount: number; // always positive
  description: string;
  categoryName: string; // raw name from file
  type: 'expense' | 'income' | 'transfer';
  paymentMode?: string;
  hashtags: string[];
  notes?: string;
}

export type ImportFormat = 'penny' | 'ynab' | 'cashew' | 'moneyview';

// CSV line parser — handles double-quoted fields with escaped quotes
function splitLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === ',' && !inQ) {
      cols.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}

function parseLines(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map(splitLine);
}

function parseDMY(s: string): number {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getTime();
}

function parseMDY(s: string): number {
  const [m, d, y] = s.split('/').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getTime();
}

function parseAmt(s: string): number {
  return Math.abs(parseFloat(s.replace(/[,₹\s]/g, '')) || 0);
}

function parseTags(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean);
}

// Penny CSV: Date(DD/MM/YYYY), Amount, Description, Category, Type, PaymentMode, Tags, Notes
export function parsePennyCsv(text: string): ParsedRow[] {
  const [, ...rows] = parseLines(text);
  return rows.flatMap((cols) => {
    const [dateStr, amountStr, desc, cat, typeStr, pm, tags, notes] = cols;
    if (!dateStr || !amountStr || !desc) return [];
    const amount = parseAmt(amountStr);
    if (!amount) return [];
    const rawType = (typeStr ?? '').toLowerCase();
    const type: ParsedRow['type'] = rawType === 'income' ? 'income' : rawType === 'transfer' ? 'transfer' : 'expense';
    return [
      {
        date: parseDMY(dateStr),
        amount,
        description: desc,
        categoryName: cat ?? 'Other',
        type,
        ...(pm && { paymentMode: pm }),
        hashtags: parseTags(tags ?? ''),
        ...(notes?.trim() && { notes: notes.trim() })
      }
    ];
  });
}

// YNAB: Date(MM/DD/YYYY), Payee, [Category,] Memo, Outflow, Inflow  —or—  Date, Payee, Memo, Amount
export function parseYnabCsv(text: string): ParsedRow[] {
  const [header, ...rows] = parseLines(text);
  if (!header) return [];
  const h = header.map((c) => c.toLowerCase());
  const iDate = h.findIndex((c) => c.includes('date'));
  const iPayee = h.findIndex((c) => c.includes('payee'));
  const iMemo = h.findIndex((c) => c.includes('memo'));
  const iOutflow = h.findIndex((c) => c.includes('outflow'));
  const iInflow = h.findIndex((c) => c.includes('inflow'));
  const iAmount = h.findIndex((c) => c === 'amount');
  const iCat = h.findIndex((c) => c.includes('category'));

  return rows.flatMap((cols) => {
    const dateStr = cols[iDate] ?? '';
    const desc = (cols[iPayee] ?? cols[iMemo] ?? '').trim();
    const cat = (iCat >= 0 ? (cols[iCat] ?? '') : '').trim();
    if (!dateStr || !desc) return [];

    let amount = 0;
    let type: ParsedRow['type'] = 'expense';

    if (iOutflow >= 0 && iInflow >= 0) {
      const out = parseAmt(cols[iOutflow] ?? '0');
      const inc = parseAmt(cols[iInflow] ?? '0');
      if (out > 0) {
        amount = out;
        type = 'expense';
      } else if (inc > 0) {
        amount = inc;
        type = 'income';
      }
    } else if (iAmount >= 0) {
      const raw = parseFloat((cols[iAmount] ?? '0').replace(/[,\s]/g, '')) || 0;
      amount = Math.abs(raw);
      type = raw < 0 ? 'expense' : 'income';
    }
    if (!amount) return [];

    return [
      {
        date: parseMDY(dateStr),
        amount,
        description: desc,
        categoryName: cat || 'Other',
        type,
        hashtags: []
      }
    ];
  });
}

// Cashew: Date(YYYY-MM-DD), Title, Amount(neg=expense), Category, Account, [Notes]
export function parseCashewCsv(text: string): ParsedRow[] {
  const [header, ...rows] = parseLines(text);
  if (!header) return [];
  const h = header.map((c) => c.toLowerCase());
  const iDate = h.findIndex((c) => c.includes('date'));
  const iTitle = h.findIndex((c) => c.includes('title') || c.includes('name') || c.includes('description'));
  const iAmount = h.findIndex((c) => c.includes('amount'));
  const iCat = h.findIndex((c) => c.includes('category'));
  const iNote = h.findIndex((c) => c.includes('note'));

  return rows.flatMap((cols) => {
    const dateStr = (cols[iDate] ?? '').trim();
    const desc = (cols[iTitle] ?? '').trim();
    const raw = parseFloat((cols[iAmount] ?? '0').replace(/[,\s]/g, '')) || 0;
    const cat = (iCat >= 0 ? (cols[iCat] ?? '') : '').trim();
    if (!dateStr || !desc || !raw) return [];
    return [
      {
        date: new Date(dateStr).getTime(),
        amount: Math.abs(raw),
        description: desc,
        categoryName: cat || 'Other',
        type: raw < 0 ? 'expense' : 'income',
        ...(iNote >= 0 && cols[iNote] ? { notes: cols[iNote] as string } : {}),
        hashtags: []
      }
    ];
  });
}

// MoneyView: Date(DD-Mon-YYYY or DD/MM/YYYY), Description, Amount(neg=expense), Category, Type
export function parseMoneyViewCsv(text: string): ParsedRow[] {
  const [header, ...rows] = parseLines(text);
  if (!header) return [];
  const h = header.map((c) => c.toLowerCase());
  const iDate = h.findIndex((c) => c.includes('date'));
  const iDesc = h.findIndex(
    (c) => c.includes('desc') || c.includes('narration') || c.includes('detail') || c.includes('particulars')
  );
  const iAmount = h.findIndex((c) => c.includes('amount'));
  const iCat = h.findIndex((c) => c.includes('category') || c.includes('subcategory'));

  return rows.flatMap((cols) => {
    const dateStr = (cols[iDate] ?? '').trim();
    const desc = (iDesc >= 0 ? (cols[iDesc] ?? '') : (cols[1] ?? '')).trim();
    const raw = parseFloat((cols[iAmount] ?? '0').replace(/[,₹\s]/g, '')) || 0;
    const cat = (iCat >= 0 ? (cols[iCat] ?? '') : '').trim();
    if (!dateStr || !desc || !raw) return [];
    return [
      {
        date: new Date(dateStr).getTime(),
        amount: Math.abs(raw),
        description: desc,
        categoryName: cat || 'Other',
        type: raw < 0 ? 'expense' : 'income',
        hashtags: []
      }
    ];
  });
}

export function parseByFormat(text: string, format: ImportFormat): ParsedRow[] {
  switch (format) {
    case 'penny':
      return parsePennyCsv(text);
    case 'ynab':
      return parseYnabCsv(text);
    case 'cashew':
      return parseCashewCsv(text);
    case 'moneyview':
      return parseMoneyViewCsv(text);
  }
}

export const PENNY_TEMPLATE = [
  'Date,Amount,Description,Category,Type,PaymentMode,Tags,Notes',
  '14/06/2026,450,Groceries from DMart,Groceries,expense,UPI,#groceries,Weekly shop',
  '14/06/2026,22000,Rent payment,Rent,expense,NetBanking,,',
  '13/06/2026,3500,Dinner at restaurant,Dining & Café,expense,Card,#dining,',
  '12/06/2026,95000,Salary credit,Salary,income,NetBanking,,',
  '11/06/2026,1200,Netflix subscription,Subscriptions,expense,Card,#ott,'
].join('\n');
