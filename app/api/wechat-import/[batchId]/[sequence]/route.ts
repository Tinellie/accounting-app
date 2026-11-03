import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getUserDirectory } from '@/src/db/user';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ batchId: string; sequence: string }> }) {
  const debugRoot = path.join(await getUserDirectory(), 'import-vx-debug');
  const { batchId, sequence } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(batchId) || !/^[1-9]\d{0,2}$/.test(sequence)) {
    return Response.json({ error: '无效的切图路径' }, { status: 400 });
  }
  try {
    const image = await readFile(path.join(debugRoot, batchId, `${sequence}.png`));
    return new Response(image, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return Response.json({ error: '切图不存在或已清理' }, { status: 404 });
    }
    console.error('[wechat-import-image]', error);
    return Response.json({ error: '读取切图失败' }, { status: 500 });
  }
}
