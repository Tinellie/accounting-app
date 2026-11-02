import type { TransactionData } from '../transaction-data';

export type StatementText = { text: string; x: number; y: number; width: number };
export type StatementPage = {
  page: number;
  width: number;
  height: number;
  items: StatementText[];
  horizontalLines: { left: number; right: number; y: number }[];
};
export type StatementRow = {
  date: string | null;
  amount: number | null;
  type: 'expense' | 'income' | null;
  description: string;
  data: TransactionData;
  errors: string[];
  lines: { page: number; text: string; y: number }[];
};

const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function parseStatementDate(text: string) {
  const match = /^(\d{2})\s+([A-Z]{3})\s+(\d{4})$/.exec(text.trim().toUpperCase());
  if (!match) return null;
  const month = months.indexOf(match[2]) + 1;
  const date = `${match[3]}-${String(month).padStart(2, '0')}-${match[1]}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return month && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function parseStatementAmount(text: string) {
  const match = /^((?:\d{1,3}(?:,\d{3})+|\d+))\.(\d{2})(-?)$/.exec(text.replace(/\s+/g, ''));
  if (!match) return null;
  const amount = Number(match[1].replaceAll(',', '')) * 100 + Number(match[2]);
  return Number.isSafeInteger(amount) && amount > 0
    ? { amount, type: match[3] ? 'income' as const : 'expense' as const } : null;
}

function join(items: StatementText[]) {
  return [...items].sort((a, b) => a.x - b.x).map(({ text }) => text.trim()).filter(Boolean).join(' ');
}

function attach(row: StatementRow | undefined, text: string, page: number, y: number) {
  if (!row) throw new Error(`第 ${page} 页存在没有所属交易的附属数据`);
  row.lines.push({ page, text, y });
  const foreign = /^\(FOREIGN CURRENCY AMOUNT:\s*([A-Z]{3})\s+([\d,]+(?:\.\d+)?)\)$/.exec(text);
  const exchange = /^\(EXCHANGE RATE\*?:\s*(\d+(?:\.\d+)?)\)$/.exec(text);
  const cri = /^CRI:\s*(\S+)$/.exec(text);
  const purchase = /^\(PURCHASE ID:\s*(.+)\)$/.exec(text);
  if (foreign) {
    row.data.foreignCurrencyAmount = { currency: foreign[1], amount: foreign[2].replaceAll(',', '') };
  } else if (exchange) {
    row.data.exchangeRate = exchange[1];
  } else if (cri) {
    row.data.cri = cri[1];
  } else if (purchase) {
    row.data.purchaseId = purchase[1];
  } else {
    row.errors.push(`无法解析附属数据：${text}`);
  }
}

export function parseHangSengPages(pages: StatementPage[]): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const page of pages) {
    const header = page.items.find(({ text }) => text.trim() === 'TRANS DATE');
    if (!header) continue;
    const borders = page.horizontalLines.filter((line) => line.left < page.width * 0.06
      && line.right > page.width * 0.94 && line.y < header.y).sort((a, b) => b.y - a.y);
    const top = borders[0]?.y;
    const bottom = borders.find((line) => top !== undefined && line.y < top - 15)?.y;
    if (top === undefined || bottom === undefined) throw new Error(`第 ${page.page} 页无法定位账目方框边界`);
    const items = page.items.filter(({ y, text }) => text.trim() && y < top && y > bottom);
    const lines: { y: number; items: StatementText[] }[] = [];
    for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - item.y) < 2) last.items.push(item);
      else lines.push({ y: item.y, items: [item] });
    }
    for (const line of lines) {
      const text = join(line.items);
      if (/FINANCE CHARGE RATES|REWARDS PROGRAMME|SUMMARY OF ACTIVITY|THE MONTHLY RATE|^\+[-+ ]{10,}/.test(text)) break;
      if (/^OPENING BALANCE\b|^\d{4}(?:\s+\d{4}){3}\b/.test(text)) continue;
      const details = join(line.items.filter(({ x }) => x >= page.width * 0.25));
      if (/^\(?FOREIGN CURRENCY AMOUNT|^\(?EXCHANGE RATE|^CRI:|^\(?PURCHASE ID/.test(details)) {
        attach(rows[rows.length - 1], details, page.page, line.y);
        continue;
      }
      const trans = join(line.items.filter(({ x }) => x < page.width * 0.145));
      const post = join(line.items.filter(({ x }) => x >= page.width * 0.145 && x < page.width * 0.26));
      const description = join(line.items.filter(({ x }) => x >= page.width * 0.26 && x < page.width * 0.47));
      const address = join(line.items.filter(({ x }) => x >= page.width * 0.47 && x < page.width * 0.59));
      const regionCode = join(line.items.filter(({ x }) => x >= page.width * 0.59 && x < page.width * 0.72));
      const amountText = join(line.items.filter(({ x }) => x >= page.width * 0.72));
      if (!trans && !post && !amountText) {
        if (description && rows.length) {
          rows[rows.length - 1].description += ` ${details}`;
          rows[rows.length - 1].lines.push({ page: page.page, text, y: line.y });
        }
        continue;
      }
      const date = parseStatementDate(trans);
      const postingDate = parseStatementDate(post);
      const money = parseStatementAmount(amountText);
      rows.push({
        date, amount: money?.amount ?? null, type: money?.type ?? null,
        description: `${description}${address ? ` (${address})` : ''}`,
        data: { postingDate, address, regionCode },
        errors: [
          ...(!date ? [`交易日期无效：${trans}`] : []),
          ...(!postingDate ? [`过账日期无效：${post}`] : []),
          ...(!money ? [`金额无效：${amountText}`] : []),
          ...(!description ? ['交易描述为空'] : []),
        ],
        lines: [{ page: page.page, text, y: line.y }],
      });
    }
  }
  return rows;
}
