import { z } from 'zod';
import { exchangeRateSchema } from '@/src/lib/transaction-filters';
import { getCurrentSession } from '@/src/lib/auth';

const providerSchema = z.array(z.object({
  date: z.iso.date(), base: z.literal('CNY'), quote: z.string().regex(/^[A-Z]{3}$/), rate: z.number().positive().finite(),
})).min(1);

export async function GET() {
  if (!await getCurrentSession()) return Response.json({ error: '请先登录' }, { status: 401 });
  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rates?base=CNY', {
      next: { revalidate: 3600 }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`汇率服务返回 HTTP ${response.status}`);
    const rows = providerSchema.parse(await response.json());
    const result = exchangeRateSchema.parse({
      date: rows.map((row) => row.date).sort()[0],
      base: 'CNY', rates: { ...Object.fromEntries(rows.map((row) => [row.quote, row.rate])), CNY: 1 },
    });
    return Response.json(result);
  } catch (error) {
    console.error('[exchange-rates] Failed to load public exchange rates', error);
    return Response.json({ error: '获取最新汇率失败，请重试；也可以关闭币值转换，仅筛选原币交易' }, { status: 502 });
  }
}
