import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import zlib from "node:zlib";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const assetsDir = path.join(root, "assets");
fs.mkdirSync(assetsDir, { recursive: true });
const brandPath = path.join(assetsDir, "brand-icon.png");

function runPs(script, args) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-File", script, ...args],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    throw new Error(`Script failed: ${script}`);
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function createPng(width, height, rgbaFn) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = rgbaFn(x, y, width, height);
      const i = rowStart + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
function playIcon(size) {
  return createPng(size, size, (x, y) => {
    const nx = x / (size - 1), ny = y / (size - 1);
    if (nx > 0.32 && nx < 0.78) {
      const top = 0.22 + (nx - 0.32) * 0.7;
      const bot = 0.78 - (nx - 0.32) * 0.7;
      if (ny >= top && ny <= bot) return [255, 255, 255, 255];
    }
    return [0, 0, 0, 0];
  });
}
function pauseIcon(size) {
  return createPng(size, size, (x, y) => {
    const nx = x / (size - 1), ny = y / (size - 1);
    const inBar = ny > 0.2 && ny < 0.8 && ((nx > 0.28 && nx < 0.42) || (nx > 0.58 && nx < 0.72));
    return inBar ? [255, 255, 255, 255] : [0, 0, 0, 0];
  });
}
function skipIcon(size, direction) {
  return createPng(size, size, (x, y) => {
    const nx = direction === 1 ? x / (size - 1) : 1 - x / (size - 1);
    const ny = y / (size - 1);
    const bar = nx > 0.18 && nx < 0.3 && ny > 0.22 && ny < 0.78;
    let tri = false;
    if (nx > 0.32 && nx < 0.82) {
      const top = 0.22 + (nx - 0.32) * 0.65;
      const bot = 0.78 - (nx - 0.32) * 0.65;
      tri = ny >= top && ny <= bot;
    }
    return bar || tri ? [255, 255, 255, 255] : [0, 0, 0, 0];
  });
}
function circleIcon(size, fill) {
  const cx = (size - 1) / 2, cy = (size - 1) / 2, r = size * 0.42;
  return createPng(size, size, (x, y) => (Math.hypot(x - cx, y - cy) <= r ? fill : [0, 0, 0, 0]));
}
function pngsToIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(count, 4);
  const entries = []; let offset = 6 + 16 * count; const bodies = [];
  for (const { size, buf } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size; entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8); entry.writeUInt32LE(offset, 12);
    entries.push(entry); bodies.push(buf); offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...bodies]);
}

function generateAppIconsFromBrand() {
  if (!fs.existsSync(brandPath)) {
    console.warn("[icons] brand-icon.png missing");
    return;
  }
  runPs(path.join(root, "scripts", "flood-fill-corners.ps1"), [brandPath, brandPath]);
  runPs(path.join(root, "scripts", "resize-brand-icons.ps1"), [brandPath, assetsDir]);

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const tmp = path.join(process.env.TEMP || "/tmp", "amd-icons");
  const pngs = sizes.map((size) => ({
    size,
    buf: fs.readFileSync(path.join(tmp, `icon-${size}.png`)),
  }));
  fs.writeFileSync(path.join(assetsDir, "icon.ico"), pngsToIco(pngs));
  console.log("[icons] Wrote transparent icon.png / icon.ico");
}

generateAppIconsFromBrand();
fs.writeFileSync(path.join(assetsDir, "tray-playing.png"), circleIcon(16, [80, 220, 120, 255]));
fs.writeFileSync(path.join(assetsDir, "thumbar-play.png"), playIcon(32));
fs.writeFileSync(path.join(assetsDir, "thumbar-pause.png"), pauseIcon(32));
fs.writeFileSync(path.join(assetsDir, "thumbar-prev.png"), skipIcon(32, -1));
fs.writeFileSync(path.join(assetsDir, "thumbar-next.png"), skipIcon(32, 1));
console.log("Generated control icons");