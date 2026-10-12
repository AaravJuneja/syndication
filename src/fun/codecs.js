const config = require("../config");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { EmbedBuilder } = require("discord.js");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

function caesar(s, n) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + n) % 26 + 26) % 26 + base);
  });
}

function atbash(s) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
  });
}

function rot47(s) {
  return s.replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)));
}

function vig(s, key, decode) {
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  if (!k) return null;
  let ki = 0;
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    const shift = k.charCodeAt(ki++ % k.length) - 97;
    const d = decode ? c.charCodeAt(0) - base - shift : c.charCodeAt(0) - base + shift;
    return String.fromCharCode(((d % 26 + 26) % 26) + base);
  });
}

function railDecode(s, rails) {
  const n = s.length;
  if (rails < 2 || n < 2) return s;
  const period = 2 * rails - 2;
  const pat = [];
  for (let i = 0; i < n; i++) {
    const m = i % period;
    pat.push(m < rails ? m : period - m);
  }
  const out = new Array(n);
  let k = 0;
  for (let r = 0; r < rails; r++) {
    for (let i = 0; i < n; i++) {
      if (pat[i] === r) out[i] = s[k++];
    }
  }
  return out.join("");
}

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function b32encode(s) {
  let bits = "";
  for (const b of Buffer.from(s, "utf8")) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  while (out.length % 8 !== 0) out += "=";
  return out;
}

function b32decode(s) {
  const t = s.trim().replace(/=+$/, "").toUpperCase();
  if (!t || !/^[A-Z2-7]+$/.test(t)) return null;
  let bits = "";
  for (const c of t) bits += B32.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  try {
    return Buffer.from(bytes).toString("utf8");
  } catch {
    return null;
  }
}

const HTML_NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function htmlDecode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(n);
      } catch {
        return m;
      }
    }
    return HTML_NAMED[e] !== undefined ? HTML_NAMED[e] : m;
  });
}

function htmlEncode(s) {
  return s.replace(/[&<>"']/g, (c) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[c];
  });
}

function uniDecode(s) {
  const out = s
    .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  return out === s && !/\\(u|x)/.test(s) ? out : out;
}

function uniEncode(s) {
  return [...s].map((c) => "\\u" + c.codePointAt(0).toString(16).padStart(4, "0")).join("");
}

function tryB64(s) {
  const t = s.trim();
  if (!/^[A-Za-z0-9+/=_-]+$/.test(t) || t.length % 4 !== 0) return null;
  try {
    const norm = t.replace(/-/g, "+").replace(/_/g, "/");
    const out = Buffer.from(norm, "base64").toString("utf8");
    if (!out || /�/.test(out)) return null;
    return out;
  } catch {
    return null;
  }
}

function tryHex(s) {
  const t = s.replace(/\s+/g, "");
  if (!t || !/^[0-9a-fA-F]+$/.test(t) || t.length % 2 !== 0) return null;
  try {
    return Buffer.from(t, "hex").toString("utf8");
  } catch {
    return null;
  }
}

function tryBin(s) {
  const t = s.trim();
  if (!t || !/^[01\s]+$/.test(t)) return null;
  const bits = t.replace(/\s+/g, "");
  if (bits.length % 8 !== 0) return null;
  let out = "";
  for (let i = 0; i < bits.length; i += 8) {
    out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
  }
  return out;
}

function englishScore(s) {
  const m = s.toLowerCase().match(/[a-z ]/g);
  if (!m) return 0;
  const common = "etaoinshrdlu ";
  let hits = 0;
  for (const c of m) if (common.includes(c)) hits++;
  return hits / s.length;
}

