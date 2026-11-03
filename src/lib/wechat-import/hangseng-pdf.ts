import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { classifyCategories } from './ai-category';
import { parseHangSengPages, type StatementPage } from './hangseng';
import { bankTableLayout, parseHangSengBankPages, recognizeBankChinese } from './hangseng-bank';
import { debugRoot, ImportError } from './server';
import type { CategoryOption } from '@/src/components/TransactionEntryForm/types';
import type { ImportProgress, ImportResult, ImportTransaction } from './types';

type CropBounds = { left: number; top: number; right: number; bottom: number };
type EnrichPage = (page: StatementPage, render: (bounds: CropBounds) => Promise<Buffer>) => Promise<void>;

export async function readStatementPages(
  input: Uint8Array, signal: AbortSignal, onPage?: (page: number, total: number) => void, enrichPage?: EnrichPage,
) {
  if (Buffer.from(input.subarray(0, 5)).toString() !== '%PDF-') throw new ImportError('文件内容不是有效 PDF', 415);
  signal.throwIfAborted();
  const task = getDocument({ data: new Uint8Array(input), useSystemFonts: true });
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    const document = await task.promise;
    if (document.numPages > 30) throw new ImportError('PDF 超过 30 页，请拆分账单后重试', 422);
    const pages: StatementPage[] = [];
    for (let number = 1; number <= document.numPages; number++) {
      signal.throwIfAborted();
      const page = await document.getPage(number);
      const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);
      const horizontalLines: StatementPage['horizontalLines'] = [];
      for (let index = 0; index < operators.fnArray.length; index++) {
        if (operators.fnArray[index] !== OPS.constructPath) continue;
        const bounds: unknown = operators.argsArray[index][2];
        if (!bounds || typeof bounds !== 'object' || !(0 in bounds) || !(1 in bounds) || !(2 in bounds) || !(3 in bounds)) continue;
        const [left, y, right, bottom] = [bounds[0], bounds[1], bounds[2], bounds[3]];
        if (typeof left === 'number' && typeof y === 'number' && typeof right === 'number'
          && typeof bottom === 'number' && Math.abs(y - bottom) < 1) {
          horizontalLines.push({ left, right, y });
        }
      }
      const items = content.items.flatMap((item) => 'str' in item ? [{
        text: item.str, x: item.transform[4], y: item.transform[5], width: item.width,
      }] : []);
      const statementPage = { page: number, width: page.view[2], height: page.view[3], items, horizontalLines };
      if (enrichPage) {
        await enrichPage(statementPage, async ({ left, top, right, bottom }) => {
          // PDF.js declares canvasFactory as Object although its Node factory returns a canvas.
          const factory = document.canvasFactory as {
            create(width: number, height: number): { canvas: HTMLCanvasElement & { toBuffer(type: 'image/png'): Buffer } };
            destroy(target: { canvas: HTMLCanvasElement }): void;
          };
          const target = factory.create(Math.ceil((right - left) * 4), Math.ceil((top - bottom) * 4));
          const viewport = page.getViewport({ scale: 4, offsetX: -left * 4, offsetY: -(statementPage.height - top) * 4 });
          const rendering = page.render({ canvas: target.canvas, viewport });
          const cancel = () => rendering.cancel();
          signal.addEventListener('abort', cancel, { once: true });
          try {
            signal.throwIfAborted();
            await rendering.promise;
            return target.canvas.toBuffer('image/png');
          } finally {
            signal.removeEventListener('abort', cancel);
            factory.destroy(target);
          }
        });
      }
      pages.push(statementPage);
      page.cleanup();
      onPage?.(number, document.numPages);
    }
    return pages;
  } finally {
    signal.removeEventListener('abort', abort);
    await task.destroy();
  }
}

