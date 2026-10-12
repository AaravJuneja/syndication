const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const config = require("../config");
const { morseDecode } = require("./morse");

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

async function toWavMono8k(url) {
  const buf = await fetchBytes(url, 12 * 1024 * 1024).catch(() => null);
  if (!buf) return null;
  const dir = os.tmpdir();
  const stamp = "syn-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  const src = path.join(dir, stamp + ".in");
  const wav = path.join(dir, stamp + ".wav");
  try {
    fs.writeFileSync(src, buf);
    const c = await run("ffmpeg", ["-y", "-v", "error", "-i", src, "-ac", "1", "-ar", "8000", "-f", "wav", wav], 30000);
    if (c.err || !fs.existsSync(wav)) return null;
    return wav;
  } finally {
    try {
      fs.unlinkSync(src);
    } catch {}
  }
}

function readWavMono(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const chunk = buf.slice(pos + 8, pos + 8 + size);
    if (id === "fmt ") {
      fmt = {
        audioFormat: chunk.readUInt16LE(0),
        channels: chunk.readUInt16LE(2),
        sampleRate: chunk.readUInt32LE(4),
        bits: chunk.readUInt16LE(14),
      };
    } else if (id === "data") {
      data = chunk;
    }
    pos += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.audioFormat !== 1 || (fmt.bits !== 8 && fmt.bits !== 16)) return null;
  const n = Math.floor(data.length / (fmt.bits / 8) / fmt.channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let ch = 0; ch < fmt.channels; ch++) {
      const off = (i * fmt.channels + ch) * (fmt.bits / 8);
      sum += fmt.bits === 16 ? data.readInt16LE(off) / 32768 : (data[off] - 128) / 128;
    }
    out[i] = sum / fmt.channels;
  }
  return { samples: out, rate: fmt.sampleRate };
}

const DTMF_ROWS = [697, 770, 852, 941];
const DTMF_COLS = [1209, 1336, 1477, 1633];
const DTMF_KEYS = ["123A", "456B", "789C", "*0#D"];