function xorBrute(hexStr) {
  const t = hexStr.replace(/\s+/g, "");
  if (!t || !/^[0-9a-fA-F]+$/.test(t)) return null;
  const buf = Buffer.from(t, "hex");
  const scored = [];
  for (let k = 0; k < 256; k++) {
    let s = "";
    for (const b of buf) s += String.fromCharCode(b ^ k);
    scored.push({ k, s, score: englishScore(s) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3);
}

const { morseEncode, morseDecode } = require("./morse");

function freq(s) {
  const counts = {};
  let total = 0;
  for (const c of s.toUpperCase()) {
    if (c >= "A" && c <= "Z") {
      counts[c] = (counts[c] || 0) + 1;
      total++;
    }
  }
  if (!total) return null;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([c, n]) => c + ": " + n + " (" + ((100 * n) / total).toFixed(1) + "%)")
    .join("\n");
}

function ic(s) {
  const counts = {};
  let total = 0;
  for (const c of s.toUpperCase()) {
    if (c >= "A" && c <= "Z") {
      counts[c] = (counts[c] || 0) + 1;
      total++;
    }
  }
  if (total < 2) return null;
  let sum = 0;
  for (const c in counts) sum += counts[c] * (counts[c] - 1);
  return (sum / (total * (total - 1))).toFixed(4);
}

function hashId(h) {
  const t = h.trim();
  const out = [];
  if (/^\$2[aby]\$\d+\$.{53}$/.test(t)) out.push("bcrypt");
  if (/^\$6\$[^$]+\$.+/.test(t)) out.push("sha512crypt");
  if (/^\$1\$[^$]+\$.+/.test(t)) out.push("md5crypt");
  if (/^\$argon2(id|i|d)\$.+/.test(t)) out.push("argon2");
  if (/^\*[0-9A-F]{40}$/i.test(t)) out.push("MySQL5");
  if (/^[0-9a-f]{16}$/i.test(t)) out.push("MySQL323 / LM / DES crypt");
  if (/^[0-9a-f]{32}$/i.test(t)) out.push("MD5 / NTLM / MD4 / LM");
  if (/^[0-9a-f]{40}$/i.test(t)) out.push("SHA1");
  if (/^[0-9a-f]{56}$/i.test(t)) out.push("SHA224");
  if (/^[0-9a-f]{64}$/i.test(t)) out.push("SHA256");
  if (/^[0-9a-f]{96}$/i.test(t)) out.push("SHA384");
  if (/^[0-9a-f]{128}$/i.test(t)) out.push("SHA512");
  if (/^[A-Za-z0-9+/]{43}=$/.test(t)) out.push("SHA256 as base64");
  if (/^[A-Za-z0-9+/]{86}==$/.test(t)) out.push("SHA512 as base64");
  return out;
}

function jwtDecode(tok) {
  const parts = tok.trim().split(".");
  if (parts.length < 2) return null;
  try {
    const b64u = (pt) => Buffer.from(pt.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const header = JSON.parse(b64u(parts[0]));
    const payload = JSON.parse(b64u(parts[1]));
    return "header: " + JSON.stringify(header) + "\npayload: " + JSON.stringify(payload);
  } catch {
    return null;
  }
}

const EN_FREQ = {
  a: 8.2, b: 1.5, c: 2.8, d: 4.3, e: 13.0, f: 2.2, g: 2.0, h: 6.1, i: 7.0,
  j: 0.15, k: 0.77, l: 4.0, m: 2.4, n: 6.7, o: 7.5, p: 1.9, q: 0.095, r: 6.0,
  s: 6.3, t: 9.1, u: 2.8, v: 0.98, w: 2.4, x: 0.15, y: 2.0, z: 0.074,
};

function chi2(s) {
  const counts = {};
  let total = 0;
  for (const c of s.toLowerCase()) {
    if (c >= "a" && c <= "z") {
      counts[c] = (counts[c] || 0) + 1;
      total++;
    }
  }
  if (total < 12) return Infinity;
  let chi = 0;
  for (const c in EN_FREQ) {
    const exp = (total * EN_FREQ[c]) / 100;
    const obs = counts[c] || 0;
    chi += ((obs - exp) * (obs - exp)) / exp;
  }
  return chi;
}

function printable(s) {
  return s.length > 0 && s.length < 600 && !/�/.test(s) && /^[\x20-\x7e\s]*$/.test(s);
}

function run(bin, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: timeoutMs || 15000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve({ err, out: String(stdout || "").trim() });
    });
  });
}

async function fetchBytes(url, maxBytes) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "syndication-bot" },
  });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) return null;
  return buf;
}

