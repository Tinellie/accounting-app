import sharp from 'sharp';

export const MAX_PIXELS = 80_000_000;

export type Slice = { top: number; height: number };

export async function splitScreenshot(input: Buffer): Promise<{
  image: Buffer;
  width: number;
  height: number;
  slices: Slice[];
}> {
  const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) {
    throw new Error('图片内容必须是 JPG、PNG 或 WebP 格式');
  }
  const { data: image, info } = await sharp(input, { limitInputPixels: MAX_PIXELS })
    .rotate().flatten({ background: '#fff' }).removeAlpha().png().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  if (width < 320 || width > 6000 || height < 100 || height > 60000) {
    throw new Error('图片尺寸不支持：宽度需为 320–6000 像素，高度需为 100–60000 像素');
  }
  const { data, info: scan } = await sharp(image).resize({ width: 320 }).greyscale().raw()
    .toBuffer({ resolveWithObject: true });
  const means: number[] = [];
  const uniform: boolean[] = [];
  for (let y = 0; y < scan.height; y++) {
    const values = Array.from(data.subarray(y * scan.width, (y + 1) * scan.width)).sort((a, b) => a - b);
    means.push(values[Math.floor(values.length / 2)]);
    // Text/avatar pixels must not be mistaken for full-width separator lines.
    uniform.push(values[Math.floor(values.length * 0.9)] - values[Math.floor(values.length * 0.1)] < 12);
  }
  const minimumHeight = Math.max(18, Math.round(scan.width * 0.055));
  const boundaries = [0];
  for (let y = 1; y < scan.height - 1; y++) {
    if (!uniform[y] || !uniform[y - 1] || Math.abs(means[y] - means[y - 1]) < 2) continue;
    if (y - boundaries[boundaries.length - 1] < minimumHeight) continue;
    boundaries.push(y);
  }
  if (scan.height - boundaries[boundaries.length - 1] < minimumHeight) boundaries.pop();
  boundaries.push(scan.height);
  const slices = boundaries.slice(0, -1).map((start, index) => {
    const top = Math.round(start * height / scan.height);
    const bottom = index === boundaries.length - 2 ? height : Math.round(boundaries[index + 1] * height / scan.height);
    return { top, height: bottom - top };
  });
  if (slices.length > 300) throw new Error('切分结果超过 300 行，请缩短截图后重试');
  return { image, width, height, slices };
}

export async function prepareSlice(input: Buffer, width: number, height: number) {
  const { data, info } = await sharp(input).greyscale().raw().toBuffer({ resolveWithObject: true });
  const background: number[] = [];
  for (let y = 0; y < info.height; y += Math.max(1, Math.floor(info.height / 20))) {
    background.push(data[y * info.width + Math.floor(width * 0.98)]);
  }

  background.sort((a, b) => a - b);
  const inverted = background[Math.floor(background.length / 2)] < 128;
  const gray = await sharp(input).greyscale().negate(inverted ? { alpha: false } : false).normalize().png().toBuffer();
  const raw = await sharp(gray).greyscale().raw().toBuffer();
  // Locate the avatar's right edge in the left gutter, rather than cropping text by a fixed percentage.
  const activity: number[] = [];
  for (let x = 0; x < Math.floor(width * 0.22); x++) {
    let count = 0;
    for (let y = Math.floor(height * 0.2); y < Math.floor(height * 0.85); y++) {
      if (raw[y * width + x] < 175) count++;
    }
    activity.push(count / (height * 0.65));
  }
  const active: number[] = [];
  for (let x = 0; x < activity.length; x++) {
    if (activity[x] <= 0.24) continue;
    if (active.length && x - active[active.length - 1] > width * 0.012) break;
    active.push(x);
  }
  const avatarDetected = active.length > width * 0.035
    && active[0] < width * 0.12
    && active[active.length - 1] > width * 0.12;
  const avatarCropLeft = avatarDetected
    ? Math.min(Math.floor(width * 0.21), active[active.length - 1] + Math.max(2, Math.floor(width * 0.012)))
    : 0;
  return { gray, binary: await sharp(gray).threshold(180).png().toBuffer(), inverted, avatarCropLeft };
}

export async function splitCmbRows(image: Buffer, width: number, height: number, gapRatio = 0.04): Promise<Slice[]> {
  const scanWidth = 420;
  const resized = await sharp(image).removeAlpha().resize({ width: scanWidth }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = resized;
  if (data[Math.floor(scanWidth * 0.98)] < 128) {
    for (let index = 0; index < data.length; index++) data[index] = 255 - data[index];
  }
  const gap = Math.round(scanWidth * gapRatio);
  const bands: { top: number; bottom: number }[] = [];
  for (let y = 0; y < info.height; y++) {
    let ink = 0;
    for (let x = Math.floor(scanWidth * 0.08); x < scanWidth * 0.95; x++) {
      if (data[y * scanWidth + x] < 195) ink++;
    }
    if (ink < 4) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.bottom <= gap) last.bottom = y;
    else bands.push({ top: y, bottom: y });
  }
  const visible = bands.filter((band) => band.bottom - band.top >= scanWidth * 0.014);
  return visible.map((band, index) => {
    const previous = visible[index - 1];
    const next = visible[index + 1];
    const top = Math.max(0, Math.round((band.top - Math.min(scanWidth * 0.018, previous ? (band.top - previous.bottom) / 2 : band.top)) * width / scanWidth));
    const bottom = Math.min(height, Math.ceil((band.bottom + Math.min(scanWidth * 0.018, next ? (next.top - band.bottom) / 2 : scanWidth * 0.018)) * width / scanWidth));
    return { top, height: bottom - top };
  });
}