export async function importHangSengPdf(
  input: Buffer, categories: CategoryOption[], signal: AbortSignal,
  onProgress?: (progress: ImportProgress) => void,
  source: 'hangseng' | 'hangseng-bank' = 'hangseng',
  storageRoot = debugRoot,
): Promise<ImportResult> {
  const bank = source === 'hangseng-bank';
  let inHistory = false;
  onProgress?.({ stage: 'split', status: 'running', completed: 0, total: null, message: bank
    ? '正在逐页提取进支记录方框，中文图片描述将使用本地 OCR' : '正在逐页提取 PDF 文字与账目方框（无需 OCR）' });
  let pages: StatementPage[];
  try {
    pages = await readStatementPages(input, signal, (page, total) => onProgress?.({
      stage: 'split', status: page === total ? 'complete' : 'running', completed: page, total, message: `已读取第 ${page} / ${total} 页`,
    }), bank ? async (page, render) => {
      const layout = bankTableLayout(page, inHistory);
      if (!layout) return;
      inHistory = true;
      onProgress?.({ stage: 'ocr', status: 'running', completed: page.page - 1, total: null, message: `正在本地识别第 ${page.page} 页中文描述（日期、金额使用 PDF 原文）` });
      await recognizeBankChinese(page, layout, render, signal);
      onProgress?.({ stage: 'ocr', status: 'complete', completed: page.page, total: null, message: `第 ${page.page} 页中文描述已识别` });
    } : undefined);
  } catch (error) {
    if (signal.aborted || error instanceof ImportError) throw error;
    throw new ImportError(`PDF 读取失败：${error instanceof Error ? error.message : '请检查文件是否损坏或加密'}`, 422);
  }
  let parsed: ReturnType<typeof parseHangSengPages>;
  try {
    parsed = bank ? parseHangSengBankPages(pages) : parseHangSengPages(pages);
  } catch (error) {
    throw new ImportError(`账目解析失败：${error instanceof Error ? error.message : '请检查账单格式'}`, 422);
  }
  if (!parsed.length) throw new ImportError(`未找到有效账目表格；仅支持含可提取文字及 ${bank ? 'TRANSACTION HISTORY' : 'TRANS DATE'} 表头的恒生账单 PDF，不支持扫描件`, 422);
  if (parsed.length > 300) throw new ImportError('账目超过 300 笔，请拆分 PDF 后重试', 422);
  const batchId = randomUUID();
  const directory = path.join(storageRoot, batchId);
  await mkdir(directory, { recursive: true });
  for (const page of pages) {
    signal.throwIfAborted();
    // Keep only table text in debug files, not personal details above the table.
    const header = page.items.find(({ text }) => bank ? /TRANSACTION\s+HISTORY/i.test(text) : text === 'TRANS DATE')
      ?? (bank ? page.items.find(({ text }) => text === 'Date') : undefined);
    await writeFile(path.join(directory, `page-${page.page}.json`), JSON.stringify({
      ...page, items: header ? page.items.filter(({ y }) => y < header.y) : [],
    }, null, 2));
  }
  const transactions: ImportTransaction[] = parsed.map((row, index) => {
    const category = categories.filter((category) => category.type === row.type && category.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))[0];
    const page = pages.find((page) => page.page === row.lines[0].page)!;
    return {
      id: -index - 1, type: row.type, amount: row.amount,
      occurredAt: row.date ? new Date(`${row.date}T00:00:00+08:00`).toISOString() : null,
      notes: row.description, data: row.data, currencyMode: 'account',
      accountId: null, toAccountId: null, accountName: '未选择账户', destinationAccountName: null,
      currency: '', categoryId: category?.id ?? null, categoryName: category?.name ?? null,
      categoryIcon: category?.icon ?? null, categoryColor: category?.color ?? null,
      categoryParentId: category?.parentId ?? null, categoryParentColor: null,
      importDebug: {
        sequence: index + 1, sourcePath: path.relative(process.cwd(), path.join(directory, `page-${page.page}.json`)).split(path.sep).join('/'),
        imageUrl: '', binaryPath: '', bounds: { left: 0, top: 0, width: page.width, height: page.height },
        avatarCropLeft: 0, inverted: false, header: null, retries: [],
        primary: { boxes: row.lines.map((line) => ({ text: `[第 ${line.page} 页] ${line.text}`, confidence: 1, box: [0, line.y, page.width, line.y + 10] })),
          fields: { description: [], amount: [], date: [], ignored: [] } },
        errors: [...row.errors, ...(!category ? ['缺少对应收支类型的默认分类'] : [])],
      },
    };
  });
  onProgress?.({ stage: 'parse', status: 'complete', completed: transactions.length, total: transactions.length, message: '交易及跨页附属数据整理完成' });
  signal.throwIfAborted();
  onProgress?.({ stage: 'ai-category', status: 'running', completed: 0, total: transactions.length, message: '正在按交易描述自动分类（不发送 PDF 或附属数据）' });
  const feedback = await classifyCategories(categories, transactions, signal);
  transactions.forEach((row, index) => {
    row.aiCategory = feedback[index];
    const category = feedback[index].status !== 'error' ? categories.find((category) => category.id === feedback[index].categoryId) : undefined;
    if (category) {
      row.categoryId = category.id;
      row.categoryName = category.name;
      row.categoryIcon = category.icon ?? null;
      row.categoryColor = category.color ?? null;
      row.categoryParentId = category.parentId;
      row.categoryParentColor = categories.find((parent) => parent.id === category.parentId)?.color ?? null;
    }
  });
  onProgress?.({ stage: 'ai-category', status: 'complete', completed: transactions.length, total: transactions.length, message: '分类结束，请核对金额、日期、附属数据和账户' });
  signal.throwIfAborted();
  const result: ImportResult = { source, batchId, headers: [], transactions };
  await writeFile(path.join(directory, 'result.json'), JSON.stringify(result, null, 2));
  onProgress?.({ stage: 'save', status: 'complete', completed: 1, total: 1, message: `已生成 ${transactions.length} 笔交易预览，尚未入账` });
  return result;
}
