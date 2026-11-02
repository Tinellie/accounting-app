import { parseStatementAmount, parseStatementDate, type StatementPage, type StatementRow, type StatementText } from './hangseng';
import { recognize, ImportError } from './server';

type TableLayout = {
  top: number;
  bottom: number;
  description: number;
  chinese: number;
  deposit: number;
  withdrawal: number;
  balance: number;
};

function join(items: StatementText[]) {
  return [...items].sort((a, b) => a.x - b.x).map(({ text }) => text.trim()).filter(Boolean).join(' ');
}

export function bankTableLayout(page: StatementPage, continuation = false): TableLayout | null {
  const title = page.items.find(({ text }) => /TRANSACTION\s+HISTORY/i.test(text));
  if (!title && !continuation) return null;
  const date = page.items.find(({ text, y }) => text.trim() === 'Date' && (!title || y < title.y));
  if (!date) {
    if (title) throw new Error(`第 ${page.page} 页缺少进支记录表头`);
    return null;
  }
  const column = (name: string) => page.items.find(({ text, y }) => text.trim() === name && Math.abs(y - date.y) < 2)?.x;
  const description = column('Transaction Details');
  const deposit = column('Deposit');
  const withdrawal = column('Withdrawal');
  const balance = column('Balance');
  if (description === undefined || deposit === undefined || withdrawal === undefined || balance === undefined
    || !(date.x < description && description < deposit && deposit < withdrawal && withdrawal < balance)) {
    throw new Error(`第 ${page.page} 页进支记录列位置无效`);
  }
  const borders = page.horizontalLines.filter(({ left, right, y }) => left <= date.x
    && right > balance && y < date.y).sort((a, b) => b.y - a.y);
  const top = borders[0]?.y;
  const bottom = borders.find(({ y }) => top !== undefined && y < top - 15)?.y;
  if (top === undefined || bottom === undefined) throw new Error(`第 ${page.page} 页无法定位进支记录方框边界`);
  return { top, bottom, description, chinese: description + (deposit - description) * 2 / 3, deposit, withdrawal, balance };
}

export function parseBankDate(text: string, statementDate: string) {
  const match = /^(\d{1,2})\s+([A-Za-z]{3})$/.exec(text.trim());
  if (!match) return null;
  const year = Number(statementDate.slice(0, 4));
  const withYear = (value: number) => parseStatementDate(`${match[1].padStart(2, '0')} ${match[2]} ${value}`);
  const calendarDate = withYear(2000);
  return calendarDate ? withYear(calendarDate.slice(5) > statementDate.slice(5) ? year - 1 : year) : null;
}

export function bankStatementDate(pages: StatementPage[]) {
  const dates = pages.flatMap((page) => page.items
    .filter(({ x, y }) => x > page.width * 0.65 && y > page.height * 0.65)
    .map(({ text }) => parseStatementDate(text.trim().replace(/^(\d)\s/, '0$1 ')))
    .filter((date): date is string => date !== null));
  if (!dates.length) throw new Error('未找到右上角完整账单日期，无法确定交易年份');
  if (new Set(dates).size !== 1) throw new Error('PDF 包含不同的账单日期，请按单份账单拆分后导入');
  return dates[0];
}

export async function recognizeBankChinese(
  page: StatementPage,
  layout: TableLayout,
  render: (bounds: { left: number; top: number; right: number; bottom: number }) => Promise<Buffer>,
  signal: AbortSignal,
) {
  const existing = page.items.filter(({ y, x, text }) => y < layout.top && y > layout.bottom
    && x >= layout.description && x < layout.deposit && /\p{Script=Han}/u.test(text));
  if (existing.length) return;
  const left = layout.chinese;
  const right = layout.deposit - 4;
  const image = await render({ left, right, top: layout.top, bottom: layout.bottom });
  const boxes = await recognize(image, signal);
  const chinese = boxes.filter(({ text }) => /\p{Script=Han}/u.test(text));
  if (!chinese.length) throw new ImportError(`第 ${page.page} 页中文描述 OCR 未识别到文字，请检查本地 OCR 服务或账单清晰度`, 422);
  for (const box of chinese) {
    page.items.push({
      text: box.text.replace(/\s+/g, ''), x: left + box.box[0] / 4,
      y: layout.top - box.box[3] / 4 + 1.5, width: (box.box[2] - box.box[0]) / 4,
    });
  }
}

