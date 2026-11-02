import { joinBoxes, normalizeText, parseDate } from './parse';
import type { OcrBox, OcrFields } from './types';

export function parseAlipayHkHeader(text: string) {
  const match = /^(\d{1,2})\/(\d{4})$/.exec(normalizeText(text).replace(/[vV⌄▼∨▾]$/, ''));
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  return month >= 1 && month <= 12 && year >= 1900 && year <= 2199 ? { year, month } : null;
}

export function findAlipayHkHeader(boxes: OcrBox[], width: number) {
  const candidates = boxes.filter(({ box }) => box[0] < width * 0.4);
  for (const candidate of candidates) {
    const center = (candidate.box[1] + candidate.box[3]) / 2;
    const line = candidates.filter(({ box }) => Math.abs((box[1] + box[3]) / 2 - center) < width * 0.025);
    const text = joinBoxes(line);
    const header = parseAlipayHkHeader(text);
    if (header) return { ...header, text };
  }
  return null;
}

export function parseAlipayHkAmount(text: string) {
  const match = /^([+-])HKD((?:\d{1,3}(?:,\d{3})+|\d+))\.(\d{2})$/.exec(normalizeText(text));
  if (!match) return null;
  const amount = Number(match[2].replaceAll(',', '')) * 100 + Number(match[3]);
  return Number.isSafeInteger(amount) && amount > 0
    ? { amount, type: match[1] === '-' ? 'expense' as const : 'income' as const } : null;
}

export function parseAlipayHkDate(text: string, header: { year: number; month: number } | null) {
  const match = /^(\d{2})\/(\d{2})(\d{2}):(\d{2})$/.exec(normalizeText(text));
  return match ? parseDate(`${match[2]}月${match[1]}日${match[3]}:${match[4]}`, header) : null;
}

export function partitionAlipayHkFields(boxes: OcrBox[], width: number): OcrFields {
  const content = boxes.filter(({ box }) => box[0] >= width * 0.17);
  const date = content.filter(({ text, box }) => box[0] < width * 0.65
    && /^\d{2}\/\d{2}/.test(normalizeText(text)));
  const dateTop = date.length ? Math.min(...date.map(({ box }) => box[1])) : Infinity;
  const top = content.filter((box) => !date.includes(box) && (box.box[1] + box.box[3]) / 2 < dateTop);
  const amount: OcrBox[] = [];
  const description: OcrBox[] = [];
  for (const box of top) {
    const suffix = /([+\-−–—﹣]\s*HKD\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2})$/.exec(box.text);
    if (suffix && box.box[2] > width * 0.85) {
      amount.push({ ...box, text: suffix[1] });
      if (suffix.index > 0) description.push({ ...box, text: box.text.slice(0, suffix.index) });
    } else if (box.box[0] >= width * 0.65) {
      amount.push(box);
    } else description.push(box);
  }
  return { description, amount, date, ignored: boxes.filter((box) => !top.includes(box) && !date.includes(box)) };
}
