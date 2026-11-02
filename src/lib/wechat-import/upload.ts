import { db } from '@/src/db';
import { categories } from '@/src/db/schema';
import { ImportError, importScreenshot } from '@/src/lib/wechat-import/server';
import type { ImportStreamEvent } from '@/src/lib/wechat-import/types';
import { chinaToday, validScreenshotDate } from '@/src/lib/wechat-import/cmb';
import { importHangSengPdf } from '@/src/lib/wechat-import/hangseng-pdf';

const MAX_UPLOAD = 20 * 1024 * 1024;

export async function handleScreenshotUpload(request: Request, source: 'wechat' | 'alipay' | 'alipay-hk' | 'cmb' | 'hangseng' | 'hangseng-bank') {
  const pdf = source === 'hangseng' || source === 'hangseng-bank';
  const fileLabel = pdf ? 'PDF' : '图片';
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  // Next.js can use its internal localhost URL even when the client accesses a LAN host.
  const expectedOrigin = `${requestUrl.protocol}//${request.headers.get('host') ?? requestUrl.host}`;
  if (origin && origin !== expectedOrigin) {
    return Response.json({ error: '不允许跨站上传' }, { status: 403 });
  }
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new ImportError(`未收到${fileLabel}文件`, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_UPLOAD + 64 * 1024) {
        await reader.cancel();
        throw new ImportError(`${fileLabel}不能超过 20 MB`, 413);
      }
      chunks.push(value);
    }
    const contentType = request.headers.get('content-type');
    if (!contentType?.startsWith('multipart/form-data;')) throw new ImportError('请使用文件上传', 415);
    const form = await new Response(Buffer.concat(chunks), { headers: { 'Content-Type': contentType } }).formData();
    const screenshotDate = source === 'cmb' ? form.get('screenshotDate') : chinaToday();
    if (typeof screenshotDate !== 'string' || !validScreenshotDate(screenshotDate)) {
      throw new ImportError('请选择有效的截图日期', 400);
    }
    const file = form.get('image');
    if (!(file instanceof File) || file.size === 0) throw new ImportError(`请选择非空${fileLabel}文件`, 400);
    if (file.size > MAX_UPLOAD) throw new ImportError(`${fileLabel}不能超过 20 MB`, 413);
    if (!(pdf ? file.type === 'application/pdf' : ['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      throw new ImportError(pdf ? '仅支持 PDF 文件' : '仅支持 JPG、PNG 或 WebP 图片', 415);
    }
    const input = Buffer.from(await file.arrayBuffer());
    const categoryOptions = db.select().from(categories).all();
    const processFile = (signal: AbortSignal, onProgress?: Parameters<typeof importScreenshot>[3]) => pdf
      ? importHangSengPdf(input, categoryOptions, signal, onProgress, source)
      : importScreenshot(input, categoryOptions, signal, onProgress, source, screenshotDate);
    if (request.headers.get('accept')?.includes('application/x-ndjson')) {
      const abort = new AbortController();
      const signal = AbortSignal.any([request.signal, abort.signal]);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          function send(event: ImportStreamEvent) {
            if (!signal.aborted) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
          try {
            const result = await processFile(signal, (progress) => send({ type: 'progress', progress }));
            send({ type: 'result', result });
          } catch (error) {
            if (!signal.aborted) {
              console.error('[wechat-import]', error);
              send({ type: 'error', error: error instanceof ImportError ? error.message : '截图导入失败，请查看服务端日志后重试' });
            }
          } finally {
            if (!signal.aborted) controller.close();
            abort.abort();
          }
        },
        cancel() {
          abort.abort();
        },
      });
      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    const result = await processFile(request.signal);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    console.error('[wechat-import]', error);
    return Response.json(
      { error: error instanceof ImportError ? error.message : '截图导入失败，请查看服务端日志后重试' },
      { status: error instanceof ImportError ? error.status : 500 },
    );
  }
}
