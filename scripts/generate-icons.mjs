import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size) {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = [];
  const cx = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    raw.push(0);
    for (let x = 0; x < size; x += 1) {
      const dx = x - cx;
      const dy = y - cx;
      const inCircle = dx * dx + dy * dy <= (size * 0.42) ** 2;
      const inStem = Math.abs(x - cx) <= size * 0.08 && y >= size * 0.28 && y <= size * 0.55;
      const inHead =
        y >= size * 0.48 &&
        y <= size * 0.74 &&
        Math.abs(x - cx) <= (size * 0.72 - y) * 1.15;
      if (inStem || inHead) {
        raw.push(255, 255, 255);
      } else if (inCircle) {
        raw.push(45, 136, 255);
      } else {
        raw.push(28, 30, 33);
      }
    }
  }
  const idat = zlib.deflateSync(Buffer.from(raw));
  return Buffer.concat([header, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "../extension/icons");
await mkdir(dir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await new Promise((resolve, reject) => {
    const stream = createWriteStream(join(dir, `icon${size}.png`));
    stream.on("finish", resolve);
    stream.on("error", reject);
    stream.end(png(size));
  });
}
