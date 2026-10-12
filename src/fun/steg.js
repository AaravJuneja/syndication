const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

function run(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs || 30000, maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      resolve({ err, out: String(stdout || "").trim() });
    });
  });
}

async function fetchBytes(url, maxBytes) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "syndication-bot" },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) return null;
  return buf;
}

function parsePng(buf) {
  if (buf.length < 8 || buf.toString("ascii", 1, 4) !== "PNG") return null;
  const chunks = [];
  let pos = 8;
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    if (pos + 12 + len > buf.length) break;
    chunks.push({ type, len, data: buf.slice(pos + 8, pos + 8 + len) });
    pos += 12 + len;
    if (type === "IEND") break;
  }
  return chunks;
}

function unfilterPng(raw, w, ch) {
  const rowLen = w * ch;
  const lines = [];
  let pos = 0;
  let prev = Buffer.alloc(rowLen);
  const n = Math.floor(raw.length / (rowLen + 1));
  for (let y = 0; y < n; y++) {
    const filter = raw[pos++];
    const cur = raw.slice(pos, pos + rowLen);
    pos += rowLen;
    const recon = Buffer.alloc(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= ch ? recon[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = cur[i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      recon[i] = v;
    }
    lines.push(recon);
    prev = recon;
  }
  return Buffer.concat(lines);
}

function lsbBitsToText(bits) {
  let out = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    out += String.fromCharCode(parseInt(bits.slice(i, i + 8).join(""), 2));
  }
  return out;
}

function printableRatio(s) {
  if (!s.length) return 0;
  const m = s.match(/[\x20-\x7e\n\r\t]/g);
  return (m ? m.length : 0) / s.length;
}

async function pngChunks(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts png <image url>`");
    return;
  }
  const buf = await fetchBytes(url, 12 * 1024 * 1024).catch(() => null);
  if (!buf) {
    await message.channel.send("Download failed (or over 12MB).");
    return;
  }
  const chunks = parsePng(buf);
  if (!chunks) {
    await message.channel.send("Not a PNG.");
    return;
  }
  const lines = [];
  for (const c of chunks) {
    if (c.type === "IHDR") {
      lines.push("IHDR " + c.data.readUInt32BE(0) + "x" + c.data.readUInt32BE(4) + " bit" + c.data[8] + " type" + c.data[9]);
    } else if (c.type === "tEXt") {
      const zero = c.data.indexOf(0);
      const kw = c.data.slice(0, zero).toString("latin1");
      const val = c.data.slice(zero + 1).toString("latin1");
      lines.push("tEXt " + kw + " = " + val.slice(0, 300));
    } else if (c.type === "iTXt") {
      const parts = c.data.toString("latin1").split("\0");
      lines.push("iTXt " + parts[0] + " = " + parts.slice(4).join("").slice(0, 300));
    } else if (c.type === "zTXt") {
      try {
        const zero = c.data.indexOf(0);
        const kw = c.data.slice(0, zero).toString("latin1");
        const val = zlib.inflateSync(c.data.slice(zero + 2)).toString("latin1");
        lines.push("zTXt " + kw + " = " + val.slice(0, 300));
      } catch {
        lines.push("zTXt (unreadable)");
      }
    } else if (c.type !== "IDAT") {
      lines.push(c.type + " (" + c.len + " bytes)");
    }
  }
  const idat = chunks.filter((c) => c.type === "IDAT").reduce((a, c) => a + c.len, 0);
  lines.push("IDAT total: " + idat + " bytes");
  await message.channel.send(cut(lines.join("\n") || "No chunks found."));
}

async function lsb(message, url, channel) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts lsb <image url> [r|g|b|a|all]` (PNG/BMP)");
    return;
  }
  const buf = await fetchBytes(url, 12 * 1024 * 1024).catch(() => null);
  if (!buf) {
    await message.channel.send("Download failed (or over 12MB).");
    return;
  }
  const sel = (channel || "all").toLowerCase();
  const keep = sel === "r" ? [0] : sel === "g" ? [1] : sel === "b" ? [2] : sel === "a" ? [3] : [0, 1, 2, 3];
  let pixels = null;
  if (buf.toString("ascii", 1, 4) === "PNG") {
    const chunks = parsePng(buf);
    const ihdr = chunks && chunks.find((c) => c.type === "IHDR");
    if (!chunks || !ihdr || ihdr.data[8] !== 8 || (ihdr.data[9] !== 2 && ihdr.data[9] !== 6)) {
      await message.channel.send("Only 8-bit RGB/RGBA PNG supported.");
      return;
    }
    const w = ihdr.data.readUInt32BE(0);
    const h = ihdr.data.readUInt32BE(4);
    const ch = ihdr.data[9] === 6 ? 4 : 3;
    if (w * h > 12000000) {
      await message.channel.send("Image too big (12MP max).");
      return;
    }
    try {
      const idat = Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.data));
      pixels = { data: unfilterPng(zlib.inflateSync(idat), w, ch), ch };
    } catch {
      await message.channel.send("Could not decode PNG pixels.");
      return;
    }
  } else if (buf.toString("ascii", 0, 2) === "BM") {
    const off = buf.readUInt32LE(10);
    const bpp = buf.readUInt16LE(28);
    if (bpp !== 24) {
      await message.channel.send("Only 24-bit BMP supported.");
      return;
    }
    const w = buf.readInt32LE(18);
    const h = Math.abs(buf.readInt32LE(22));
    const rowPad = (4 - ((w * 3) % 4)) % 4;
    const bytes = [];
    for (let y = 0; y < h; y++) {
      const row = off + y * (w * 3 + rowPad);
      for (let x = 0; x < w * 3; x++) bytes.push(buf[row + x]);
    }
    pixels = { data: Buffer.from(bytes), ch: 3 };
  } else {
    await message.channel.send("Only PNG/BMP supported.");
    return;
  }
  const bits = [];
  const data = pixels.data;
  for (let i = 0; i < data.length && bits.length < 8000; i++) {
    if (keep.includes(i % pixels.ch)) bits.push(data[i] & 1);
  }
  const text = lsbBitsToText(bits);
  const upto = text.split("\0")[0];
  if (printableRatio(upto) > 0.7 && upto.trim().length >= 4) {
    await message.channel.send(cut("LSB [" + sel + "]:\n" + upto.slice(0, 600)));
  } else {
    await message.channel.send("LSB [" + sel + "]: nothing readable (" + bits.length + " bits scanned).");
  }
}

