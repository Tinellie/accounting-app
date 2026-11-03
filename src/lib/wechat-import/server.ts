import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { MAX_PIXELS, prepareSlice, splitCmbRows, splitScreenshot } from './image';
import { fieldErrors, joinBoxes, normalizeText, parseAmount, parseDate, parseHeader, partitionFields } from './parse';
import { classifyCategories } from './ai-category';
import { findAlipayHeader, parseAlipayAmount, parseAlipayDate, parseAlipayStatus, partitionAlipayFields, reconcileAlipayRefunds } from './alipay';
import { findAlipayHkHeader, parseAlipayHkAmount, parseAlipayHkDate, partitionAlipayHkFields } from './alipay-hk';
import { chinaToday, parseCmbAmount, parseCmbCardTime, parseCmbDay, parseCmbMonth, parseCmbTime, partitionCmbFields, validScreenshotDate } from './cmb';
import type { ImportDebug, ImportProgress, ImportResult, ImportTransaction, OcrBox } from './types';
import type { CategoryOption } from '@/src/components/TransactionEntryForm/types';

export const debugRoot = path.join(process.cwd(), 'data', 'import-vx-debug');
const boxSchema = z.object({
  text: z.string(),
  confidence: z.number().min(0).max(1),
  box: z.tuple([z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]),
});
const ocrSchema = z.object({ boxes: z.array(boxSchema).max(2000) });
const healthSchema = z.object({ ready: z.literal(true), workers: z.number().int().min(1).max(4) });

export class ImportError extends Error {
  constructor(message: string, public readonly status: number, options?: ErrorOptions) {
    super(message, options);
  }
}

function ocrUrl(endpoint: string) {
  return new URL(endpoint, `${process.env.WECHAT_OCR_URL ?? 'http://127.0.0.1:8765'}/`);
}

