const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function b58encode(buf) {
  let zeros = 0;
  while (zeros < buf.length && buf[zeros] === 0) zeros++;
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) {
    const r = n % 58n;
    n = n / 58n;
    s = B58[Number(r)] + s;
  }
  return "1".repeat(zeros) + s;
}

function b58decode(str) {
  const t = String(str).trim().replace(/\s+/g, "");
  if (!t) return null;
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return null;
  let ones = 0;
  while (ones < t.length && t[ones] === "1") ones++;
  let n = 0n;
  for (const c of t) n = n * 58n + BigInt(B58.indexOf(c));
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const body = n === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  return Buffer.concat([Buffer.alloc(ones), body]).toString("utf8");
}

function b62encode(buf) {
  let n = 0n;
  for (const b of buf) n = n * 256n + BigInt(b);
  if (n === 0n) return "0";
  let s = "";
  while (n > 0n) {
    const r = n % 62n;
    n = n / 62n;
    s = B62[Number(r)] + s;
  }
  return s;
}

function b62decode(str) {
  const t = String(str).trim().replace(/\s+/g, "");
  if (!t || !/^[0-9A-Za-z]+$/.test(t)) return null;
  let n = 0n;
  for (const c of t) n = n * 62n + BigInt(B62.indexOf(c));
  if (n === 0n) return "";
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return Buffer.from(hex, "hex").toString("utf8");
}

function a85encode(buf) {
  let out = "";
  for (let i = 0; i < buf.length; i += 4) {
    const n = Math.min(4, buf.length - i);
    let v = 0;
    for (let j = 0; j < 4; j++) v = v * 256 + (j < n ? buf[i + j] : 0);
    if (v === 0 && n === 4) {
      out += "z";
      continue;
    }
    const d = [];
    for (let j = 0; j < 5; j++) {
      d.unshift(String.fromCharCode(33 + (v % 85)));
      v = Math.floor(v / 85);
    }
    out += d.slice(0, n + 1).join("");
  }
  return out;
}

function a85decode(str) {
  let t = String(str).trim().replace(/\s+/g, "");
  if (t.startsWith("<~")) t = t.slice(2);
  if (t.endsWith("~>")) t = t.slice(0, -2);
  if (!t || !/^[!-uz]+$/.test(t)) return null;
  const bytes = [];
  let group = [];
  const flush = (g) => {
    const k = g.length;
    if (k < 2 || k > 5) return false;
    let v = 0;
    for (let i = 0; i < 5; i++) v = v * 85 + (i < k ? g[i] : 84);
    if (v > 4294967295) return false;
    const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    for (let i = 0; i < k - 1; i++) bytes.push(b[i]);
    return true;
  };
  for (const c of t) {
    if (c === "z") {
      if (group.length) return null;
      bytes.push(0, 0, 0, 0);
      continue;
    }
    group.push(c.charCodeAt(0) - 33);
    if (group.length === 5) {
      if (!flush(group)) return null;
      group = [];
    }
  }
  if (group.length && !flush(group)) return null;
  if (group.length === 1) return null;
  return Buffer.from(bytes).toString("utf8");
}

const B91 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~\"";

function b91encode(buf) {
  let queue = 0;
  let nbits = 0;
  let out = "";
  for (const b of buf) {
    queue |= b << nbits;
    nbits += 8;
    while (nbits > 13) {
      let v = queue & 8191;
      if (v > 88) {
        queue >>= 13;
        nbits -= 13;
      } else {
        v = queue & 16383;
        queue >>= 14;
        nbits -= 14;
      }
      out += B91[v % 91] + B91[Math.floor(v / 91)];
    }
  }
  if (nbits) {
    out += B91[queue % 91];
    if (nbits > 7 || queue > 90) out += B91[Math.floor(queue / 91)];
  }
  return out;
}

