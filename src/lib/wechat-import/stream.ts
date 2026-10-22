import type { ImportProgress, ImportResult, ImportStreamEvent } from './types';

export async function readImportStream(
  response: Response,
  onProgress: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  if (!response.body) throw new Error('导入接口没有返回数据流');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: ImportResult | null = null;
  let finished = false;

  function consume(line: string) {
    if (!line.trim()) return;
    if (result) throw new Error('导入接口在完成后返回了多余数据');
    const event: ImportStreamEvent = JSON.parse(line);
    switch (event.type) {
      case 'progress':
        onProgress(event.progress);
        break;
      case 'result':
        result = event.result;
        break;
      case 'error':
        throw new Error(event.error);
      default:
        throw new Error('导入接口返回了未知的进度事件');
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
        finished = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
    }
    if (!result) throw new Error('处理连接已中断，未收到完整识别结果，请重试');
    return result;
  } finally {
    if (!finished) await reader.cancel();
    reader.releaseLock();
  }
}
