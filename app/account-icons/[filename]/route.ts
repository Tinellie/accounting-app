import { readFile } from 'node:fs/promises';
import { getAccountIconContentType, getAccountIconPath } from '@/src/lib/account-icons';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const source = new URL(request.url).searchParams.get('source') ?? 'upload';
  const path = getAccountIconPath(source, filename);
  const contentType = getAccountIconContentType(filename);
  if (!path || !contentType) return new Response(null, { status: 404 });

  try {
    const image = await readFile(path);
    return new Response(new Uint8Array(image), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}