function b91decode(str) {
  const t = String(str).replace(/\s+/g, "");
  if (!t) return null;
  const val = {};
  for (let i = 0; i < B91.length; i++) val[B91[i]] = i;
  for (const c of t) if (!(c in val)) return null;
  const bytes = [];
  let v = -1;
  let queue = 0;
  let nbits = 0;
  for (const c of t) {
    const d = val[c];
    if (v < 0) {
      v = d;
      continue;
    }
    v += d * 91;
    queue |= v << nbits;
    nbits += (v & 8191) > 88 ? 13 : 14;
    while (nbits > 7) {
      bytes.push(queue & 255);
      queue >>= 8;
      nbits -= 8;
    }
    v = -1;
  }
  if (v >= 0) bytes.push((queue | (v << nbits)) & 255);
  return Buffer.from(bytes).toString("utf8");
}

function b100encode(str) {
  const buf = Buffer.from(String(str), "utf8");
  let out = "";
  for (const b of buf) out += String.fromCodePoint(0x1f3f7 + b);
  return out;
}

function b100decode(str) {
  const bytes = [];
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x1f3f7 || cp > 0x1f4f6) {
      if (/\s/.test(ch)) continue;
      return null;
    }
    bytes.push(cp - 0x1f3f7);
  }
  if (!bytes.length) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(bytes));
  } catch {
    return null;
  }
}

const UU0 = "`";

function uuChar(v) {
  return v === 0 ? UU0 : String.fromCharCode(v + 32);
}

function uuVal(c) {
  if (c === UU0 || c === " ") return 0;
  const v = c.charCodeAt(0) - 32;
  return v >= 1 && v <= 63 ? v : -1;
}

function uuencode(buf) {
  const lines = [];
  for (let i = 0; i < buf.length; i += 45) {
    const chunk = buf.slice(i, i + 45);
    let line = uuChar(chunk.length);
    for (let j = 0; j < chunk.length; j += 3) {
      const b0 = chunk[j];
      const b1 = j + 1 < chunk.length ? chunk[j + 1] : 0;
      const b2 = j + 2 < chunk.length ? chunk[j + 2] : 0;
      const n = (b0 << 16) | (b1 << 8) | b2;
      line += uuChar((n >>> 18) & 63) + uuChar((n >>> 12) & 63) + uuChar((n >>> 6) & 63) + uuChar(n & 63);
    }
    lines.push(line);
  }
  return lines.join("\n") || UU0;
}

function uudecode(str) {
  const bytes = [];
  let any = false;
  for (const raw of String(str).split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line || /^begin\s/i.test(line) || line === "end" || line === UU0) continue;
    const n = uuVal(line[0]);
    if (n < 0) return null;
    any = true;
    const data = line.slice(1, Math.ceil(n / 3) * 4 + 1);
    if (data.length % 4 !== 0) return null;
    const before = bytes.length;
    for (let i = 0; i < data.length; i += 4) {
      const v = [uuVal(data[i]), uuVal(data[i + 1]), uuVal(data[i + 2]), uuVal(data[i + 3])];
      if (v.some((x) => x < 0)) return null;
      const trip = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
      bytes.push((trip >>> 16) & 255, (trip >>> 8) & 255, trip & 255);
    }
    bytes.length = before + n;
  }
  if (!any) return null;
  return Buffer.from(bytes).toString("utf8");
}

const XX = "+-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function xxChar(v) {
  return XX[v];
}

function xxVal(c) {
  const i = XX.indexOf(c);
  return i < 0 ? -1 : i;
}

function xxencode(buf) {
  const lines = [];
  for (let i = 0; i < buf.length; i += 45) {
    const chunk = buf.slice(i, i + 45);
    let line = xxChar(chunk.length);
    for (let j = 0; j < chunk.length; j += 3) {
      const b0 = chunk[j];
      const b1 = j + 1 < chunk.length ? chunk[j + 1] : 0;
      const b2 = j + 2 < chunk.length ? chunk[j + 2] : 0;
      const n = (b0 << 16) | (b1 << 8) | b2;
      line += xxChar((n >>> 18) & 63) + xxChar((n >>> 12) & 63) + xxChar((n >>> 6) & 63) + xxChar(n & 63);
    }
    lines.push(line);
  }
  return lines.join("\n") || "+";
}

