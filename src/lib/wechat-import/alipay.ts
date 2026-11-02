import { joinBoxes, normalizeText, parseDate } from './parse';
import type { ImportTransaction, OcrBox, OcrFields } from './types';

export function parseAlipayHeader(text: string, currentYear: number) {
  const normalized = normalizeText(text).replace(/[vV⌄▼∨▾]$/, '');
  const past = /^(\d{4})-(\d{1,2})$/.exec(normalized);
  const current = /^(\d{1,2})月$/.exec(normalized);
  if (!past && !current) return null;
  const year = past ? Number(past[1]) : currentYear;
  const month = Number(past ? past[2] : current![1]);
  return year >= 1900 && year <= 2199 && month >= 1 && month <= 12 ? { year, month } : null;
}

export function findAlipayHeader(boxes: OcrBox[], width: number, currentYear: number) {
  const candidates = boxes.filter(({ box }) => box[0] < width * 0.36);
  for (const candidate of candidates) {
    const center = (candidate.box[1] + candidate.box[3]) / 2;
    const line = candidates.filter(({ box }) => Math.abs((box[1] + box[3]) / 2 - center) < width * 0.025);
    const text = joinBoxes(line);
    const header = parseAlipayHeader(text, currentYear);
    if (header) return { ...header, text };
  }
  return null;
}

export function parseAlipayAmount(text: string, isRefund: boolean) {
  const match = /^([+-]?)[¥￥]?((?:\d{1,3}(?:,\d{3})+|\d+))\.(\d{2})$/.exec(normalizeText(text));
  if (!match) return null;
  const value = Number(match[2].replaceAll(',', '')) * 100 + Number(match[3]);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return {
    amount: isRefund ? -value : value,
    type: isRefund || match[1] === '-' ? 'expense' as const : 'income' as const,
  };
}

export function parseAlipayDate(text: string, header: { year: number; month: number } | null) {
  const match = /^(\d{1,2})-(\d{1,2})(\d{1,2}):(\d{2})$/.exec(normalizeText(text));
  return match ? parseDate(`${match[1]}月${match[2]}日${match[3]}:${match[4]}`, header) : null;
}

export function partitionAlipayFields(boxes: OcrBox[], width: number, height: number): OcrFields {
  const top = boxes.filter(({ box }) => (box[1] + box[3]) / 2 < height * 0.40);
  const amount: OcrBox[] = [];
  const description: OcrBox[] = [];
  for (const box of top) {
    if (box.box[0] >= width * 0.68) {
      amount.push(box);
      continue;
    }
    // PaddleOCR sometimes merges the description and the right-aligned amount into one box.
    const suffix = /([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})$/.exec(box.text);
    const prefix = suffix ? box.text.slice(0, suffix.index) : '';
    if (suffix && box.box[2] > width * 0.90 && /[.…\s\u3400-\u9fff】）)]$/.test(prefix)) {
      amount.push({ ...box, text: suffix[1] });
      description.push({ ...box, text: prefix });
    } else {
      description.push(box);
    }
  }
  const date = boxes.filter(({ box, text }) => box[0] < width * 0.65
    && (box[1] >= height * 0.60 || /^\d{1,2}-\d{1,2}/.test(normalizeText(text))));
  return {
    description, amount, date,
    ignored: boxes.filter((box) => !top.includes(box) && !date.includes(box)),
  };
}

export function parseAlipayStatus(fields: OcrFields, width: number) {
  const left = normalizeText(joinBoxes(fields.ignored.filter(({ box }) => box[0] < width * 0.65)));
  const right = normalizeText(joinBoxes(fields.ignored.filter(({ box }) => box[0] >= width * 0.65)));
  return {
    isRefund: left === '退款',
    fullyRefunded: right.includes('已全额退款'),
    closed: right.includes('交易关闭'),
  };
}

export function reconcileAlipayRefunds(rows: ImportTransaction[]) {
  const purchases = rows.filter((row) => row.fullyRefunded && !row.isRefund
    && row.type === 'expense' && row.amount !== null && row.amount > 0
    && row.occurredAt && Number.isFinite(Date.parse(row.occurredAt)));
  const refunds = rows.filter((row) => row.isRefund && row.type === 'expense'
    && row.amount !== null && row.amount < 0
    && row.occurredAt && Number.isFinite(Date.parse(row.occurredAt)));
  const candidates = purchases.flatMap((purchase) => refunds
    .filter((refund) => refund.amount === -purchase.amount!)
    .map((refund) => ({
      purchase, refund,
      distance: Math.abs(Date.parse(refund.occurredAt!) - Date.parse(purchase.occurredAt!)),
    }))).sort((a, b) => a.distance - b.distance);
  const matched = new Set<number>();
  const used = new Set<number>();
  for (const { purchase, refund } of candidates) {
    if (matched.has(purchase.id) || used.has(refund.id)) continue;
    refund.refundOfId = purchase.id;
    matched.add(purchase.id);
    used.add(refund.id);
  }
  let nextId = Math.min(0, ...rows.map((row) => row.id)) - 1;
  return rows.flatMap((row) => {
    if (!purchases.includes(row) || matched.has(row.id)) return [row];
    const refund: ImportTransaction = {
      ...row,
      id: nextId--,
      amount: -row.amount!,
      occurredAt: new Date(Date.parse(row.occurredAt!) + 60_000).toISOString(),
      notes: `退款（自动补全）：${row.notes ?? ''}`,
      isRefund: true,
      fullyRefunded: false,
      syntheticRefund: true,
      refundOfId: row.id,
      importDebug: { ...row.importDebug, errors: [...row.importDebug.errors] },
    };
    return [row, refund];
  });
}