async function forensics(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts forensics <image/audio url>`");
    return;
  }
  const buf = await fetchBytes(url, 12 * 1024 * 1024).catch(() => null);
  if (!buf) {
    await message.channel.send("Download failed (or over 12MB).");
    return;
  }
  const tmp = path.join(os.tmpdir(), "syn-" + Date.now() + ".bin");
  const lines = ["size: " + buf.length + " bytes"];
  try {
    fs.writeFileSync(tmp, buf);
    const f = await run("file", ["-b", tmp]);
    if (!f.err && f.out) lines.push("file: " + f.out.split("\n")[0]);
    const ex = await run("exiftool", [tmp]);
    if (!ex.err && ex.out) {
      const tags = ex.out.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 12);
      if (tags.length) lines.push("exif:\n" + tags.join("\n"));
    }
    const sh = await run("steghide", ["info", tmp, "-p", ""]);
    if (!sh.err) {
      lines.push(
        "steghide: " + (/capacity|embedded data/i.test(sh.out) ? "possible embedded data (empty passphrase works)" : "nothing with empty passphrase")
      );
    }
    const strs = buf.toString("latin1").match(/[ -~]{5,}/g) || [];
    const interesting = strs.filter((s) => /flag|ctf\{|http|passw|secret|key|admin/i.test(s)).slice(0, 8);
    lines.push("strings: " + strs.length + " runs");
    for (const s of interesting) lines.push("> " + s.slice(0, 120));
    await message.channel.send(cut(lines.join("\n")));
  } catch {
    await message.channel.send("Forensics failed.");
  }
  try {
    fs.unlinkSync(tmp);
  } catch {}
}

async function qr(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts qr <image url>`");
    return;
  }
  const buf = await fetchBytes(url, 12 * 1024 * 1024).catch(() => null);
  if (!buf) {
    await message.channel.send("Download failed (or over 12MB).");
    return;
  }
  const tmp = path.join(os.tmpdir(), "syn-" + Date.now() + ".png");
  let decoded = "";
  try {
    fs.writeFileSync(tmp, buf);
    const z = await run("zbarimg", ["--raw", "-q", tmp]);
    if (!z.err && z.out) decoded = z.out;
    if (!decoded) {
      const py = await run("python3", [
        "-c",
        "import sys,cv2\nimg=cv2.imread(sys.argv[1])\nprint(cv2.QRCodeDetector().detectAndDecode(img)[0])",
        tmp,
      ]);
      if (!py.err && py.out && py.out !== "None") decoded = py.out;
    }
    await message.channel.send(decoded ? cut(decoded) : "No QR code found.");
  } catch {
    await message.channel.send("QR scan failed.");
  }
  try {
    fs.unlinkSync(tmp);
  } catch {}
}

async function crack(message, h) {
  const labels = hashId(h);
  const has = (s) => labels.some((l) => l.includes(s));
  const want = has("SHA256") ? "sha256" : has("SHA512") || has("SHA384") || has("SHA224") ? null : has("SHA1") ? "sha1" : has("MD5") ? "md5" : null;
  if (!want) {
    await message.channel.send("Only MD5 / SHA1 / SHA256 supported. Check with `ts hashid` first.");
    return;
  }
  if (!fs.existsSync(config.wordlist)) {
    await message.channel.send("Wordlist not found at `" + config.wordlist + "`. Set WORDLIST.");
    return;
  }
  await message.channel.send("Cracking " + want + ", runs until found or the list ends…");
  const target = h.trim().toLowerCase();
  let tried = 0;
  const cap = 5000000;
  try {
    const rl = readline.createInterface({ input: fs.createReadStream(config.wordlist), crlfDelay: Infinity });
    for await (const line of rl) {
      tried++;
      if (crypto.createHash(want).update(line.replace(/\r$/, ""), "utf8").digest("hex") === target) {
        await message.channel.send("Cracked: `" + line.replace(/\r$/, "") + "` (" + tried + " tries)");
        rl.close();
        return;
      }
      if (tried >= cap) break;
    }
  } catch {}
  await message.channel.send("Not found in first " + tried + " entries.");
}