function goertzel(samples, sr, freq) {
  const n = samples.length;
  const k = 0.5 + (n * freq) / sr;
  const w = (2 * Math.PI * k) / n;
  const cw = Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (const x of samples) {
    const s0 = x + 2 * cw * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - cw * s1 * s2;
}

function dtmfDecode(samples, sr) {
  const block = Math.floor(sr * 0.025);
  let cur = "";
  let run = 0;
  let last = "";
  let out = "";
  for (let i = 0; i + block <= samples.length; i += block) {
    const seg = samples.slice(i, i + block);
    let energy = 0;
    for (const x of seg) energy += x * x;
    let digit = "";
    if (energy > block * 0.002) {
      const rp = DTMF_ROWS.map((f) => goertzel(seg, sr, f));
      const cp = DTMF_COLS.map((f) => goertzel(seg, sr, f));
      const ri = rp.indexOf(Math.max(...rp));
      const ci = cp.indexOf(Math.max(...cp));
      const rSorted = [...rp].sort((a, b) => b - a);
      const cSorted = [...cp].sort((a, b) => b - a);
      if (rp[ri] > 4 * rSorted[1] && cp[ci] > 4 * cSorted[1]) {
        digit = DTMF_KEYS[ri][ci];
      }
    }
    if (digit === cur && digit !== "") {
      run++;
    } else {
      cur = digit;
      run = digit ? 1 : 0;
      if (!digit) last = "";
    }
    if (run === 3 && cur !== last) {
      out += cur;
      last = cur;
    }
  }
  return out;
}

function toneSegments(samples, sr) {
  const win = Math.floor(sr * 0.005);
  const env = new Float32Array(samples.length);
  let acc = 0;
  for (let i = 0; i < samples.length; i++) {
    acc += Math.abs(samples[i]);
    if (i >= win) acc -= Math.abs(samples[i - win]);
    env[i] = acc / Math.min(i + 1, win);
  }
  let peak = 0;
  for (const v of env) if (v > peak) peak = v;
  const thresh = Math.max(peak * 0.3, 0.02);
  const segs = [];
  let start = -1;
  for (let i = 0; i < env.length; i++) {
    if (env[i] > thresh && start < 0) start = i;
    else if (env[i] <= thresh && start >= 0) {
      if (i - start > sr * 0.02) segs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) segs.push([start, env.length]);
  return segs;
}

function morseFromTones(segs, sr) {
  if (!segs.length) return "";
  const durs = segs.map(([a, b]) => b - a).sort((x, y) => x - y);
  let split = durs[durs.length - 1];
  let gap = 0;
  for (let i = 1; i < durs.length; i++) {
    if (durs[i] - durs[i - 1] > gap) {
      gap = durs[i] - durs[i - 1];
      split = (durs[i] + durs[i - 1]) / 2;
    }
  }
  const unit = durs[0];
  let morse = "";
  for (let i = 0; i < segs.length; i++) {
    const dur = segs[i][1] - segs[i][0];
    morse += dur < split ? "." : "-";
    if (i + 1 < segs.length) {
      const g = segs[i + 1][0] - segs[i][1];
      if (g > unit * 6) morse += " / ";
      else if (g > unit * 2.5) morse += " ";
    }
  }
  return morse;
}

const SPECTRO_PY = [
  "import sys, wave",
  "import numpy as np",
  "import matplotlib",
  "matplotlib.use('Agg')",
  "import matplotlib.pyplot as plt",
  "f = wave.open(sys.argv[1], 'rb')",
  "n = f.getnframes(); ch = f.getnchannels(); sr = f.getframerate(); sw = f.getsampwidth()",
  "raw = f.readframes(n)",
  "x = np.frombuffer(raw, dtype=np.int16 if sw == 2 else np.uint8).astype(float)",
  "if sw == 1: x = (x - 128) / 128",
  "else: x = x / 32768.0",
  "if ch > 1: x = x.reshape(-1, ch).mean(axis=1)",
  "N = 1024; hop = 512",
  "idx = range(0, len(x) - N, hop)",
  "S = np.abs(np.fft.rfft([x[i:i+N] * np.hanning(N) for i in idx], axis=1)).T",
  "S = 20 * np.log10(S + 1e-6)",
  "plt.figure(figsize=(12, 6))",
  "plt.imshow(S, aspect='auto', origin='lower', cmap='magma', vmax=np.max(S), vmin=np.max(S) - 80)",
  "plt.ylim(0, min(400, S.shape[0]))",
  "plt.axis('off')",
  "plt.tight_layout(pad=0)",
  "plt.savefig(sys.argv[2], dpi=100, bbox_inches='tight', pad_inches=0)",
  "print('ok')",
].join("\n");

async function dtmf(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts dtmf <audio url>`");
    return;
  }
  const wav = await toWavMono8k(url);
  if (!wav) {
    await message.channel.send("Could not fetch/convert audio (needs ffmpeg).");
    return;
  }
  try {
    const parsed = readWavMono(wav);
    if (!parsed) {
      await message.channel.send("Unreadable WAV.");
      return;
    }
    const digits = dtmfDecode(parsed.samples, parsed.rate);
    await message.channel.send(digits ? "DTMF: `" + digits + "`" : "No DTMF tones found. Clean dial tones work best.");
  } finally {
    try {
      fs.unlinkSync(wav);
    } catch {}
  }
}

async function amorse(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts amorse <audio url>`");
    return;
  }
  const wav = await toWavMono8k(url);
  if (!wav) {
    await message.channel.send("Could not fetch/convert audio (needs ffmpeg).");
    return;
  }
  try {
    const parsed = readWavMono(wav);
    if (!parsed) {
      await message.channel.send("Unreadable WAV.");
      return;
    }
    const segs = toneSegments(parsed.samples, parsed.rate);
    if (!segs.length) {
      await message.channel.send("No tones found.");
      return;
    }
    const code = morseFromTones(segs, parsed.rate);
    await message.channel.send("morse: `" + code + "`\ntext: `" + morseDecode(code) + "`");
  } finally {
    try {
      fs.unlinkSync(wav);
    } catch {}
  }
}

async function spectro(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts spectro <audio url>`");
    return;
  }
  const wav = await toWavMono8k(url);
  if (!wav) {
    await message.channel.send("Could not fetch/convert audio (needs ffmpeg).");
    return;
  }
  const png = wav + ".png";
  try {
    const r = await run("python3", ["-c", SPECTRO_PY, wav, png], 60000);
    if (r.err || r.out !== "ok" || !fs.existsSync(png)) {
      await message.channel.send("Spectrogram failed (needs python numpy + matplotlib).");
      return;
    }
    await message.channel.send({ files: [png] });
  } finally {
    try {
      fs.unlinkSync(wav);
    } catch {}
    try {
      fs.unlinkSync(png);
    } catch {}
  }
}

module.exports = async function audio(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();
  if (lower.startsWith(p + "dtmf ")) {
    await dtmf(message, arg(p + "dtmf ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "amorse ")) {
    await amorse(message, arg(p + "amorse ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "spectro ")) {
    await spectro(message, arg(p + "spectro ").split(/\s+/)[0] || "");
    return true;
  }
  return false;
};
