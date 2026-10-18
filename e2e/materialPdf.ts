/** Self-contained PDF and image fixtures for local rendering, protection and page-limit checks. */
import { createHash } from 'node:crypto';

/** A one-pixel PNG as a file the import pages accept. */
export const tinyPng = {
  name: 'tiny.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'base64',
  ),
};

export function materialPdf(pageCount = 1): string {
  const pageIds = Array.from({ length: pageCount }, (_, index) => index + 5);
  const stream = '0.1 0.3 0.6 rg 20 20 160 100 re f BT /F1 24 Tf 20 160 Td (Bonjour Relire) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ...pageIds.map(
      () =>
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>',
    ),
  ];
  return pdfObjects(objects);
}

function pdfObjects(objects: string[], trailer = ''): string {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  return `${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF\n`;
}

/** PDF 1.4 standard security (RC4, revision 2); no external fixture dependency. */
export function protectedMaterialPdf(password: string): string {
  const padding = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
  const pad = (text: string) => Buffer.concat([Buffer.from(text, 'ascii'), padding]).subarray(0, 32);
  const md5 = (bytes: Uint8Array) => createHash('md5').update(bytes).digest();
  const rc4 = (key: Uint8Array, bytes: Uint8Array) => {
    const state = Array.from({ length: 256 }, (_, index) => index);
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + state[i] + key[i % key.length]) % 256;
      [state[i], state[j]] = [state[j], state[i]];
    }
    let i = 0;
    j = 0;
    return Buffer.from(
      bytes.map((byte) => {
        i = (i + 1) % 256;
        j = (j + state[i]) % 256;
        [state[i], state[j]] = [state[j], state[i]];
        return byte ^ state[(state[i] + state[j]) % 256];
      }),
    );
  };
  const owner = rc4(md5(pad('owner')).subarray(0, 5), pad(password));
  const id = md5(Buffer.from('Relire material protection test'));
  const permissions = Buffer.from([0xfc, 0xff, 0xff, 0xff]);
  const key = md5(Buffer.concat([pad(password), owner, permissions, id])).subarray(0, 5);
  const user = rc4(key, padding);
  return pdfObjects(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
      `<< /Filter /Standard /V 1 /R 2 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P -4 >>`,
    ],
    `/Encrypt 4 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>]`,
  );
}
