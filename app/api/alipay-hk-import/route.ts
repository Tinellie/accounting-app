import { handleScreenshotUpload } from '@/src/lib/wechat-import/upload';

export const runtime = 'nodejs';
export const maxDuration = 300;

export function POST(request: Request) {
  return handleScreenshotUpload(request, 'alipay-hk');
}
