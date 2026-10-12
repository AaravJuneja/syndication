const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

function keyOrder(key) {
  return [...key].map((c, i) => i).sort((a, b) => (key[a] < key[b] ? -1 : key[a] > key[b] ? 1 : a - b));
}

function parseOpts(parts) {
  const o = { key: "", sq: "", n: 0, w: 0, pad: null, vert: false, german: false, colrow: false, drop: 0, text: "" };
  const rest = [];
  for (const tok of parts) {
    const low = tok.toLowerCase();
    if (/^(k|key)=/.test(low)) o.key = tok.slice(tok.indexOf("=") + 1);
    else if (/^sq=/.test(low)) o.sq = tok.slice(3);
    else if (/^n=\d+$/.test(low)) o.n = parseInt(low.slice(2));
    else if (/^w=\d+$/.test(low)) o.w = parseInt(low.slice(2));
    else if (/^pad(=.?)?$/.test(low)) o.pad = low.length > 4 ? tok.slice(4) : "X";
    else if (/^drop=\d+$/.test(low)) o.drop = parseInt(low.slice(5));
    else if (low === "german") o.german = true;
    else if (low === "colrow") o.colrow = true;
    else rest.push(tok);
  }
  o.text = rest.join(" ");
  return o;
}

function columnar(text, key, pad, decode) {
  const k = String(key || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return null;
  const n = k.length;
  const perm = keyOrder(k);
  if (!decode) {
    let t = String(text).toUpperCase().replace(/[^A-Z]/g, "");
    if (!t) return "";
    const r = Math.ceil(t.length / n);
    if (pad) t = t.padEnd(r * n, pad);
    const grid = [];
    for (let i = 0; i < r; i++) grid.push([...t.slice(i * n, i * n + n)]);
    let out = "";
    for (const c of perm) for (let i = 0; i < r; i++) if (grid[i][c] !== undefined) out += grid[i][c];
    return out;
  }
  const t = String(text).toUpperCase().replace(/[^A-Z]/g, "");
  if (!t) return "";
  const r = Math.ceil(t.length / n);
  const grid = Array.from({ length: r }, () => new Array(n));
  let p = 0;
  if (pad) {
    for (const c of perm) for (let i = 0; i < r; i++) grid[i][c] = t[p++];
  } else {
    const rem = t.length % n;
    const longN = rem === 0 ? n : rem;
    const isLong = new Array(n).fill(false);
    for (let j = 0; j < longN; j++) isLong[j] = true;
    for (const c of perm) {
      const h = isLong[c] ? r : r - 1;
      for (let i = 0; i < h; i++) grid[i][c] = t[p++];
    }
  }
  let out = "";
  for (let i = 0; i < r; i++) for (let j = 0; j < n; j++) if (grid[i][j] !== undefined) out += grid[i][j];
  return out;
}

function scytale(text, n, pad, decode) {
  if (!(n >= 2)) return null;
  if (!decode) {
    let t = String(text);
    const r = Math.ceil(t.length / n);
    t = t.padEnd(r * n, pad);
    let out = "";
    for (let c = 0; c < n; c++) for (let i = 0; i < r; i++) out += t[i * n + c];
    return out;
  }
  const t = String(text);
  if (t.length % n !== 0) return null;
  const r = t.length / n;
  const grid = Array.from({ length: r }, () => new Array(n));
  let p = 0;
  for (let c = 0; c < n; c++) for (let i = 0; i < r; i++) grid[i][c] = t[p++];
  let out = "";
  for (let i = 0; i < r; i++) for (let c = 0; c < n; c++) out += grid[i][c];
  while (out.endsWith(pad)) out = out.slice(0, -pad.length);
  return out;
}

function route(text, w, pad, decode) {
  if (!(w >= 2)) return null;
  pad = pad || "X";
  if (!decode) {
    let t = String(text);
    const h = Math.ceil(t.length / w);
    t = t.padEnd(h * w, pad);
    let out = "";
    for (let c = 0; c < w; c++) {
      if (c % 2 === 0) for (let i = 0; i < h; i++) out += t[i * w + c];
      else for (let i = h - 1; i >= 0; i--) out += t[i * w + c];
    }
    return out;
  }
  const t = String(text);
  if (t.length % w !== 0) return null;
  const h = t.length / w;
  const grid = Array.from({ length: h }, () => new Array(w));
  let p = 0;
  for (let c = 0; c < w; c++) {
    if (c % 2 === 0) for (let i = 0; i < h; i++) grid[i][c] = t[p++];
    else for (let i = h - 1; i >= 0; i--) grid[i][c] = t[p++];
  }
  let out = "";
  for (let i = 0; i < h; i++) for (let c = 0; c < w; c++) out += grid[i][c];
  while (out.endsWith(pad)) out = out.slice(0, -pad.length);
  return out;
}

const ADFGVX_LABELS = "ADFGVX";
const ADFGX_LABELS = "ADFGX";

function fracSquare(sqKey, labels, alpha) {
  const seen = new Set();
  let s = "";
  for (const c of String(sqKey || "").toUpperCase().replace(/J/g, labels.length === 5 ? "I" : "J").replace(/[^A-Z0-9]/g, "")) {
    if (alpha.includes(c) && !seen.has(c)) {
      seen.add(c);
      s += c;
    }
  }
  for (const c of alpha) if (!seen.has(c)) s += c;
  return s;
}

function fracEncode(s, labels, size) {
  const idx = {};
  for (let i = 0; i < s.length; i++) idx[s[i]] = i;
  return { toPair: (c) => labels[Math.floor(idx[c] / size)] + labels[idx[c] % size], fromPair: (a, b) => s[labels.indexOf(a) * size + labels.indexOf(b)] };
}

function stage2enc(stream, k2, pad) {
  const k = String(k2 || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return stream;
  const w = k.length;
  const perm = keyOrder(k);
  const r = Math.ceil(stream.length / w);
  let t = stream;
  if (pad) t = t.padEnd(r * w, "X");
  const grid = [];
  for (let i = 0; i < r; i++) grid.push([...t.slice(i * w, i * w + w)]);
  let out = "";
  for (const c of perm) for (let i = 0; i < r; i++) if (grid[i][c] !== undefined) out += grid[i][c];
  return out;
}

function stage2dec(stream, k2, padded) {
  const k = String(k2 || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return stream;
  const w = k.length;
  const perm = keyOrder(k);
  const r = Math.ceil(stream.length / w);
  const grid = Array.from({ length: r }, () => new Array(w));
  let p = 0;
  if (padded) {
    for (const c of perm) for (let i = 0; i < r; i++) grid[i][c] = stream[p++];
  } else {
    const rem = stream.length % w;
    const longN = rem === 0 ? w : rem;
    const isLong = new Array(w).fill(false);
    for (let j = 0; j < longN; j++) isLong[j] = true;
    for (const c of perm) {
      const h = isLong[c] ? r : r - 1;
      for (let i = 0; i < h; i++) grid[i][c] = stream[p++];
    }
  }
  let out = "";
  for (let i = 0; i < r; i++) for (let j = 0; j < w; j++) if (grid[i][j] !== undefined) out += grid[i][j];
  return out;
}

function adf(text, o, labels, alpha, size, decode) {
  const sq = fracSquare(o.sq, labels, alpha);
  const f = fracEncode(sq, labels, size);
  if (!decode) {
    const t = String(text).toUpperCase().replace(/J/g, labels.length === 5 ? "I" : "J").replace(new RegExp("[^" + alpha + "]", "g"), "");
    if (!t) return "";
    let s = "";
    for (const c of t) s += f.toPair(c);
    return stage2enc(s, o.key, !!o.pad);
  }
  let t = String(text).toUpperCase().replace(/[^ADFGVX]/g, "");
  if (!t || t.length % 2 !== 0) return null;
  t = stage2dec(t, o.key, !!o.pad);
  if (t.length % 2 !== 0) return null;
  let out = "";
  for (let i = 0; i < t.length; i += 2) {
    if (!labels.includes(t[i]) || !labels.includes(t[i + 1])) return null;
    out += f.fromPair(t[i], t[i + 1]);
  }
  return out;
}

function tabula(text, key, fn) {
  const k = String(key || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return null;
  let out = "";
  let ki = 0;
  for (const c of String(text)) {
    if (/[a-zA-Z]/.test(c)) {
      const base = c <= "Z" ? 65 : 97;
      const v = fn(c.charCodeAt(0) - base, k.charCodeAt(ki++ % k.length) - 65);
      out += String.fromCharCode(((v % 26 + 26) % 26) + base);
    } else out += c;
  }
  return out;
}

function gronsfeld(text, digits, decode) {
  const d = String(digits || "").replace(/[^0-9]/g, "");
  if (!d) return null;
  let out = "";
  let ki = 0;
  for (const c of String(text)) {
    if (/[a-zA-Z]/.test(c)) {
      const base = c <= "Z" ? 65 : 97;
      const v = c.charCodeAt(0) - base;
      const sh = parseInt(d[ki++ % d.length]);
      out += String.fromCharCode((((decode ? v - sh : v + sh) % 26 + 26) % 26) + base);
    } else out += c;
  }
  return out;
}

function autokey(text, primer, decode) {
  const pr = String(primer || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!pr) return null;
  const stream = [...pr].map((c) => c.charCodeAt(0) - 65);
  let out = "";
  for (const c of String(text)) {
    if (/[a-zA-Z]/.test(c)) {
      const base = c <= "Z" ? 65 : 97;
      const v = c.charCodeAt(0) - base;
      if (!decode) {
        out += String.fromCharCode(((v + stream[0]) % 26) + base);
        stream.push(v);
      } else {
        const pv = (((v - stream[0]) % 26) + 26) % 26;
        out += String.fromCharCode(pv + base);
        stream.push(pv);
      }
      stream.shift();
    } else out += c;
  }
  return out;
}

const PORTA_ROWS = [
  "NOPQRSTUVWXYZABCDEFGHIJKLM", "ZNOPQRSTUVWXYABCDEFGHIJKLM", "YZNOPQRSTUVWXABCDEFGHIJKLM",
  "XYZNOPQRSTUVWABCDEFGHIJKLM", "WXYZNOPQRSTUVABCDEFGHIJKLM", "VWXYZNOPQRSTUABCDEFGHIJKLM",
  "UVWXYZNOPQRSTABCDEFGHIJKLM", "TUVWXYZNOPQRSABCDEFGHIJKLM", "STUVWXYZNOPQRABCDEFGHIJKLM",
  "RSTUVWXYZNOPQABCDEFGHIJKLM", "QRSTUVWXYZNOPABCDEFGHIJKLM", "PQRSTUVWXYZNOABCDEFGHIJKLM",
  "OPQRSTUVWXYZNABCDEFGHIJKLM",
];

function porta(text, key, decode) {
  const k = String(key || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!k) return null;
  let out = "";
  let ki = 0;
  for (const c of String(text)) {
    if (/[a-zA-Z]/.test(c)) {
      const base = c <= "Z" ? 65 : 97;
      const v = c.charCodeAt(0) - base;
      const row = PORTA_ROWS[Math.floor((k.charCodeAt(ki++ % k.length) - 65) / 2)];
      const ch = decode ? String.fromCharCode(65 + row.indexOf(String.fromCharCode(65 + v))) : row[v];
      out += base === 65 ? ch : ch.toLowerCase();
    } else out += c;
  }
  return out;
}

module.exports = async function transpose(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();

  if (lower.startsWith(p + "columnar ")) {
    const parts = arg(p + "columnar ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !o.key) {
      await message.channel.send("Usage: `ts columnar encode|decode k=KEY [pad] <text>` (pad=X fills the last row; decode ragged otherwise)");
      return true;
    }
    const out = columnar(o.text, o.key, o.pad, mode === "decode");
    await message.channel.send(out === null ? "Need a letter key." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "scytale ")) {
    const parts = arg(p + "scytale ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !(o.n >= 2)) {
      await message.channel.send("Usage: `ts scytale encode|decode n=<width> [pad=_] <text>`");
      return true;
    }
    const out = scytale(o.text, o.n, o.pad || "_", mode === "decode");
    await message.channel.send(out === null ? "Length must be a multiple of the width." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "route ")) {
    const parts = arg(p + "route ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !(o.w >= 2)) {
      await message.channel.send("Usage: `ts route encode|decode w=<width> [pad=X] <text>` (vertical serpentine, top-left)");
      return true;
    }
    const out = route(o.text, o.w, o.pad || "X", mode === "decode");
    await message.channel.send(out === null ? "Length must be a multiple of the width." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "adfgvx ")) {
    const parts = arg(p + "adfgvx ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts adfgvx encode|decode [sq=SQUAREKEY] [k=KEYWORD] [pad] <text>`");
      return true;
    }
    const out = adf(o.text, o, ADFGVX_LABELS, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 6, mode === "decode");
    await message.channel.send(out === null ? "Bad ADFGVX input (even length, A/D/F/G/V/X only)." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "adfgx ")) {
    const parts = arg(p + "adfgx ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts adfgx encode|decode [sq=SQUAREKEY] [k=KEYWORD] [pad] <text>` (J joins I)");
      return true;
    }
    const out = adf(o.text, o, ADFGX_LABELS, "ABCDEFGHIKLMNOPQRSTUVWXYZ", 5, mode === "decode");
    await message.channel.send(out === null ? "Bad ADFGX input (even length, A/D/F/G/X only)." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "gronsfeld ")) {
    const parts = arg(p + "gronsfeld ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !o.key) {
      await message.channel.send("Usage: `ts gronsfeld encode|decode k=<digits> <text>`");
      return true;
    }
    const out = gronsfeld(o.text, o.key, mode === "decode");
    await message.channel.send(out === null ? "Key must contain digits." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "autokey ")) {
    const parts = arg(p + "autokey ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !o.key) {
      await message.channel.send("Usage: `ts autokey encode|decode k=<primer> <text>`");
      return true;
    }
    const out = autokey(o.text, o.key, mode === "decode");
    await message.channel.send(out === null ? "Need a letter primer." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "beaufort ")) {
    const parts = arg(p + "beaufort ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !o.key) {
      await message.channel.send("Usage: `ts beaufort encode|decode k=KEY [german] <text>` (classic K-P; german is P-K)");
      return true;
    }
    const fn = o.german
      ? (a, b) => (mode === "decode" ? a + b : a - b)
      : (a, b) => b - a;
    const out = tabula(o.text, o.key, fn);
    await message.channel.send(out === null ? "Need a letter key." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "porta ")) {
    const parts = arg(p + "porta ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !o.key) {
      await message.channel.send("Usage: `ts porta encode|decode k=KEY <text>` (variant-1 table)");
      return true;
    }
    const out = porta(o.text, o.key, mode === "decode");
    await message.channel.send(out === null ? "Need a letter key." : cut(out || "(empty)"));
    return true;
  }
  return false;
};
