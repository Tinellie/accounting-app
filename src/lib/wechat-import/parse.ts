import type { OcrBox, OcrFields } from './types';

export function normalizeText(text: string): string {
  return text.normalize('NFKC').replace(/[−–—﹣]/g, '-').replace(/\s+/g, '');
}

export function parseHeader(text: string): { year: number; month: number } | null {
  const match = /^(\d{4})年(\d{1,2})月$/.exec(normalizeText(text).replace(/[vV⌄▼∨]$/, ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1900 && year <= 2199 && month >= 1 && month <= 12 ? { year, month } : null;
}

export function parseAmount(text: string): { amount: number; type: 'expense' | 'income' } | null {
  const match = /^([+-])(?:[¥￥])?((?:\d{1,3}(?:,\d{3})+|\d+))(?:\.(\d{2}))$/.exec(normalizeText(text));
  if (!match) return null;
  const amount = Number(match[2].replaceAll(',', '')) * 100 + Number(match[3]);
  if (!Number.isSafeInteger(amount)) return null;
  return { amount, type: match[1] === '-' ? 'expense' : 'income' };
}

export function parseDate(text: string, header: { year: number; month: number } | null): Date | null {
  const match = /^(\d{1,2})月(\d{1,2})日(\d{1,2}):(\d{2})$/.exec(normalizeText(text));
  if (!match || !header) return null;
  const [, monthText, dayText, hourText, minuteText] = match;
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (month !== header.month || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  // Screenshot times are Chinese local times, independent of the server timezone.
  const value = new Date(`${header.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`);
  const local = new Date(value.getTime() + 8 * 60 * 60 * 1000);
  return local.getUTCFullYear() === header.year && local.getUTCMonth() + 1 === month && local.getUTCDate() === day
    ? value : null;
}

export function joinBoxes(boxes: OcrBox[]): string {
  return [...boxes].sort((a, b) => a.box[0] - b.box[0]).map((box) => box.text).join('');
}

export function partitionFields(boxes: OcrBox[], width: number, height: number): OcrFields {
  const centers = boxes.map(({ box }) => (box[1] + box[3]) / 2).sort((a, b) => a - b);
  let boundary = height * 0.52;
  let largestGap = height * 0.12;
  for (let index = 1; index < centers.length; index++) {
    const gap = centers[index] - centers[index - 1];
    if (gap > largestGap) {
      largestGap = gap;
      boundary = (centers[index] + centers[index - 1]) / 2;
    }
  }
  const top = boxes.filter(({ box }) => (box[1] + box[3]) / 2 < boundary);
  const bottom = boxes.filter((box) => !top.includes(box));
  const amount = top.filter(({ box }) => box[0] >= width * 0.62);
  const date = bottom.filter(({ box }) => box[0] < width * 0.55);
  const description = top.filter((box) => !amount.includes(box));
  return {
    description,
    amount,
    date,
    ignored: boxes.filter((box) => !description.includes(box) && !amount.includes(box) && !date.includes(box)),
  };
}

export function fieldErrors(
  amount: ReturnType<typeof parseAmount>,
  date: Date | null,
  header: { year: number; month: number } | null,
): string[] {
  return [
    ...(!amount ? ['无法识别有效的带正负号金额（需保留两位小数）'] : []),
    ...(!header ? ['上方缺少有效年月标题，无法确定交易年份'] : []),
    ...(!date ? ['无法识别有效日期时间，或与所属月份不一致'] : []),
  ];
}