export async function recognize(image: Buffer, signal: AbortSignal): Promise<OcrBox[]> {
  let response: Response;
  const configuredTimeout = z.coerce.number().int().min(1000).max(600_000)
    .safeParse(process.env.WECHAT_OCR_TIMEOUT_MS ?? 120_000);
  if (!configuredTimeout.success) throw new ImportError('WECHAT_OCR_TIMEOUT_MS 必须为 1000–600000 毫秒的整数', 500);
  const timeoutMs = configuredTimeout.data;
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    response = await fetch(ocrUrl('ocr'), {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: new Uint8Array(image),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ImportError(
      timeout.aborted ? `OCR 单次识别超过 ${timeoutMs / 1000} 秒，请缩短截图或检查服务器负载后重试`
        : 'OCR 服务连接中断，服务可能重启或内存不足，请检查服务日志后重试',
      timeout.aborted ? 504 : 503,
      { cause: error },
    );
  }
  if (!response.ok) throw new ImportError(`本地 OCR 服务识别失败（HTTP ${response.status}），请查看服务日志`, 502);
  const parsed = ocrSchema.safeParse(await response.json());
  if (!parsed.success) throw new ImportError('本地 OCR 返回的数据格式不正确', 502);
  return parsed.data.boxes;
}

async function mapConcurrent<T, R>(values: T[], concurrency: number, operation: (value: T, index: number) => Promise<R>): Promise<R[]> {
  const result: R[] = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
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
  source: 'wechat' | 'alipay' | 'alipay-hk' | 'cmb' = 'wechat',
  screenshotDate = chinaToday(),
  storageRoot = debugRoot,
): Promise<ImportResult> {
  const alipay = source === 'alipay';
  const alipayHk = source === 'alipay-hk';
  const cmb = source === 'cmb';
  const sourceName = cmb ? '招商银行' : alipayHk ? '支付宝(HK)' : alipay ? '支付宝' : '微信';
  if (cmb && !validScreenshotDate(screenshotDate)) throw new ImportError('请选择有效的截图日期', 400);
  const currentYear = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
  let concurrency: number;
  onProgress?.({ stage: 'health', status: 'running', completed: 0, total: 1, message: '正在检查本地 OCR 服务' });
  try {
    const health = await fetch(ocrUrl('health'), { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), cache: 'no-store' });
    if (!health.ok) throw new ImportError('本地 OCR 服务尚未就绪', 503);
    const parsedHealth = healthSchema.safeParse(await health.json());
    if (!parsedHealth.success) throw new ImportError('OCR 服务健康检查返回的数据无效或尚未就绪', 502);
    concurrency = parsedHealth.data.workers;
  } catch (error) {
    if (signal.aborted || error instanceof ImportError) throw error;
    throw new ImportError('本地 OCR 服务未启动，请先按 README 启动 PaddleOCR 服务（默认端口 8765）', 503);
  }
  onProgress?.({ stage: 'health', status: 'complete', completed: 1, total: 1, message: '本地 OCR 服务已就绪' });

  let split: Awaited<ReturnType<typeof splitScreenshot>>;
  onProgress?.({ stage: 'split', status: 'running', completed: 0, total: null, message: '正在检测分隔线并切分截图' });
  try {
    const metadata = alipayHk ? await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata() : null;
    const screenshot = alipayHk && metadata?.autoOrient.width && metadata.autoOrient.width < 1000
      ? await sharp(input, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: 1000 }).png().toBuffer() : input;
    split = await splitScreenshot(screenshot);
    if (cmb || alipayHk) split.slices = await splitCmbRows(split.image, split.width, split.height, alipayHk ? 0.085 : 0.04);
    if (alipay) split.slices = split.slices.filter((slice) => slice.height >= split.width * 0.10);
    if (split.slices.length > 300) throw new Error('切分结果超过 300 行，请缩短截图后重试');
  } catch (error) {
    throw new ImportError(`无法处理图片：${error instanceof Error ? error.message : '图片格式无效'}`, 422);
  }
  const total = split.slices.length;
  onProgress?.({ stage: 'split', status: 'complete', completed: total, total, message: `已切分为 ${total} 行（包含年月标题）` });
  const batchId = randomUUID();
  const directory = path.join(storageRoot, batchId);
  await mkdir(directory, { recursive: true });
  const relativePath = (name: string) => path.relative(process.cwd(), path.join(directory, name)).split(path.sep).join('/');
  let preprocessed = 0;
  let recognized = 0;
  onProgress?.({ stage: 'preprocess', status: 'running', completed: 0, total, message: `正在去头像、反色及二值化（最多 ${concurrency} 行并发）` });
  onProgress?.({ stage: 'ocr', status: 'running', completed: 0, total, message: '等待首批预处理完成后识别' });
  const result = await mapConcurrent(split.slices, concurrency, async (slice, index) => {
    signal.throwIfAborted();
    const sequence = index + 1;
    let original = await sharp(split.image).extract({ left: 0, top: slice.top, width: split.width, height: slice.height }).png().toBuffer();
    let alipayHeader: ReturnType<typeof findAlipayHeader> = null;
    let alipayHeaderBoxes: OcrBox[] = [];
    let headerOnly = false;
    if (alipay && slice.height > split.width * 0.31) {
      const full = await prepareSlice(original, split.width, slice.height);
      alipayHeaderBoxes = await recognize(full.binary, signal);
      alipayHeader = findAlipayHeader(alipayHeaderBoxes, split.width, currentYear);
      if (!alipayHeader) {
        const headerCrop = await sharp(full.gray).extract({
          left: 0, top: 0, width: Math.floor(split.width * 0.36),
          height: Math.min(slice.height, Math.floor(split.width * 0.18)),
        }).resize({ width: Math.floor(split.width * 0.72) }).png().toBuffer();
        const retryHeaderBoxes = await recognize(headerCrop, signal);
        const retryHeader = findAlipayHeader(retryHeaderBoxes, split.width * 2, currentYear);
        if (retryHeader) {
          alipayHeader = retryHeader;
          alipayHeaderBoxes = [...alipayHeaderBoxes, ...retryHeaderBoxes.map((box): OcrBox => ({
            ...box, box: [box.box[0] / 2, box.box[1] / 2, box.box[2] / 2, box.box[3] / 2],
          }))];
        }
      }
      if (alipayHeader) {
        await writeFile(path.join(directory, `${sequence}-header.png`), original);
        const amounts = alipayHeaderBoxes.filter(({ text, box }) => box[2] > split.width * 0.90
          && /[+-]?\d+\.\d{2}$/.test(text.trim()));
        const transactionDate = alipayHeaderBoxes.find(({ text }) => /^\d{1,2}-\d{1,2}\s*\d{2}:\d{2}$/.test(text.trim()));
        const firstAmount = amounts.sort((a, b) => a.box[1] - b.box[1])[0];
        if (firstAmount || transactionDate) {
          const top = Math.max(0, Math.floor(firstAmount
            ? firstAmount.box[1] - split.width * 0.045
            : transactionDate!.box[1] - split.width * 0.17));
          original = await sharp(original).extract({ left: 0, top, width: split.width, height: slice.height - top }).png().toBuffer();
          slice = { top: slice.top + top, height: slice.height - top };
        } else {
          headerOnly = true;
        }
      }
    }
    await writeFile(path.join(directory, `${sequence}.png`), original);
    const prepared = await prepareSlice(original, split.width, slice.height);
    if (cmb || alipayHk) prepared.avatarCropLeft = 0;
    if (alipay && !headerOnly) prepared.avatarCropLeft = Math.floor(split.width * 0.17);
    const crop = { left: prepared.avatarCropLeft, top: 0, width: split.width - prepared.avatarCropLeft, height: slice.height };
    const binary = await sharp(prepared.binary).extract(crop).png().toBuffer();
    await writeFile(path.join(directory, `${sequence}-binary.png`), binary);
    signal.throwIfAborted();
    preprocessed++;
    onProgress?.({ stage: 'preprocess', status: preprocessed === total ? 'complete' : 'running', completed: preprocessed, total, message: `第 ${sequence} 行预处理完成` });
    const compactCmbHeader = cmb && slice.height < split.width * 0.10;
    const headerPadding = Math.ceil(split.width * 0.03);
    const headerImage = sharp(original).greyscale();
    if (prepared.inverted) headerImage.negate({ alpha: false });
    // Sparse day labels lose their background/text contrast under percentile normalization.
    const ocrImage = compactCmbHeader ? await headerImage
      .extract({ left: 0, top: 0, width: Math.ceil(split.width * 0.45), height: slice.height })
      .extend({ top: headerPadding, bottom: headerPadding, left: 0, right: 0, background: '#fff' })
      .resize({ width: Math.ceil(split.width * 0.45) * 2 }).png().toBuffer() : binary;
    const recognizedBoxes = await recognize(ocrImage, signal);
    const boxes = compactCmbHeader ? recognizedBoxes.map((box): OcrBox => ({
      ...box, box: [box.box[0] / 2, Math.max(0, box.box[1] / 2 - headerPadding),
        box.box[2] / 2, Math.max(0, box.box[3] / 2 - headerPadding)],
    })) : recognizedBoxes;
    signal.throwIfAborted();
    recognized++;
    onProgress?.({ stage: 'ocr', status: recognized === total ? 'complete' : 'running', completed: recognized, total, message: `第 ${sequence} 行首次 OCR 完成` });
    const hkHeader = alipayHk ? findAlipayHkHeader(boxes, split.width) : null;
    const headerText = hkHeader?.text ?? alipayHeader?.text ?? joinBoxes(boxes);
    const header = alipayHk ? hkHeader : alipay ? alipayHeader : parseHeader(headerText);
    const isHeader = alipayHk ? header !== null || boxes.some(({ text, box }) => box[0] < split.width * 0.4 && /^\d{1,2}\/\d{4}[vV⌄▼∨▾]?$/.test(normalizeText(text)))
      : alipay ? headerOnly : header !== null || (prepared.avatarCropLeft === 0 && slice.height < split.width * 0.175);
    return { sequence, slice, original, prepared, boxes, headerText, header, isHeader, crop, alipayHeaderBoxes };
  });

  const headers: ImportResult['headers'] = [];
  let transactions: ImportTransaction[] = [];
  const transactionTotal = cmb ? null : result.filter((row) => !row.isHeader).length;
  let retried = 0;
  onProgress?.({ stage: 'parse', status: 'running', completed: 0, total: transactionTotal, message: '正在按截图顺序关联年月、提取金额日期及分类' });
  let currentHeader: ImportDebug['header'] = null;
  let currentDay: ReturnType<typeof parseCmbDay> = null;
  let currentDayDebug: ImportDebug['dayHeader'] = null;
  // Associate headers in source order, not OCR completion order.
  for (const row of result) {
    signal.throwIfAborted();
    if (cmb) {
      const month = parseCmbMonth(row.boxes, split.width, screenshotDate);
      const leftText = normalizeText(joinBoxes(row.boxes.filter(({ box }) => box[0] < split.width * 0.4)));
      if (month) {
        currentHeader = { ...month, sourcePath: relativePath(`${row.sequence}.png`), boxes: row.boxes };
        currentDay = null;
        currentDayDebug = null;
        headers.push({ sequence: row.sequence, ...month, boxes: row.boxes });
        continue;
      }
      if (/^\d{1,2}月/.test(leftText)) {
        currentHeader = null;
        currentDay = null;
        currentDayDebug = null;
        continue;
      }
      if (/^(今天|昨天|\d{1,2}\.\d{1,2})$/.test(leftText)) {
        currentDay = parseCmbDay(leftText, currentHeader, screenshotDate);
        currentDayDebug = currentDay ? {
          ...currentDay, text: leftText, sourcePath: relativePath(`${row.sequence}.png`), boxes: row.boxes,
        } : null;
        continue;
      }
      const fields = partitionCmbFields(row.boxes, split.width);
      if (!fields.date.length && row.slice.height < split.width * 0.10 && leftText) {
        currentDay = null;
        currentDayDebug = null;
        continue;
      }
      // Summary cards have no card/time footer and must never become transactions.
      if (!fields.date.length && !fields.amount.some(({ text }) => /^[+\-−]/.test(text.trim()))
        && !(currentDay && row.slice.height >= split.width * 0.10)) continue;
      const binary = await sharp(row.prepared.binary).extract({
        left: Math.floor(split.width * 0.15), top: 0,
        width: split.width - Math.floor(split.width * 0.15), height: row.slice.height,
      }).png().toBuffer();
      await writeFile(path.join(directory, `${row.sequence}-binary.png`), binary);
    }
    if (!cmb && (row.isHeader || (alipay && row.header))) {
      const headerBoxes = alipay ? row.alipayHeaderBoxes : row.boxes;
      headers.push({ sequence: row.sequence, text: row.headerText, year: row.header?.year ?? null, month: row.header?.month ?? null, boxes: headerBoxes });
      currentHeader = row.header ? {
        ...row.header, text: row.headerText, sourcePath: relativePath(`${row.sequence}${alipay ? '-header' : ''}.png`), boxes: headerBoxes,
      } : null;
      if (row.isHeader) continue;
    }
    if (alipayHk && row.boxes.some(({ text }) => /^(支出|收入|收支總覽|收支总览)/.test(normalizeText(text)))
      && !row.boxes.some(({ text }) => /^\d{2}\/\d{2}/.test(normalizeText(text)))
      && !row.boxes.some(({ text }) => /^[+\-−–—﹣]HKD/.test(normalizeText(text)))) continue;
    const fields = cmb ? partitionCmbFields(row.boxes, row.crop.width)
      : alipayHk ? partitionAlipayHkFields(row.boxes, row.crop.width)
      : alipay ? partitionAlipayFields(row.boxes, row.crop.width, row.slice.height)
      : partitionFields(row.boxes, row.crop.width, row.slice.height);
    const status = alipay ? parseAlipayStatus(fields, row.crop.width) : null;
    if (status?.closed) continue;
    const isRefund = status?.isRefund ?? false;
    const fullyRefunded = status?.fullyRefunded ?? false;
    const parseMoney = (text: string) => cmb ? parseCmbAmount(text) : alipayHk ? parseAlipayHkAmount(text) : alipay ? parseAlipayAmount(text, isRefund) : parseAmount(text);
    const parseTime = (text: string) => cmb ? parseCmbTime(text, currentDay) : alipayHk ? parseAlipayHkDate(text, currentHeader) : alipay ? parseAlipayDate(text, currentHeader) : parseDate(text, currentHeader);
    let amount = parseMoney(joinBoxes(fields.amount));
    let date = parseTime(joinBoxes(fields.date));
    let sourceCard = cmb ? parseCmbCardTime(joinBoxes(fields.date))?.card ?? null : null;
    const retries: ImportDebug['retries'] = [];
    for (const field of ['amount', 'date'] as const) {
      if (field === 'amount' ? amount !== null : date !== null) continue;
      if (cmb && field === 'date' && !currentDay) continue;
      onProgress?.({ stage: 'retry', status: 'running', completed: retried, total: null, message: `正在灰度重试第 ${row.sequence} 行${field === 'amount' ? '金额' : '日期'}；待重试总数仍在检查` });
      const boxes = fields[field];
      const defaultBounds = field === 'amount'
        ? { left: alipay ? Math.max(0, Math.floor(split.width * 0.74) - row.crop.left)
          : Math.floor(row.crop.width * 0.62), top: 0, right: row.crop.width, bottom: Math.ceil(row.slice.height * (alipay ? 0.38 : 0.54)) }
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
      const parsedAmount = field === 'amount' ? parseMoney(text) : null;
      const parsedDate = field === 'date' ? parseTime(text) : null;
      const accepted = field === 'amount' ? parsedAmount !== null : parsedDate !== null;
      if (parsedAmount) amount = parsedAmount;
      if (parsedDate) date = parsedDate;
      if (cmb && field === 'date') sourceCard = parseCmbCardTime(text)?.card ?? sourceCard;
      retries.push({ field, sourcePath: relativePath(name), bounds, boxes: retryBoxes, text, accepted });
      retried++;
      onProgress?.({ stage: 'retry', status: 'running', completed: retried, total: null, message: `第 ${row.sequence} 行${field === 'amount' ? '金额' : '日期'}重试完成：${accepted ? '校验通过' : '保留错误供人工检查'}` });
    }
    const category = amount ? categories
      .filter((category) => category.type === amount.type && category.parentId === null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))[0] : undefined;
    const errors = fieldErrors(amount, date, currentHeader);
    if (cmb && !currentDay) errors.push('上方缺少有效日期小标题，或截图日期与所属月份不一致');
    if (cmb && !sourceCard) errors.push('无法识别卡号，请核对原始截图并手动确认交易');
    if (alipay && !amount) errors[0] = '无法识别有效金额（需保留两位小数）';
    if (amount && !category) errors.push('该收支类型下没有可用的默认一级分类');
    const debug: ImportDebug = {
      sequence: row.sequence,
      sourcePath: relativePath(`${row.sequence}.png`),
      imageUrl: `/api/wechat-import/${batchId}/${row.sequence}`,
      binaryPath: relativePath(`${row.sequence}-binary.png`),
      bounds: { left: 0, top: row.slice.top, width: split.width, height: row.slice.height },
      avatarCropLeft: cmb ? Math.floor(split.width * 0.15) : alipayHk ? Math.floor(split.width * 0.17) : row.prepared.avatarCropLeft,
      inverted: row.prepared.inverted,
      header: currentHeader,
      ...(cmb ? { dayHeader: currentDayDebug } : {}),
      primary: { boxes: row.boxes, fields },
      retries,
      errors,
    };
    transactions.push({
      id: -row.sequence,
      ...(cmb ? { sourceCard } : {}),
      ...(alipay ? { isRefund, fullyRefunded } : {}),
      type: amount?.type ?? null,
      amount: amount?.amount ?? null,
      occurredAt: date?.toISOString() ?? null,
      accountId: null,
      accountName: `${sourceName}截图（未入账）`,
      currency: alipayHk ? 'HKD' : 'CNY',
      ...(alipayHk ? { currencyMode: 'HKD' as const } : {}),
      toAccountId: null,
      destinationAccountName: null,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      categoryIcon: category?.icon ?? null,
      categoryColor: category?.color ?? null,
      categoryParentId: category?.parentId ?? null,
      categoryParentColor: null,
      notes: joinBoxes(fields.description) || null,
      data: {},
      importDebug: debug,
    });
    onProgress?.({ stage: 'parse', status: 'running', completed: transactions.length, total: transactionTotal,
      message: cmb ? `已整理 ${transactions.length} 笔交易，正在检查后续日期标题` : `已整理 ${transactions.length} / ${transactionTotal} 笔交易` });
  }
  if (!transactions.length) throw new ImportError(`没有检测到交易行，请选择包含完整交易和年月标题的${sourceName}账单截图`, 422);
  if (alipay) transactions = reconcileAlipayRefunds(transactions);
  if (transactions.length > 300) throw new ImportError('包含自动补全退款后超过 300 笔交易，请缩短截图后重试', 422);
  onProgress?.({ stage: 'parse', status: 'complete', completed: transactions.length, total: transactionTotal ?? transactions.length, message: '年月关联、金额日期校验及默认分类已完成' });
  onProgress?.({ stage: 'retry', status: 'complete', completed: retried, total: retried, message: retried ? `已完成 ${retried} 次灰度重试` : '金额日期均通过校验，无需重试' });
  signal.throwIfAborted();
  const aiRows = transactions.filter((row) => !row.refundOfId);
  onProgress?.({ stage: 'ai-category', status: 'running', completed: 0, total: aiRows.length, message: '正在向 DeepSeek 发送完整分类列表和交易描述，等待 AI 分类；已关联退款沿用原交易分类' });
  const classifications = await classifyCategories(categories, aiRows, signal);
  let aiErrors = 0;
  let aiWarnings = 0;
  aiRows.forEach((transaction, index) => {
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
    onProgress?.({ stage: 'ai-category', status: 'running', completed: index + 1, total: aiRows.length, message: `第 ${transaction.importDebug.sequence} 行 AI 分类${feedback.status === 'error' ? '无效，保留原分类' : feedback.status === 'warning' ? '置信度低，已应用建议并标记警告' : '校验通过'}` });
  });
  for (const refund of transactions.filter((row) => row.refundOfId)) {
    const purchase = transactions.find((row) => row.id === refund.refundOfId);
    if (!purchase) throw new ImportError('退款关联原交易丢失，请重新识别', 500);
    refund.categoryId = purchase.categoryId;
    refund.categoryName = purchase.categoryName;
    refund.categoryIcon = purchase.categoryIcon;
    refund.categoryColor = purchase.categoryColor;
    refund.categoryParentId = purchase.categoryParentId;
    refund.categoryParentColor = purchase.categoryParentColor;
    refund.aiCategory = purchase.aiCategory ? {
      ...purchase.aiCategory,
      explanation: `沿用原交易分类：${purchase.aiCategory.explanation ?? '原交易分类未通过校验'}`,
    } : undefined;
  }
  onProgress?.({ stage: 'ai-category', status: 'complete', completed: aiRows.length, total: aiRows.length, message: `AI 分类处理结束：${aiErrors} 笔错误、${aiWarnings} 笔低置信度；关联退款已沿用原分类，请查看各行提示` });
  const output: ImportResult = { source, ...(cmb ? { screenshotDate } : {}), batchId, transactions, headers };
  signal.throwIfAborted();
  onProgress?.({ stage: 'save', status: 'running', completed: 0, total: 1, message: '正在保存调试对象并准备预览（不写入交易数据库）' });
  await writeFile(path.join(directory, 'result.json'), JSON.stringify(output, null, 2));
  onProgress?.({ stage: 'save', status: 'complete', completed: 1, total: 1, message: `处理完成，${transactions.length} 笔交易可供预览` });
  return output;
}
