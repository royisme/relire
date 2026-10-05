import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    let byte = buf[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPng(width, height, r, g, b, a = 255) {
  // Signature
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdr = Buffer.concat([
    Buffer.from('IHDR'),
    ihdrData
  ]);
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13, 0);
  const ihdrCrc = Buffer.alloc(4);
  ihdrCrc.writeUInt32BE(crc32(ihdr), 0);
  const ihdrChunk = Buffer.concat([ihdrLen, ihdr, ihdrCrc]);

  // Raw image data: scanlines with filter byte 0
  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(height * rowSize);
  
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // Filter None
    
    // Draw an elegant rounded badge with gradient effect
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = (x - width / 2) / (width / 2);
      const dy = (y - height / 2) / (height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 0.92) {
        // Deep indigo with gold accent gradient
        const t = (x + y) / (width + height);
        raw[pxOffset] = Math.round(30 + t * 150);      // R
        raw[pxOffset + 1] = Math.round(27 + t * 70);   // G
        raw[pxOffset + 2] = Math.round(75 + (1 - t) * 120); // B
        raw[pxOffset + 3] = 255;
      } else if (dist < 0.96) {
        // Golden border
        raw[pxOffset] = 245;
        raw[pxOffset + 1] = 158;
        raw[pxOffset + 2] = 11;
        raw[pxOffset + 3] = 255;
      } else {
        // Transparent
        raw[pxOffset] = 0;
        raw[pxOffset + 1] = 0;
        raw[pxOffset + 2] = 0;
        raw[pxOffset + 3] = 0;
      }
    }
  }

  const compressed = zlib.deflateSync(raw);
  const idat = Buffer.concat([Buffer.from('IDAT'), compressed]);
  const idatLen = Buffer.alloc(4);
  idatLen.writeUInt32BE(compressed.length, 0);
  const idatCrc = Buffer.alloc(4);
  idatCrc.writeUInt32BE(crc32(idat), 0);
  const idatChunk = Buffer.concat([idatLen, idat, idatCrc]);

  // IEND
  const iend = Buffer.from('IEND');
  const iendLen = Buffer.alloc(4);
  const iendCrc = Buffer.alloc(4);
  iendCrc.writeUInt32BE(crc32(iend), 0);
  const iendChunk = Buffer.concat([iendLen, iend, iendCrc]);

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate icons
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, 49, 46, 129));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, 49, 46, 129));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, 49, 46, 129));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, 49, 46, 129));

console.log('PWA PNG Icons generated successfully in public/');
