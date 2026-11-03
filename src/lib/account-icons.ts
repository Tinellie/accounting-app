import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getUserDirectory } from '../db/user';

const presetIconDirectory = join(process.cwd(), 'data', 'icons-preset');
const maxIconSize = 5 * 1024 * 1024;
type IconSource = 'preset' | 'upload';

export class AccountIconError extends Error {}

export async function saveAccountIcon(value: FormDataEntryValue | null): Promise<string | null> {
  const uploadIconDirectory = join(await getUserDirectory(), 'icons');
  if (value === null || typeof value === 'string' || value.size === 0) return null;
  if (value.size > maxIconSize) {
    throw new AccountIconError('图标图片不能超过 5 MB');
  }

  const image = Buffer.from(await value.arrayBuffer());
  const extension = getImageExtension(image);
  if (!extension) {
    throw new AccountIconError('图标格式无效，请上传 PNG、JPEG 或 WebP 图片');
  }

  await mkdir(uploadIconDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(join(uploadIconDirectory, filename), image, { flag: 'wx' });
  return `upload:${filename}`;
}

export async function listAccountIcons(): Promise<string[]> {
  return listIconsInDirectory(presetIconDirectory, 'preset');
}

export async function resolveAccountIcon(value: FormDataEntryValue | null): Promise<string | null> {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new AccountIconError('所选账户图标无效');
  }

  const parsed = parseAccountIcon(value);
  const path = parsed ? await getAccountIconPath(parsed.source, parsed.filename) : null;
  if (!parsed || !path) throw new AccountIconError('所选账户图标无效');

  try {
    if ((await stat(path)).isFile()) return `${parsed.source}:${parsed.filename}`;
  } catch {
    // A selected icon may have been removed after the form was rendered.
  }

  throw new AccountIconError('所选账户图标已不存在，请重新选择');
}

export async function deleteAccountIcon(filename: string): Promise<void> {
  const parsed = parseAccountIcon(filename);
  if (!parsed || parsed.source !== 'upload') return;

  const path = await getAccountIconPath(parsed.source, parsed.filename);
  if (path) await rm(path, { force: true });
}

export async function getAccountIconPath(source: string, filename: string): Promise<string | null> {
  const uploadIconDirectory = join(await getUserDirectory(), 'icons');
  if (!isSupportedIconFilename(filename)) return null;

  if (source === 'preset') return join(presetIconDirectory, filename);
  if (source === 'upload') return join(uploadIconDirectory, filename);
  return null;
}

export function getAccountIconContentType(filename: string): string | null {
  if (!isSupportedIconFilename(filename)) return null;
  const extension = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return 'image/webp';
}

async function listIconsInDirectory(directory: string, source: IconSource): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && getAccountIconContentType(entry.name) !== null)
      .map((entry) => `${source}:${entry.name}`)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

function parseAccountIcon(value: string): { source: IconSource; filename: string } | null {
  const separator = value.indexOf(':');
  const hasSource = separator >= 0;
  const source = hasSource ? value.slice(0, separator) : 'upload';
  const filename = hasSource ? value.slice(separator + 1) : value;

  if ((source !== 'preset' && source !== 'upload') || !isSupportedIconFilename(filename)) {
    return null;
  }

  return { source, filename };
}

function isSupportedIconFilename(filename: string): boolean {
  return /^[a-z\d][a-z\d._-]{0,127}\.(png|jpe?g|webp)$/i.test(filename);
}

function getImageExtension(image: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (image.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }
  if (image.length >= 3 && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff) {
    return 'jpg';
  }
  if (image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP') {
    return 'webp';
  }
  return null;
}