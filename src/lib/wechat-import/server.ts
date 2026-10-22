import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { prepareSlice, splitScreenshot } from './image';
import { fieldErrors, joinBoxes, parseAmount, parseDate, parseHeader, partitionFields } from './parse';
import { classifyCategories } from './ai-category';
import type { ImportDebug, ImportProgress, ImportResult, ImportTransaction, OcrBox } from './types';
import type { CategoryOption } from '@/src/components/TransactionEntryForm/types';

export const debugRoot = path.join(process.cwd(), 'data', 'import-vx-debug');
const boxSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  box: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]),
});
const ocrSchema = z.object({ boxes: z.array(boxSchema).max(2000) });

export class ImportError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

function ocrUrl(endpoint: string) {
  return new URL(endpoint, `${process.env.WECHAT_OCR_URL ?? 'http://127.0.0.1:8765'}/`);
}

async function recognize(image: Buffer, signal: AbortSignal): Promise<OcrBox[]> {
  let response: Response;
  try {
    response = await fetch(ocrUrl('ocr'), {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(image),
      signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ImportError('本地 OCR 服务连接失败或识别超时，请检查服务日志后重试', 503);
  }
  if (!response.ok) throw new ImportError(`本地 OCR 服务识别失败（HTTP ${response.status}），请查看服务日志`, 502);
  const parsed = ocrSchema.safeParse(await response.json());
  if (!parsed.success) throw new ImportError('本地 OCR 返回的数据格式不正确', 502);
  return parsed.data.boxes;
}

async function mapConcurrent<T, R>(values: T[], operation: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      result[index] = await operation(values[index], index);
    }
  }));
  return result;
}

