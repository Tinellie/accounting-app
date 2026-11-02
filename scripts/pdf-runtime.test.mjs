import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const content = 'BT /F1 20 Tf 20 100 Td (ACCOUNTING TEST 123.45) Tj ET';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 160] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
];
let pdf = '%PDF-1.4\n';
const offsets = [];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
const document = await getDocument({
  data: new Uint8Array(Buffer.from(pdf)),
  useSystemFonts: true,
}).promise;
try {
  const page = await document.getPage(1);
  const text = (await page.getTextContent()).items.map(item => item.str || '').join(' ');
  assert.match(text, /ACCOUNTING TEST 123\.45/);
  const viewport = page.getViewport({ scale: 1 });
  const target = document.canvasFactory.create(viewport.width, viewport.height);
  try {
    await page.render({ canvas: target.canvas, viewport }).promise;
    const { data } = target.context.getImageData(0, 0, viewport.width, viewport.height);
    let darkPixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] < 128 && data[i + 1] < 128 && data[i + 2] < 128) darkPixels++;
    }
    assert.ok(darkPixels > 100, `PDF text must actually render, dark pixels: ${darkPixels}`);
    const png = target.canvas.toBuffer('image/png');
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    console.log(JSON.stringify({ pdfText: text, darkPixels, pngBytes: png.length }));
  } finally { document.canvasFactory.destroy(target); }
} finally { await document.destroy(); }