async function auto(message, text, crib) {
  const t = (text || "").slice(0, 500);
  if (!t) {
    await message.channel.send("Usage: `ts auto <ciphertext> [crib=...]`");
    return;
  }
  const seen = new Set([t]);
  const cands = [];
  const push = (label, out) => {
    if (out && out !== t && !seen.has(out) && printable(out)) {
      seen.add(out);
      cands.push({ label, out, chi: chi2(out) });
    }
  };
  push("base64", tryB64(t));
  push("hex", tryHex(t));
  push("ascii85", require("./bases").a85decode(t));
  if (/=[0-9A-Fa-f]{2}/.test(t)) push("quoted-printable", require("./bases").qpDecode(t));
  if (/[\u{1F3F7}-\u{1F4F6}]/u.test(t)) push("base100", require("./bases").b100decode(t));
  if (/^begin\s|\n[A-M`#]/m.test(t) || /^[A-M`#][ -`]{7,}/.test(t)) push("uu", require("./bases").uudecode(t));
  push("base32", b32decode(t));
  push("binary", tryBin(t));
  try {
    const u = decodeURIComponent(t);
    if (u !== t) push("url", u);
  } catch {}
  const hd = htmlDecode(t);
  if (hd !== t) push("html", hd);
  const ud = uniDecode(t);
  if (ud !== t) push("unicode", ud);
  push("rot13", caesar(t, 13));
  let bestN = 0;
  let bestS = Infinity;
  for (let n = 1; n < 26; n++) {
    const s = chi2(caesar(t, n));
    if (s < bestS) {
      bestS = s;
      bestN = n;
    }
  }
  if (bestS < 300) push("caesar-" + bestN, caesar(t, bestN));
  push("atbash", atbash(t));
  push("reverse", [...t].reverse().join(""));
  for (let r = 2; r <= 6; r++) push("rail-" + r, railDecode(t, r));
  const xb = xorBrute(t);
  if (xb && printable(xb[0].s)) push("xor-" + xb[0].k, xb[0].s);
  if (!cands.length) {
    await message.channel.send("Nothing readable. Try `ts freq`, `ts ic`, or `ts vig`.");
    return;
  }
  cands.sort((a, b) => (isFinite(a.chi) ? a.chi : 1e18) - (isFinite(b.chi) ? b.chi : 1e18));
  let shown = cands;
  if (crib) {
    try {
      const re = new RegExp(crib, "i");
      const hits = cands.filter((c) => re.test(c.out));
      if (hits.length) shown = hits;
    } catch {}
  }
  await message.channel.send(
    cut(shown.slice(0, 8).map((c) => "[" + c.label + (isFinite(c.chi) ? " x2=" + c.chi.toFixed(1) : "") + "] " + c.out.slice(0, 220)).join("\n"))
  );
}

const WHAT_RULES = [
  ["email address", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 1],
  ["IPv4 address", /^(?:\d{1,3}\.){3}\d{1,3}$/, 2],
  ["IPv6 address", /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i, 2],
  ["URL", /^https?:\/\/[^\s/$.?#].[^\s]*$/i, 1],
  ["onion v3 address", /^[a-z2-7]{56}$/, 1],
  ["Bitcoin address", /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,62}$/, 1],
  ["Ethereum address", /^0x[a-fA-F0-9]{40}$/, 1],
  ["AWS access key", /^AKIA[0-9A-Z]{16}$/, 1],
  ["AWS secret key", /^[A-Za-z0-9/+=]{40}$/, 4],
  ["GitHub token (classic)", /^ghp_[A-Za-z0-9]{36}$/, 1],
  ["GitHub fine-grained token", /^github_pat_[A-Za-z0-9_]{82}$/, 1],
  ["Slack token", /^xox[bpas]-[A-Za-z0-9-]{10,48}$/, 1],
  ["Stripe key", /^(sk|pk)_(live|test)_[A-Za-z0-9]{16,}$/, 1],
  ["Google API key", /^AIza[0-9A-Za-z_-]{35}$/, 1],
  ["JWT", /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/, 2],
  ["UUID/GUID", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 1],
  ["MD5 hash", /^[0-9a-f]{32}$/i, 3],
  ["SHA1 hash", /^[0-9a-f]{40}$/i, 3],
  ["SHA256 hash", /^[0-9a-f]{64}$/i, 3],
  ["SHA512 hash", /^[0-9a-f]{128}$/i, 3],
  ["bcrypt hash", /^\$2[aby]\$\d+\$.{53}$/, 1],
  ["Unix timestamp (s)", /^\d{10}$/, 4],
  ["Unix timestamp (ms)", /^\d{13}$/, 4],
  ["credit card number", /^(?:\d[ -]*?){13,19}$/, 4],
  ["US phone number", /^\+?1[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/, 3],
  ["MAC address", /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 1],
  ["ISBN-13", /^(978|979)\d{10}$/, 3],
  ["base64 blob", /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, 4],
  ["hex blob", /^(?:[0-9a-f]{2}){8,}$/i, 4],
  ["binary string", /^[01\s]{16,}$/, 4],
  ["morse code", /^[.\-/\s]{8,}$/, 4],
  ["cron expression", /^(\S+\s+){4,5}\S+$/, 5],
  ["Docker image ref", /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?::[a-zA-Z0-9_.-]+)?(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/, 5],
  ["SemVer", /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/, 4],
  ["ULID", /^[0-9A-HJKMNP-TV-Z]{26}$/, 3],
  ["Discord token (old fmt)", /^[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27}$/, 1],
  ["IMEI", /^\d{15}$/, 4],
  ["IBAN", /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, 3],
  ["SSN-like (US)", /^\d{3}-\d{2}-\d{4}$/, 4],
  ["latitude,longitude", /^-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+$/, 2],
  ["HTML entity soup", /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/, 4],
  ["unicode escapes", /\\u[0-9a-fA-F]{4}/, 4],
  ["private key PEM", /-----BEGIN (RSA )?PRIVATE KEY-----/, 1],
  ["PGP message", /-----BEGIN PGP MESSAGE-----/, 1],
  ["SSH public key", /^ssh-(rsa|ed25519|ecdsa)[-a-z0-9]*\s+[A-Za-z0-9+/=]+(\s+\S+)?$/, 1],
  ["ADFGVX cipher", /^[ADFGVX\s]{8,}$/, 4],
  ["ADFGX cipher", /^[ADFGX\s]{8,}$/, 4],
  ["base100 emoji", /[\u{1F3F7}-\u{1F4F6}]/u, 4],
  ["quoted-printable", /=[0-9A-Fa-f]{2}/, 4],
  ["uuencoded body", /^begin\s+\d{3}\s+\S+/m, 4],
  ["ascii85 block", /^<~[!-uz\s]+~>$/, 4],
  ["pigpen glyphs", /[┘┴└├□┤┌┬┐∨∧><·]/, 4],
  ["whitespace code", /^[STLstl \t\n]{16,}$/, 5],
];

function whatIs(text) {
  const t = (text || "").trim();
  if (!t) return [];
  return WHAT_RULES.filter((r) => r[1] instanceof RegExp && r[1].test(t))
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map((r) => String(r[0]));
}

async function doctor(message) {
  const lines = [];
  const bin = (name, args) =>
    new Promise((resolve) => {
      execFile(name, args || ["--version"], { timeout: 8000 }, (err, stdout) => {
        resolve(err ? null : String(stdout || "").split("\n")[0].slice(0, 80));
      });
    });
  lines.push("runtime: " + (typeof Bun !== "undefined" ? "bun " + Bun.version : process.version));
  try {
    const ping = message.client.ws.ping;
    lines.push("discord ping: " + (ping >= 0 ? ping + "ms" : "n/a"));
  } catch {}
  try {
    const { db } = require("../db");
    await db.execute("SELECT 1");
    lines.push("turso: ok");
  } catch {
    lines.push("turso: UNREACHABLE");
  }
  const config = require("../config");
  try {
    const st = fs.statSync(config.wordlist);
    lines.push("wordlist: " + (st.size / 1048576).toFixed(0) + "MB");
  } catch {
    lines.push("wordlist: missing (" + config.wordlist + ")");
  }
  try {
    fs.accessSync(config.dict, fs.constants.R_OK);
    lines.push("dict: ok");
  } catch {
    lines.push("dict: missing");
  }
  for (const [label, prog, args] of [
    ["ffmpeg", "ffmpeg", ["-version"]],
    ["python3", "python3", ["--version"]],
    ["exiftool", "exiftool", ["-ver"]],
    ["steghide", "steghide", ["--version"]],
    ["zbarimg", "zbarimg", ["--version"]],
    ["convert", "convert", ["--version"]],
    ["file", "file", ["--version"]],
  ]) {
    const v = await bin(prog, args);
    lines.push(label + ": " + (v || "missing"));
  }
  const cv = await bin("python3", ["-c", "import cv2; print(cv2.__version__)"]);
  lines.push("cv2: " + (cv || "missing"));
  const np = await bin("python3", ["-c", "import numpy, matplotlib; print('ok')"]);
  lines.push("numpy+matplotlib: " + (np || "missing"));
  await message.channel.send(cut(lines.join("\n")));
}

const HELP_TOPICS = {
  codecs: ["codec", "encode", "decode", "b64", "hex", "url", "morse"],
  shifts: ["shift", "caesar", "rot", "atbash"],
  keyed: ["crypto", "cipher", "vig", "rail", "affine", "bacon", "ook"],
  squares: ["playfair", "bifid", "trifid", "four", "twosquare"],
  transpose: ["columnar", "scytale", "route", "adfgvx", "adfgx", "gronsfeld", "autokey", "beaufort", "porta"],
  polyalpha: ["gronsfeld", "autokey", "beaufort", "porta"],
  bases: ["base58", "base62", "ascii85", "base91", "base100", "uuencode", "quoted"],
  esolangs: ["deadfish", "cow", "whitespace"],
  grids: ["polybius", "pigpen", "keyboard", "rc4", "hill", "deadfish", "cow", "whitespace"],
  xor: ["xor"],
  identify: ["identify", "detect", "freq", "hash", "jwt", "auto", "what", "decon"],
  crackers: ["crack", "sub", "password", "rockyou"],
  rsa: ["rsa", "factor", "wiener", "prime"],
  files: ["file", "web", "steg", "image", "png", "carve"],
  audio: ["audio", "sound", "dtmf", "morse", "spectro"],
  osint: ["osint", "user", "github", "weather", "ip", "backlink", "username"],
  agent: ["agent", "ask", "analyze", "attachment"],
  doctor: ["doctor", "host", "status"],
  links: ["link", "short", "url"],
  memes: ["meme", "fun", "baller", "trigger", "hee"],
};

const HELP_FIELDS = [
  ["Codecs", "`b64` `hex` `url` `bin` `morse` `b32` `html` `uni` — `ts <codec> encode|decode <text>`"],
  ["Shifts", "`rot [n]` `rot47` `caesar` (all 25) `atbash` `rev` `upper` `lower` `len`"],
  ["Keyed ciphers", "`vig encode|decode <key>` `rail` (all rails) `affine` `bacon` `a1z26` `ook`"],
  ["Squares", "`playfair` `bifid [n=]` `trifid [n=]` `foursquare` `twosquare [vert]` — `encode|decode [k=KEY]`"],
  ["Transposition", "`columnar k=KEY [pad]` `scytale n=` `route w=` `adfgvx|adfgx [sq=] [k=] [pad]`"],
  ["Poly ciphers", "`gronsfeld k=digits` `autokey k=` `beaufort k= [german]` `porta k=` — `encode|decode`"],
  ["Base codes", "`b58` `b62` `a85` `b91` `b100` `uu` `xx` `qp` — `encode|decode`"],
  ["Grids & misc", "`polybius [k=] [colrow]` `pigpen` `kb right|left|up|down` `rc4 k= [drop=]` `hill k=a,b,c,d`"],
  ["Esolangs", "`deadfish run|encode` `cow run [in=]` `ws encode|decode`"],
  ["XOR lab", "`xor <hex> <key>` `xorbrute` `xorcrack [crib=]` `xordrag <hex> <crib>` `dec` `enc`"],
  ["Identify", "`freq` `ic` `hashid` `jwt` `decon` `auto [crib=]` `what` — name that blob"],
  ["Crackers", "`sub` `vigcrack` `hash` `crack` (rockyou) — ranked guesses, you pick"],
  ["RSA kit", "`factor` `rsa <n> <e> <c>` `wiener` `hastad <c:n>…` `fermat` `factordb` `saml`"],
  ["Files & web", "`get` `forensics` `qr` `png` `lsb` `carve` `negate` `flop` `solar` `web` — pass a URL"],
  ["Audio", "`dtmf` `amorse` `spectro` — pass an audio URL"],
  ["OSINT", "`ghuser` `ghemail` `ghemails` `ghkeys` `weather` `ip` `user` `userscan` `backlink`"],
  ["Agent", "`agent <prompt>` + attach a file (or paste URL) — opencode session on it, 10m cap"],
  ["Doctor", "`doctor` — host capability report (binaries, db, latency)"],
  ["Links", "`link add|remove|edit|show` — short URLs on your domain"],
  ["Memes", "just say `hee hee`, `bhakas alert`, `invalid opinion`, `popcorn` — or teach some: `baller add \"x\" \"y\"`"],
];

const HELP_KEYS = ["codecs", "shifts", "keyed", "squares", "transpose", "polyalpha", "bases", "grids", "esolangs", "xor", "identify", "crackers", "rsa", "files", "audio", "osint", "agent", "doctor", "links", "memes"];

module.exports = async function codecs(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();

  const arg = (cmd) => content.slice(cmd.length).trim();

  const codec = async (name, encodeFn, decodeFn) => {
    const [mode, ...rest] = arg(p + name + " ").split(/\s+/);
    const text = rest.join(" ");
    if (mode === "encode") {
      await message.channel.send(cut(encodeFn(text)));
      return true;
    }
    if (mode === "decode") {
      const out = decodeFn(text);
      await message.channel.send(out === null ? "Could not decode as " + name + "." : cut(out));
      return true;
    }
    await message.channel.send("Usage: `ts " + name + " encode|decode <text>`");
    return true;
  };

  for (const name of ["b64", "hex", "url", "bin", "morse", "b32", "html", "uni"]) {
    if (lower.startsWith(p + name + " ")) {
      if (name === "b64") return codec(name, (t) => Buffer.from(t, "utf8").toString("base64"), tryB64);
      if (name === "hex") return codec(name, (t) => Buffer.from(t, "utf8").toString("hex"), tryHex);
      if (name === "url") {
        return codec(name, encodeURIComponent, (t) => {
          try {
            return decodeURIComponent(t);
          } catch {
            return null;
          }
        });
      }
      if (name === "bin") {
        return codec(
          name,
          (t) => [...t].map((c) => c.charCodeAt(0).toString(2).padStart(8, "0")).join(" "),
          tryBin
        );
      }
      if (name === "morse") return codec(name, morseEncode, morseDecode);
      if (name === "b32") return codec(name, b32encode, b32decode);
      if (name === "html") return codec(name, htmlEncode, htmlDecode);
      if (name === "uni") return codec(name, uniEncode, uniDecode);
    }
  }
  if (lower.startsWith(p + "rot ")) {
    const parts = arg(p + "rot ").split(/\s+/);
    let n = 13;
    if (/^-?\d+$/.test(parts[0] || "")) n = parseInt(parts.shift());
    await message.channel.send(cut(caesar(parts.join(" "), n)));
    return true;
  }
  if (lower.startsWith(p + "rot47 ")) {
    await message.channel.send(cut(rot47(arg(p + "rot47 "))));
    return true;
  }
  if (lower.startsWith(p + "caesar ")) {
    const text = arg(p + "caesar ").slice(0, 120);
    const lines = [];
    for (let n = 1; n < 26; n++) lines.push(n + ": " + caesar(text, n));
    await message.channel.send(cut(lines.join("\n")));
    return true;
  }
  if (lower.startsWith(p + "atbash ")) {
    await message.channel.send(cut(atbash(arg(p + "atbash "))));
    return true;
  }
  if (lower.startsWith(p + "vig ")) {
    const parts = arg(p + "vig ").split(/\s+/);
    const mode = parts.shift();
    const key = parts.shift() || "";
    const out = (mode === "encode" || mode === "decode") ? vig(parts.join(" "), key, mode === "decode") : null;
    await message.channel.send(out === null ? "Usage: `ts vig encode|decode <key> <text>`" : cut(out));
    return true;
  }
  if (lower.startsWith(p + "rail ")) {
    const text = arg(p + "rail ").slice(0, 200);
    const lines = [];
    for (let r = 2; r <= Math.min(8, text.length - 1); r++) lines.push(r + ": " + railDecode(text, r));
    await message.channel.send(cut(lines.length ? lines.join("\n") : "Too short to rail."));
    return true;
  }
  if (lower.startsWith(p + "xor ")) {
    const [hexStr, ...keyParts] = arg(p + "xor ").split(/\s+/);
    const key = keyParts.join(" ");
    let out = null;
    try {
      const buf = Buffer.from((hexStr || "").replace(/\s+/g, ""), "hex");
      if (/^\d+$/.test(key)) {
        out = [...buf].map((b) => String.fromCharCode(b ^ (parseInt(key) & 0xff))).join("");
      } else if (key) {
        out = [...buf].map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
      }
    } catch {}
    await message.channel.send(out === null ? "Usage: `ts xor <hex> <key or byte>`" : cut(out));
    return true;
  }
  if (lower.startsWith(p + "xorbrute ")) {
    const top = xorBrute(arg(p + "xorbrute "));
    if (!top) {
      await message.channel.send("Usage: `ts xorbrute <hex>`");
      return true;
    }
    await message.channel.send(cut(top.map((t) => "key " + t.k + " (" + t.k.toString(16) + "): " + t.s.slice(0, 200)).join("\n")));
    return true;
  }
  if (lower.startsWith(p + "rev ")) {
    await message.channel.send(cut([...arg(p + "rev ")].reverse().join("")));
    return true;
  }
  if (lower.startsWith(p + "dec ")) {
    const nums = arg(p + "dec ").split(/[\s,]+/).filter(Boolean);
    try {
      await message.channel.send(cut(String.fromCodePoint(...nums.map((x) => Number(x)))));
    } catch {
      await message.channel.send("Usage: `ts dec 72 105`");
    }
    return true;
  }
  if (lower.startsWith(p + "enc ")) {
    const text = arg(p + "enc ");
    await message.channel.send(cut([...text].map((c) => c.codePointAt(0)).join(" ")));
    return true;
  }
  if (lower.startsWith(p + "freq ")) {
    const out = freq(arg(p + "freq "));
    await message.channel.send(out === null ? "No letters found." : cut(out));
    return true;
  }
  if (lower.startsWith(p + "ic ")) {
    const out = ic(arg(p + "ic "));
    await message.channel.send(out === null ? "Need at least 2 letters." : "Index of coincidence: " + out + " (~0.066 English, ~0.038 random)");
    return true;
  }
  if (lower.startsWith(p + "hashid ")) {
    const found = hashId(arg(p + "hashid "));
    await message.channel.send(found.length ? found.join(" / ") : "Unknown hash format.");
    return true;
  }
  if (lower.startsWith(p + "jwt ")) {
    const out = jwtDecode(arg(p + "jwt "));
    await message.channel.send(out === null ? "Not a decodable JWT." : cut(out));
    return true;
  }
  if (lower.startsWith(p + "decon ")) {
    const text = arg(p + "decon ");
    const found = [];
    const b64 = tryB64(text);
    if (b64 !== null) found.push("[base64] " + b64);
    const hx = tryHex(text);
    if (hx !== null && !/�/.test(hx)) found.push("[hex] " + hx);
    const bn = tryBin(text);
    if (bn !== null) found.push("[binary] " + bn);
    try {
      const u = decodeURIComponent(text);
      if (u !== text) found.push("[url] " + u);
    } catch {}
    if (/^[A-Za-z0-9+/=_-]{4,}$/.test(text.trim()) && englishScore(caesar(text, 13)) > 0.55) {
      found.push("[rot13] " + caesar(text, 13));
    }
    let best = null;
    for (let n = 1; n < 26; n++) {
      const d = caesar(text, n);
      const s = englishScore(d);
      if (!best || s > best.s) best = { n, d, s };
    }
    if (best && best.s > 0.6 && /^[A-Za-z\s]+$/.test(text)) found.push("[caesar-" + best.n + "] " + best.d);
    await message.channel.send(found.length ? cut(found.join("\n")) : "No idea. Try `ts freq`, `ts ic`, `ts xorbrute`, or `ts hashid`.");
    return true;
  }
  if (lower.startsWith(p + "hash ")) {
    const [algo, ...rest] = arg(p + "hash ").split(/\s+/);
    const text = rest.join(" ");
    const algos = ["md5", "sha1", "sha224", "sha256", "sha384", "sha512"];
    if (!algos.includes((algo || "").toLowerCase()) || !text) {
      await message.channel.send("Usage: `ts hash md5|sha1|sha224|sha256|sha384|sha512 <text>`");
      return true;
    }
    await message.channel.send(crypto.createHash(algo.toLowerCase()).update(text, "utf8").digest("hex"));
    return true;
  }
  if (lower.startsWith(p + "upper ")) {
    await message.channel.send(cut(arg(p + "upper ").toUpperCase() || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "lower ")) {
    await message.channel.send(cut(arg(p + "lower ").toLowerCase() || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "len ")) {
    const text = arg(p + "len ");
    await message.channel.send(text.length + " chars / " + Buffer.byteLength(text, "utf8") + " bytes");
    return true;
  }
  if (lower.startsWith(p + "get ")) {
    const url = arg(p + "get ").split(/\s+/)[0] || "";
    if (!/^https?:\/\//i.test(url)) {
      await message.channel.send("Usage: `ts get <http(s) url>`");
      return true;
    }
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "syndication-bot" },
      });
      await message.channel.send(cut(await res.text()));
    } catch {
      await message.channel.send("Fetch failed.");
    }
    return true;
  }
  if (lower.startsWith(p + "forensics ")) {
    await forensics(message, arg(p + "forensics ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "qr ")) {
    await qr(message, arg(p + "qr ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "crack ")) {
    await crack(message, arg(p + "crack ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "what ")) {
    const found = whatIs(arg(p + "what ").slice(0, 500));
    await message.channel.send(found.length ? cut(found.join(" / ")) : "No idea what that is.");
    return true;
  }
  if (lower.startsWith(p + "auto ")) {
    const parts = arg(p + "auto ").split(/\s+/);
    const cribBit = parts.find((t) => t.toLowerCase().startsWith("crib="));
    const crib = cribBit ? cribBit.slice(5) : "";
    const text = parts.filter((t) => t !== cribBit).join(" ");
    await auto(message, text, crib);
    return true;
  }
  if (lower === p + "doctor") {
    await doctor(message);
    return true;
  }
  if (lower === p + "help" || lower.startsWith(p + "help ")) {
    const topic = content.slice((p + "help").length).trim().toLowerCase();
    let fields = HELP_FIELDS;
    if (topic) {
      const exact = HELP_FIELDS.filter(
        ([name], i) => HELP_KEYS[i] === topic || name.toLowerCase() === topic || name.toLowerCase().startsWith(topic)
      );
      fields = exact.length
        ? exact
        : HELP_FIELDS.filter((_, i) => (HELP_TOPICS[HELP_KEYS[i]] || []).some((k) => k.includes(topic) || topic.includes(k)));
    }
    const embed = new EmbedBuilder()
      .setTitle(topic ? "ts help: " + topic : "syndication — every command starts with `ts`")
      .setColor("#16e16e");
    if (!fields.length) {
      embed.setDescription("topics: " + HELP_FIELDS.map(([name]) => name.toLowerCase()).join(", "));
    }
    for (const [name, value] of fields) embed.addFields({ name, value });
    await message.channel.send({ embeds: [embed] });
    return true;
  }
  return false;
};
