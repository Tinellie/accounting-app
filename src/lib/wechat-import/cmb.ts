import { joinBoxes, normalizeText, parseAmount, parseDate } from './parse';
import type { OcrBox, OcrFields, PreviewTransaction } from './types';

export function chinaToday(now = new Date()) {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function validScreenshotDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseCmbMonth(boxes: OcrBox[], width: number, screenshotDate: string) {
  const left = boxes.filter(({ box }) => box[0] < width * 0.45);
  const text = normalizeText(joinBoxes(left));
  const match = /^(\d{1,2})月(?:\/?(\d{4}))?$/.exec(text);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2] ?? screenshotDate.slice(0, 4));
  return month >= 1 && month <= 12 && year >= 1900 && year <= 2199 ? { year, month, text } : null;
}

export function parseCmbDay(text: string, month: { year: number; month: number } | null, screenshotDate: string) {
  const normalized = normalizeText(text);
  if (normalized === '今天' || normalized === '昨天') {
    if (!validScreenshotDate(screenshotDate)) return null;
    const date = new Date(`${screenshotDate}T00:00:00Z`);
    if (normalized === '昨天') date.setUTCDate(date.getUTCDate() - 1);
    const result = { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
    return month && result.year === month.year && result.month === month.month ? result : null;
  }
  const match = /^(\d{1,2})\.(\d{1,2})$/.exec(normalized);
  if (!match || !month || Number(match[1]) !== month.month) return null;
  const day = Number(match[2]);
  return parseDate(`${month.month}月${day}日00:00`, month) ? { ...month, day } : null;
}

export function parseCmbCardTime(text: string) {
  const match = /^(.*?卡)(\d{4})(\d{1,2}:\d{2})$/.exec(normalizeText(text));
  return match ? { card: `${match[1]}${match[2]}`, time: match[3] } : null;
}

export function parseCmbTime(text: string, day: { year: number; month: number; day: number } | null) {
  const card = parseCmbCardTime(text);
  return card && day ? parseDate(`${day.month}月${day.day}日${card.time}`, day) : null;
}

export function parseCmbAmount(text: string) {
  return parseAmount(normalizeText(text).replace(/[¥￥,]/g, ''));
}

export function partitionCmbFields(boxes: OcrBox[], width: number): OcrFields {
  const footer = boxes.filter(({ text, box }) => box[0] < width * 0.65
    && (normalizeText(text).includes('卡') || /\d{1,2}:\d{2}$/.test(normalizeText(text))));
  const footerTop = footer.length ? Math.min(...footer.map(({ box }) => box[1])) : Infinity;
  const top = boxes.filter(({ box }) => (box[1] + box[3]) / 2 < footerTop);
  const amount = top.filter(({ box }) => box[0] >= width * 0.65);
  const description = top.filter(({ box }) => box[0] < width * 0.65
    && (box[0] >= width * 0.15 || box[2] - box[0] >= width * 0.18));
  return { description, amount, date: footer, ignored: boxes.filter((box) => !description.includes(box) && !amount.includes(box) && !footer.includes(box)) };
}

export function cmbCardGroups(rows: PreviewTransaction[]) {
  return [...new Set(rows.map((row) => row.sourceCard ?? '未识别卡号'))].map((card) => {
    const group = rows.filter((row) => (row.sourceCard ?? '未识别卡号') === card);
    const accountId = group.every((row) => row.accountId === group[0].accountId) ? group[0].accountId : null;
    return { card, count: group.length, accountId };
  });
}