export async function importScreenshot(
  input: Buffer,
  categories: CategoryOption[],
  signal: AbortSignal,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  onProgress?.({ stage: 'health', status: 'running', completed: 0, total: 1, message: '正在检查本地 OCR 服务' });
  try {
    const health = await fetch(ocrUrl('health'), { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), cache: 'no-store' });
    if (!health.ok) throw new ImportError('本地 OCR 服务尚未就绪', 503);
  } catch (error) {
    if (signal.aborted || error instanceof ImportError) throw error;
    throw new ImportError('本地 OCR 服务未启动，请先按 README 启动 PaddleOCR 服务（默认端口 8765）', 503);
  }
  onProgress?.({ stage: 'health', status: 'complete', completed: 1, total: 1, message: '本地 OCR 服务已就绪' });

  let split: Awaited<ReturnType<typeof splitScreenshot>>;
  onProgress?.({ stage: 'split', status: 'running', completed: 0, total: null, message: '正在检测分隔线并切分截图' });
  try {
    split = await splitScreenshot(input);
  } catch (error) {
    throw new ImportError(`无法处理图片：${error instanceof Error ? error.message : '图片格式无效'}`, 422);
  }
  const total = split.slices.length;
  onProgress?.({ stage: 'split', status: 'complete', completed: total, total, message: `已切分为 ${total} 行（包含年月标题）` });
  const batchId = randomUUID();
  const directory = path.join(debugRoot, batchId);
  await mkdir(directory, { recursive: true });
  const relativePath = (name: string) => `data/import-vx-debug/${batchId}/${name}`;
  let preprocessed = 0;
  let recognized = 0;
  onProgress?.({ stage: 'preprocess', status: 'running', completed: 0, total, message: '正在去头像、反色及二值化（最多 4 行并发）' });
  onProgress?.({ stage: 'ocr', status: 'running', completed: 0, total, message: '等待首批预处理完成后识别' });
  const result = await mapConcurrent(split.slices, async (slice, index) => {
    signal.throwIfAborted();
    const sequence = index + 1;
    const original = await sharp(split.image).extract({ left: 0, top: slice.top, width: split.width, height: slice.height }).png().toBuffer();
    await writeFile(path.join(directory, `${sequence}.png`), original);
    const prepared = await prepareSlice(original, split.width, slice.height);
    const crop = { left: prepared.avatarCropLeft, top: 0, width: split.width - prepared.avatarCropLeft, height: slice.height };
    const binary = await sharp(prepared.binary).extract(crop).png().toBuffer();
    await writeFile(path.join(directory, `${sequence}-binary.png`), binary);
    signal.throwIfAborted();
    preprocessed++;
    onProgress?.({ stage: 'preprocess', status: preprocessed === total ? 'complete' : 'running', completed: preprocessed, total, message: `第 ${sequence} 行预处理完成` });
    const boxes = await recognize(binary, signal);
    signal.throwIfAborted();
    recognized++;
    onProgress?.({ stage: 'ocr', status: recognized === total ? 'complete' : 'running', completed: recognized, total, message: `第 ${sequence} 行首次 OCR 完成` });
    const headerText = joinBoxes(boxes);
    const header = parseHeader(headerText);
    const isHeader = header !== null || (prepared.avatarCropLeft === 0 && slice.height < split.width * 0.175);
    return { sequence, slice, original, prepared, boxes, headerText, header, isHeader, crop };
  });

  const headers: ImportResult['headers'] = [];
  const transactions: ImportTransaction[] = [];
  const transactionTotal = result.filter((row) => !row.isHeader).length;
  let retried = 0;
  onProgress?.({ stage: 'parse', status: 'running', completed: 0, total: transactionTotal, message: '正在按截图顺序关联年月、提取金额日期及分类' });
  let currentHeader: ImportDebug['header'] = null;
  // Associate headers in source order, not OCR completion order.
  for (const row of result) {
    signal.throwIfAborted();
    if (row.isHeader) {
      headers.push({ sequence: row.sequence, text: row.headerText, year: row.header?.year ?? null, month: row.header?.month ?? null, boxes: row.boxes });
      currentHeader = row.header ? {
        ...row.header, text: row.headerText, sourcePath: relativePath(`${row.sequence}.png`), boxes: row.boxes,
      } : null;
      continue;
    }
    const fields = partitionFields(row.boxes, row.crop.width, row.slice.height);
    let amount = parseAmount(joinBoxes(fields.amount));
    let date = parseDate(joinBoxes(fields.date), currentHeader);
    const retries: ImportDebug['retries'] = [];
    for (const field of ['amount', 'date'] as const) {
      if (field === 'amount' ? amount !== null : date !== null) continue;
      onProgress?.({ stage: 'retry', status: 'running', completed: retried, total: null, message: `正在灰度重试第 ${row.sequence} 行${field === 'amount' ? '金额' : '日期'}；待重试总数仍在检查` });
      const boxes = fields[field];
      const defaultBounds = field === 'amount'
        ? { left: Math.floor(row.crop.width * 0.62), top: 0, right: row.crop.width, bottom: Math.ceil(row.slice.height * 0.54) }
        : { left: 0, top: Math.floor(row.slice.height * 0.48), right: Math.ceil(row.crop.width * 0.65), bottom: row.slice.height };
      const left = Math.max(0, boxes.length ? Math.floor(Math.min(...boxes.map(({ box }) => box[0])) - 10) : defaultBounds.left);
      const top = Math.max(0, boxes.length ? Math.floor(Math.min(...boxes.map(({ box }) => box[1])) - 10) : defaultBounds.top);
      const right = Math.min(row.crop.width, boxes.length ? Math.ceil(Math.max(...boxes.map(({ box }) => box[2])) + 10) : defaultBounds.right);
      const bottom = Math.min(row.slice.height, boxes.length ? Math.ceil(Math.max(...boxes.map(({ box }) => box[3])) + 10) : defaultBounds.bottom);
      if (right <= left || bottom <= top) throw new ImportError('OCR 返回了无效的文字区域坐标', 502);
      const bounds = { left: row.crop.left + left, top, width: right - left, height: bottom - top };
      const retryImage = await sharp(row.prepared.gray).extract(bounds)
        .resize({ width: Math.min(2400, bounds.width * 2) }).png().toBuffer();
      const name = `${row.sequence}-${field}-gray.png`;
      await writeFile(path.join(directory, name), retryImage);
      const retryBoxes = await recognize(retryImage, signal);
      const text = joinBoxes(retryBoxes);
      const parsedAmount = field === 'amount' ? parseAmount(text) : null;
      const parsedDate = field === 'date' ? parseDate(text, currentHeader) : null;
      const accepted = field === 'amount' ? parsedAmount !== null : parsedDate !== null;
      if (parsedAmount) amount = parsedAmount;
      if (parsedDate) date = parsedDate;
      retries.push({ field, sourcePath: relativePath(name), bounds, boxes: retryBoxes, text, accepted });
      retried++;
      onProgress?.({ stage: 'retry', status: 'running', completed: retried, total: null, message: `第 ${row.sequence} 行${field === 'amount' ? '金额' : '日期'}重试完成：${accepted ? '校验通过' : '保留错误供人工检查'}` });
    }
    const category = amount ? categories
      .filter((category) => category.type === amount.type && category.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))[0] : undefined;
    const errors = fieldErrors(amount, date, currentHeader);
    if (amount && !category) errors.push('该收支类型下没有可用的默认一级分类');
    const debug: ImportDebug = {
      sequence: row.sequence,
      sourcePath: relativePath(`${row.sequence}.png`),
      imageUrl: `/api/wechat-import/${batchId}/${row.sequence}`,
      binaryPath: relativePath(`${row.sequence}-binary.png`),
      bounds: { left: 0, top: row.slice.top, width: split.width, height: row.slice.height },
      avatarCropLeft: row.prepared.avatarCropLeft,
      inverted: row.prepared.inverted,
      header: currentHeader,
      primary: { boxes: row.boxes, fields },
      retries,
      errors,
    };
    transactions.push({
      id: -row.sequence,
      type: amount?.type ?? null,
      amount: amount?.amount ?? null,
      occurredAt: date?.toISOString() ?? null,
      accountId: null,
      accountName: '微信截图（未入账）',
      currency: 'CNY',
      toAccountId: null,
      destinationAccountName: null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      categoryIcon: category?.icon ?? null,
      categoryColor: category?.color ?? null,
      categoryParentId: category?.parentId ?? null,
      categoryParentColor: null,
      notes: joinBoxes(fields.description) || null,
      importDebug: debug,
    });
    onProgress?.({ stage: 'parse', status: 'running', completed: transactions.length, total: transactionTotal, message: `已整理 ${transactions.length} / ${transactionTotal} 笔交易` });
  }
  if (!transactions.length) throw new ImportError('没有检测到交易行，请选择包含完整交易和年月标题的微信账单截图', 422);
  onProgress?.({ stage: 'parse', status: 'complete', completed: transactions.length, total: transactionTotal, message: '年月关联、金额日期校验及默认分类已完成' });
  onProgress?.({ stage: 'retry', status: 'complete', completed: retried, total: retried, message: retried ? `已完成 ${retried} 次灰度重试` : '金额日期均通过校验，无需重试' });
  signal.throwIfAborted();
  onProgress?.({ stage: 'ai-category', status: 'running', completed: 0, total: transactionTotal, message: '正在向 DeepSeek 发送完整分类列表和交易描述，等待 AI 分类' });
  const classifications = await classifyCategories(categories, transactions, signal);
  let aiErrors = 0;
  let aiWarnings = 0;
  transactions.forEach((transaction, index) => {
    const feedback = classifications[index];
    transaction.aiCategory = feedback;
    if (feedback.status === 'error') {
      aiErrors++;
    } else {
      if (feedback.status === 'warning') aiWarnings++;
      const category = categories.find((category) => category.id === feedback.categoryId);
      if (!category) throw new ImportError('AI 分类校验后分类丢失，请重试', 500);
      transaction.categoryId = category.id;
      transaction.categoryName = category.name;
      transaction.categoryIcon = category.icon;
      transaction.categoryColor = category.color;
      transaction.categoryParentId = category.parentId;
      transaction.categoryParentColor = categories.find((parent) => parent.id === category.parentId)?.color ?? null;
    }
    onProgress?.({ stage: 'ai-category', status: 'running', completed: index + 1, total: transactionTotal, message: `第 ${transaction.importDebug.sequence} 行 AI 分类${feedback.status === 'error' ? '无效，保留原分类' : feedback.status === 'warning' ? '置信度低，已应用建议并标记警告' : '校验通过'}` });
  });
  onProgress?.({ stage: 'ai-category', status: 'complete', completed: transactionTotal, total: transactionTotal, message: `AI 分类处理结束：${aiErrors} 笔错误、${aiWarnings} 笔低置信度，请查看各行提示` });
  const output: ImportResult = { batchId, transactions, headers };
  signal.throwIfAborted();
  onProgress?.({ stage: 'save', status: 'running', completed: 0, total: 1, message: '正在保存调试对象并准备预览（不写入交易数据库）' });
  await writeFile(path.join(directory, 'result.json'), JSON.stringify(output, null, 2));
  onProgress?.({ stage: 'save', status: 'complete', completed: 1, total: 1, message: `处理完成，${transactions.length} 笔交易可供预览` });
  return output;
}