function xxdecode(str) {
  const bytes = [];
  let any = false;
  for (const raw of String(str).split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line || /^begin\s/i.test(line) || line === "end" || line === "+") continue;
    const n = xxVal(line[0]);
    if (n < 0) return null;
    any = true;
    const data = line.slice(1, Math.ceil(n / 3) * 4 + 1);
    if (data.length % 4 !== 0) return null;
    const before = bytes.length;
    for (let i = 0; i < data.length; i += 4) {
      const v = [xxVal(data[i]), xxVal(data[i + 1]), xxVal(data[i + 2]), xxVal(data[i + 3])];
      if (v.some((x) => x < 0)) return null;
      const trip = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
      bytes.push((trip >>> 16) & 255, (trip >>> 8) & 255, trip & 255);
    }
    bytes.length = before + n;
  }
  if (!any) return null;
  return Buffer.from(bytes).toString("utf8");
}

function qpEncode(str) {
  const lines = String(str).split("\n");
  const out = [];
  for (const raw of lines) {
    const buf = Buffer.from(raw, "utf8");
    const toks = [];
    for (let i = 0; i < buf.length; i++) {
      const b = buf[i];
      const last = i === buf.length - 1;
      if (b === 61) toks.push("=3D");
      else if (b >= 33 && b <= 126) toks.push(String.fromCharCode(b));
      else if ((b === 9 || b === 32) && !last) toks.push(String.fromCharCode(b));
      else toks.push("=" + b.toString(16).toUpperCase().padStart(2, "0"));
    }
    let line = "";
    for (const tk of toks) {
      if (line.length + tk.length > 76) {
        out.push(line + "=");
        line = "";
      }
      line += tk;
    }
    out.push(line);
  }
  return out.join("\r\n");
}

function qpDecode(str) {
  const t = String(str).replace(/=\r\n/g, "").replace(/=\n/g, "");
  if (!/=/.test(t)) return String(str).replace(/\r\n/g, "\n");
  try {
    const bytes = [];
    for (let i = 0; i < t.length; i++) {
      if (t[i] === "=") {
        const h = t.slice(i + 1, i + 3);
        if (!/^[0-9A-Fa-f]{2}$/.test(h)) return null;
        bytes.push(parseInt(h, 16));
        i += 2;
      } else if (t[i] === "\r" || t[i] === "\n") {
        continue;
      } else bytes.push(t.charCodeAt(i));
    }
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return null;
  }
}

module.exports = bases;

async function bases(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();

  const codec = async (name, enc, dec) => {
    const [mode, ...rest] = arg(p + name + " ").split(/\s+/);
    const text = rest.join(" ");
    if (mode === "encode") {
      await message.channel.send(cut(enc(text)));
      return true;
    }
    if (mode === "decode") {
      const out = dec(text);
      await message.channel.send(out === null ? "Could not decode as " + name + "." : cut(out));
      return true;
    }
    await message.channel.send("Usage: `ts " + name + " encode|decode <text>`");
    return true;
  };

  if (lower.startsWith(p + "b58 ")) return codec("b58", (t) => b58encode(Buffer.from(t, "utf8")), b58decode);
  if (lower.startsWith(p + "b62 ")) return codec("b62", (t) => b62encode(Buffer.from(t, "utf8")), b62decode);
  if (lower.startsWith(p + "a85 ")) return codec("a85", (t) => a85encode(Buffer.from(t, "utf8")), a85decode);
  if (lower.startsWith(p + "b91 ")) return codec("b91", (t) => b91encode(Buffer.from(t, "utf8")), b91decode);
  if (lower.startsWith(p + "b100 ")) return codec("b100", b100encode, b100decode);
  if (lower.startsWith(p + "uu ")) return codec("uu", (t) => uuencode(Buffer.from(t, "utf8")), uudecode);
  if (lower.startsWith(p + "xx ")) return codec("xx", (t) => xxencode(Buffer.from(t, "utf8")), xxdecode);
  if (lower.startsWith(p + "qp ")) return codec("qp", qpEncode, qpDecode);
  return false;
};

bases.b58decode = b58decode;
bases.b62decode = b62decode;
bases.a85decode = a85decode;
bases.b91decode = b91decode;
bases.b100decode = b100decode;
bases.uudecode = uudecode;
bases.qpDecode = qpDecode;
