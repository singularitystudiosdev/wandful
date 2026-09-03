// One-shot generator for Wandful's PNG icons (no canvas dependency).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Violet gradient background, white diagonal wand with sparkle burst.
function pixel(x, y, size) {
  const u = x / size, v = y / size;
  const r = Math.round(76 + 48 * v);
  const g = Math.round(29 + 29 * v);
  const b = Math.round(149 + 60 * v);
  const m = 0.08 * size;
  if (u < m / size || v < m / size || u > 1 - m / size || v > 1 - m / size) {
    // rounded corners: cut outside the quarter circles
    const cx = Math.min(u, 1 - u) * size, cy = Math.min(v, 1 - v) * size;
    if (Math.min(u, 1 - u) < 0.14 && Math.min(v, 1 - v) < 0.14) {
      const dx = (u < 0.5 ? 0.14 : 0.86) * size - x;
      const dy = (v < 0.5 ? 0.14 : 0.86) * size - y;
      if (dx * dx + dy * dy > 0.14 * 0.14 * size * size) return [0, 0, 0, 0];
    }
  }
  // wand: line from (0.2,0.8) to (0.75,0.25)
  const t = ((u - 0.2) * 0.55 + (v - 0.8) * -0.55) / (0.55 * 0.55 * 2);
  const px = 0.2 + 0.55 * t, py = 0.8 - 0.55 * t;
  const d = Math.hypot(u - px, v - py);
  if (d < 0.045 && t > -0.1 && t < 1.1) return [255, 255, 255, 255];
  // sparkle: small plus at the wand tip
  const ds = Math.hypot(u - 0.82, v - 0.2);
  if (ds < 0.03 || (Math.abs(u - 0.82) < 0.09 && Math.abs(v - 0.2) < 0.012) || (Math.abs(v - 0.2) < 0.09 && Math.abs(u - 0.82) < 0.012)) {
    return [255, 255, 255, 255];
  }
  return [r, g, b, 255];
}

for (const size of [16, 48, 128]) {
  writeFileSync(new URL(`./wandful-${size}.png`, import.meta.url), png(size, pixel));
  console.log("wrote wandful-" + size + ".png");
}