export function parseHangSengBankPages(pages: StatementPage[]): StatementRow[] {
  const statementDate = bankStatementDate(pages);
  const rows: StatementRow[] = [];
  let inHistory = false;
  let lastDate: string | null = null;
  let pending: { row: StatementRow; english: string[]; chinese: string[]; amounts: { deposit: string; withdrawal: string }[] } | null = null;
  function finish() {
    if (!pending) return;
    const { row, english, chinese, amounts } = pending;
    row.description = `${english.join(' ')}${chinese.length ? ` (${chinese.join('')})` : ''}`;
    if (!row.description.trim()) row.errors.push('交易描述为空');
    if (amounts.length !== 1 || Boolean(amounts[0]?.deposit) === Boolean(amounts[0]?.withdrawal)) {
      row.errors.push('每笔交易必须且只能有一个存入或支出金额');
    } else {
      const { deposit, withdrawal } = amounts[0];
      const text = deposit || withdrawal;
      const money = text.endsWith('-') ? null : parseStatementAmount(text);
      if (!money) row.errors.push(`金额无效：${text}`);
      else {
        row.amount = money.amount;
        row.type = deposit ? 'income' : 'expense';
      }
    }
    rows.push(row);
    pending = null;
  }
  for (const page of pages) {
    const layout = bankTableLayout(page, inHistory);
    if (!layout) continue;
    inHistory = true;
    const items = page.items.filter(({ y, text }) => y < layout.top && y > layout.bottom && text.trim());
    const lines: { y: number; items: StatementText[] }[] = [];
    for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
      const last = lines.at(-1);
      if (last && Math.abs(last.y - item.y) < 2.5) last.items.push(item);
      else lines.push({ y: item.y, items: [item] });
    }
    for (const line of lines) {
      const text = join(line.items);
      const dateText = join(line.items.filter(({ x }) => x < layout.description - 5));
      const english = join(line.items.filter(({ x }) => x >= layout.description - 5 && x < layout.chinese));
      const chinese = join(line.items.filter(({ x }) => x >= layout.chinese && x < layout.deposit - 4));
      const deposit = join(line.items.filter(({ x }) => x >= layout.deposit - 4 && x < layout.withdrawal - 4));
      const withdrawal = join(line.items.filter(({ x }) => x >= layout.withdrawal - 4 && x < layout.balance - 4));
      if (/Transaction Summary|Credit Interest Accrued/i.test(english)) {
        finish();
        inHistory = false;
        break;
      }
      if (/[BC]\/F BALANCE/i.test(english)) {
        finish();
        if (dateText) lastDate = parseBankDate(dateText, statementDate);
        continue;
      }
      if (!dateText && !english && !chinese && !deposit && !withdrawal) continue;
      if (dateText || (pending?.amounts.length && (english || deposit || withdrawal))) finish();
      if (dateText) lastDate = parseBankDate(dateText, statementDate);
      if (!pending) {
        pending = {
          row: {
            date: lastDate, amount: null, type: null, description: '', data: {},
            errors: lastDate ? [] : [`交易日期无效或缺失：${dateText}`], lines: [],
          },
          english: [], chinese: [], amounts: [],
        };
      }
      if (english) pending.english.push(english);
      if (chinese) pending.chinese.push(chinese.replace(/\s+/g, ''));
      if (deposit || withdrawal) pending.amounts.push({ deposit, withdrawal });
      pending.row.lines.push({ page: page.page, text, y: line.y });
    }
  }
  finish();
  return rows;
}