const CARVE_MAGIC = [
  ["PNG image", "89504e47"],
  ["JPEG image", "ffd8ff"],
  ["GIF image", "474946"],
  ["ZIP archive", "504b0304"],
  ["PDF document", "25504446"],
  ["RAR archive", "52617221"],
  ["7z archive", "377abcaf271c"],
  ["GZip archive", "1f8b"],
  ["BMP image", "424d"],
  ["WAV audio", "52494646"],
  ["MP3 audio", "494433"],
  ["SQLite db", "53514c697465"],
  ["ELF binary", "7f454c46"],
  ["PE binary", "4d5a"],
];

async function carve(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts carve <file url>`");
    return;
  }
  const buf = await fetchBytes(url, 25 * 1024 * 1024).catch(() => null);
  if (!buf) {
    await message.channel.send("Download failed (or over 25MB).");
    return;
  }
  const hex = buf.toString("hex");
  const hits = [];
  for (const [name, magic] of CARVE_MAGIC) {
    let from = 0;
    for (;;) {
      const i = hex.indexOf(magic, from);
      if (i < 0) break;
      hits.push({ off: i / 2, name });
      from = i + 2;
      if (hits.length > 40) break;
    }
    if (hits.length > 40) break;
  }
  hits.sort((a, b) => a.off - b.off);
  if (!hits.length) {
    await message.channel.send("No embedded file signatures found.");
    return;
  }
  await message.channel.send(cut(hits.map((h) => "0x" + Math.floor(h.off).toString(16) + " (" + Math.floor(h.off) + "): " + h.name).join("\n")));
}

async function transform(message, url, op) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts negate|flop|solar <image url>`");
    return;
  }
  const buf = await fetchBytes(url, 12 * 1024 * 1024).catch(() => null);
  if (!buf) {
    await message.channel.send("Download failed (or over 12MB).");
    return;
  }
  const dir = os.tmpdir();
  const stamp = "syn-" + Date.now();
  const src = path.join(dir, stamp + ".in");
  const dst = path.join(dir, stamp + ".png");
  try {
    fs.writeFileSync(src, buf);
    const args = op === "negate" ? [src, "-negate", dst] : op === "flop" ? [src, "-flop", dst] : [src, "-solarize", "50%", dst];
    const r = await run("convert", args, 30000);
    if (r.err || !fs.existsSync(dst)) {
      await message.channel.send("Transform failed (needs ImageMagick).");
      return;
    }
    await message.channel.send({ files: [dst] });
  } finally {
    try {
      fs.unlinkSync(src);
    } catch {}
    try {
      fs.unlinkSync(dst);
    } catch {}
  }
}

module.exports = async function steg(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();
  if (lower.startsWith(p + "png ")) {
    await pngChunks(message, arg(p + "png ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "lsb ")) {
    const parts = arg(p + "lsb ").split(/\s+/);
    await lsb(message, parts[0] || "", parts[1] || "all");
    return true;
  }
  if (lower.startsWith(p + "carve ")) {
    await carve(message, arg(p + "carve ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "negate ")) {
    await transform(message, arg(p + "negate ").split(/\s+/)[0] || "", "negate");
    return true;
  }
  if (lower.startsWith(p + "flop ")) {
    await transform(message, arg(p + "flop ").split(/\s+/)[0] || "", "flop");
    return true;
  }
  if (lower.startsWith(p + "solar ")) {
    await transform(message, arg(p + "solar ").split(/\s+/)[0] || "", "solar");
    return true;
  }
  return false;
};
