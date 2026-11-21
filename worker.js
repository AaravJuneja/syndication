import { LOOKUP_LINK, INSERT_LINK, INSERT_TRIGGER, validNewSlug, linkTarget } from "./src/shortlinks.js";
import { identify, formatIdentify } from "./src/fun/identify.js";
import { baconEncode, baconDecode } from "./src/fun/bacon.js";
import { solveLayers } from "./src/fun/layers.js";

const MAX_INTERACTION_BYTES = 128 * 1024;
const DATABASE_COMMANDS = new Set(["baller-add", "baller-show", "baller-remove", "link-add", "link-show", "link-edit", "link-remove"]);

function hexToBytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyDiscord(sig, ts, body, publicKey) {
  if (!/^[a-f\d]{64}$/i.test(publicKey || "")) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(publicKey),
      "Ed25519",
      false,
      ["verify"]
    );
    const timestamp = new TextEncoder().encode(ts);
    const msg = new Uint8Array(timestamp.length + body.length);
    msg.set(timestamp);
    msg.set(body, timestamp.length);
    return await crypto.subtle.verify("Ed25519", key, hexToBytes(sig), msg);
  } catch {
    return false;
  }
}

function replyData(content) {
  const text = String(content);
  return { content: text.length > 1900 ? text.slice(0, 1899) + "…" : text || "(empty)", allowed_mentions: { parse: [] } };
}

function slashReply(content, ephemeral = false) {
  return Response.json({ type: 4, data: { ...replyData(content), ...(ephemeral ? { flags: 64 } : {}) } });
}

function opt(interaction, name) {
  const o = (interaction.data.options || []).find((x) => x.name === name);
  return o ? String(o.value) : "";
}

function caesar(s, n) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode((((c.charCodeAt(0) - base + n) % 26 + 26) % 26) + base);
  });
}

async function shaHex(algo, text) {
  const map = { sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };
  if (!Object.hasOwn(map, algo)) return null;
  const digest = await crypto.subtle.digest(map[algo], new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const LANDING = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>syndication</title>
<link rel="icon" type="image/svg+xml" href="https://www.techsyndicate.us/tslogo.svg">
<link rel="alternate icon" type="image/png" href="https://www.techsyndicate.us/tslogo.png">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; color: #eee; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; }
  h1 { font-size: clamp(40px, 8vw, 72px); letter-spacing: 2px; }
  h1 span { color: #16e16e; }
  p { color: #888; margin-top: 12px; }
  code { background: #111; border: 1px solid #16e16e; color: #16e16e; border-radius: 6px; padding: 8px 14px; display: inline-block; margin-top: 20px; }
</style>
</head>
<body>
<div>
<h1>syndi<span>cation</span></h1>
<code>ts link add &lt;name&gt; &lt;short&gt; &lt;url&gt;</code>
</div>
</body>
</html>`;

const MORSE_MAP = { a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....", i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.", q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-", y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----." };
const MORSE_REV = Object.fromEntries(Object.entries(MORSE_MAP).map(([k, v]) => [v, k]));

const BRAILLE_MAP = { "⠁": "a", "⠃": "b", "⠉": "c", "⠙": "d", "⠑": "e", "⠋": "f", "⠛": "g", "⠓": "h", "⠊": "i", "⠚": "j", "⠅": "k", "⠇": "l", "⠍": "m", "⠝": "n", "⠕": "o", "⠏": "p", "⠟": "q", "⠗": "r", "⠎": "s", "⠞": "t", "⠥": "u", "⠧": "v", "⠺": "w", "⠭": "x", "⠽": "y", "⠵": "z", "⠀": " " };
const BRAILLE_REV = Object.fromEntries(Object.entries(BRAILLE_MAP).map(([k, v]) => [v, k]));

function englishScore(s) {
  const m = s.toLowerCase().match(/[a-z ]/g);
  if (!m) return 0;
  const common = "etaoinshrdlu ";
  let hits = 0;
  for (const c of m) if (common.includes(c)) hits++;
  return hits / Math.max(1, s.length);
}

function tryB64(s) {
  const t = s.trim();
  if (!/^[A-Za-z0-9+/=_-]+$/.test(t) || t.length % 4 !== 0) return null;
  try {
    const norm = t.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(norm);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const out = new TextDecoder().decode(bytes);
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
    const bytes = new Uint8Array(t.match(/../g).map((h) => parseInt(h, 16)));
    return new TextDecoder().decode(bytes);
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
  for (let i = 0; i < bits.length; i += 8) out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
  return out;
}

const B32A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function b32decode(s) {
  const t = s.trim().replace(/=+$/, "").toUpperCase();
  if (!t || !/^[A-Z2-7]+$/.test(t)) return null;
  let bits = "";
  for (const c of t) bits += B32A.indexOf(c).toString(2).padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

function b32encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) out += B32A[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  while (out.length % 8 !== 0) out += "=";
  return out;
}

async function turso(env, sql, args = [], write = false) {
  const token = write ? env.TURSO_AUTH_TOKEN : env.TURSO_READ_TOKEN || env.TURSO_AUTH_TOKEN;
  const url = new URL((env.TURSO_URL || "").replace(/^libsql:\/\//, "https://"));
  if (url.protocol !== "https:" || !token) throw new Error("Turso is not configured");
  const res = await fetch(new URL("/v2/pipeline", url), {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [
      { type: "execute", stmt: { sql, args: args.map((value) => ({ type: "text", value })) } },
      { type: "close" },
    ] }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error("Turso HTTP failure");
  const j = await res.json();
  const statement = j.results?.[0];
  const result = statement?.response?.result;
  if (statement?.type !== "ok" || !Array.isArray(result?.rows)) throw new Error("Turso statement failed");
  return { rows: result.rows.map((row) => row.map((cell) => cell?.value)), changed: result.affected_row_count || 0 };
}

export const SLASH_COMMANDS = [
  { name: "ping", description: "syndication check" },
  { name: "help", description: "syndication command menu" },
  { name: "b64", description: "base64 encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "hex", description: "hex encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "url", description: "url encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "rot", description: "rotate letters", options: [{ name: "text", description: "text", type: 3, required: true }, { name: "n", description: "shift, default 13", type: 4, required: false }] },
  { name: "caesar", description: "all 25 caesar shifts", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "atbash", description: "atbash mirror", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "rev", description: "reverse text", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "upper", description: "uppercase", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "lower", description: "lowercase", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "len", description: "length in chars and bytes", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "hash", description: "sha hash", options: [{ name: "algo", description: "sha1|sha256|sha384|sha512", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "dec", description: "code points to text", options: [{ name: "codes", description: "72 105", type: 3, required: true }] },
  { name: "enc", description: "text to code points", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "morse", description: "morse encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "b32", description: "base32 encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "freq", description: "letter frequency", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "ic", description: "index of coincidence", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "hashid", description: "identify a hash", options: [{ name: "hash", description: "hash", type: 3, required: true }] },
  { name: "jwt", description: "decode a jwt", options: [{ name: "token", description: "jwt", type: 3, required: true }] },
  { name: "decon", description: "auto-detect encoding", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "auto", description: "try peeling layers of encoded text", options: [{ name: "text", description: "ciphertext", type: 3, required: true }, { name: "crib", description: "known plaintext substring", type: 3, required: false }] },
  { name: "what", description: "rank likely ciphers and encodings", options: [{ name: "text", description: "ciphertext or encoded text", type: 3, required: true }] },
  { name: "identify", description: "rank likely ciphers and encodings", options: [{ name: "text", description: "ciphertext or encoded text", type: 3, required: true }] },
  { name: "braille", description: "braille encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "tap", description: "tap code encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "zw", description: "zero-width steg scan", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "a1z26", description: "numbers to letters and back", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "bacon", description: "bacon cipher", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }, { name: "variant", description: "alphabet variant", type: 4, choices: [{ name: "Original (24 letters)", value: 24 }, { name: "Modern (26 letters)", value: 26 }] }] },
  { name: "ook", description: "run ook code", options: [{ name: "code", description: "Ook. Ook? ...", type: 3, required: true }] },
  { name: "rail", description: "railfence brute force", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "xor", description: "xor hex with key", options: [{ name: "hex", description: "hex", type: 3, required: true }, { name: "key", description: "key or byte", type: 3, required: true }] },
  { name: "xorbrute", description: "single-byte xor brute force", options: [{ name: "hex", description: "hex", type: 3, required: true }] },
  { name: "b36", description: "base36 encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "saml", description: "decode saml blob", options: [{ name: "text", description: "blob", type: 3, required: true }] },
  { name: "factor", description: "factor small n", options: [{ name: "n", description: "number", type: 3, required: true }] },
  { name: "rsa", description: "rsa decrypt with known factors", options: [{ name: "n", description: "n", type: 3, required: true }, { name: "e", description: "e", type: 3, required: true }, { name: "c", description: "c", type: 3, required: true }] },
  { name: "wiener", description: "wiener small-d attack", options: [{ name: "e", description: "e", type: 3, required: true }, { name: "n", description: "n", type: 3, required: true }] },
  { name: "hastad", description: "e=3 broadcast attack", options: [{ name: "pairs", description: "c1:n1 c2:n2 c3:n3", type: 3, required: true }] },
  { name: "fermat", description: "fermat factor close primes", options: [{ name: "n", description: "n", type: 3, required: true }] },
  { name: "factordb", description: "factordb lookup", options: [{ name: "n", description: "n", type: 3, required: true }] },
  { name: "backlink", description: "identify a link id", options: [{ name: "text", description: "id or url", type: 3, required: true }] },
  { name: "user", description: "fast username check", options: [{ name: "name", description: "username", type: 3, required: true }] },
  { name: "ghuser", description: "github profile intel", options: [{ name: "name", description: "username", type: 3, required: true }] },
  { name: "ghkeys", description: "github public keys", options: [{ name: "name", description: "username", type: 3, required: true }] },
  { name: "weather", description: "forecast or history", options: [{ name: "city", description: "city", type: 3, required: true }, { name: "date", description: "YYYY-MM-DD", type: 3, required: false }] },
  { name: "ip", description: "ip info", options: [{ name: "target", description: "ip", type: 3, required: true }] },
  { name: "forensics", description: "file triage from url", options: [{ name: "url", description: "file url", type: 3, required: true }] },
  { name: "dtmf", description: "decode dial tones (wav)", options: [{ name: "url", description: "audio url", type: 3, required: true }] },
  { name: "amorse", description: "decode audio morse (wav)", options: [{ name: "url", description: "audio url", type: 3, required: true }] },
  { name: "baller-add", description: "teach a trigger", options: [{ name: "trigger", description: "trigger", type: 3, required: true }, { name: "response", description: "response", type: 3, required: true }] },
  { name: "baller-show", description: "list triggers" },
  { name: "baller-remove", description: "delete an auto-reply trigger", options: [{ name: "trigger", description: "exact trigger text", type: 3, required: true }] },
  { name: "baller-say", description: "speak as bot", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "link-add", description: "create short link", options: [{ name: "name", description: "name", type: 3, required: true }, { name: "short", description: "slug", type: 3, required: true }, { name: "url", description: "target", type: 3, required: true }] },
  { name: "link-show", description: "list short links" },
  { name: "link-edit", description: "edit a short link", options: [{ name: "short", description: "slug", type: 3, required: true }, { name: "field", description: "field to edit", type: 3, required: true, choices: [{ name: "Name", value: "name" }, { name: "Destination", value: "link" }] }, { name: "value", description: "new name or URL", type: 3, required: true }] },
  { name: "link-remove", description: "delete a short link", options: [{ name: "short", description: "slug", type: 3, required: true }] },
];

function bfRun(code) {
  const prog = code.replace(/[^+\-<>,.\[\]]/g, "");
  const mem = new Uint8Array(30000);
  const jumps = {};
  const stack = [];
  for (let i = 0; i < prog.length; i++) {
    if (prog[i] === "[") stack.push(i);
    else if (prog[i] === "]") {
      const j = stack.pop();
      if (j === undefined) return null;
      jumps[j] = i;
      jumps[i] = j;
    }
  }
  if (stack.length) return null;
  let p = 0;
  let ip = 0;
  let steps = 0;
  let out = "";
  while (ip < prog.length && steps++ < 50000) {
    const c = prog[ip];
    if (c === ">") p = (p + 1) % 30000;
    else if (c === "<") p = (p + 29999) % 30000;
    else if (c === "+") mem[p]++;
    else if (c === "-") mem[p]--;
    else if (c === ".") out += String.fromCharCode(mem[p]);
    else if (c === "[" && mem[p] === 0) ip = jumps[ip];
    else if (c === "]" && mem[p] !== 0) ip = jumps[ip];
    ip++;
    if (out.length > 500) break;
  }
  return out;
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

const TAP_ROWS = ["abcde", "fghij", "lmnop", "qrstu", "vwxyz"];

function hashIdW(h) {
  const t = h.trim();
  const out = [];
  if (/^\$2[aby]\$\d+\$.{53}$/.test(t)) out.push("bcrypt");
  if (/^\$6\$[^$]+\$.+/.test(t)) out.push("sha512crypt");
  if (/^\$1\$[^$]+\$.+/.test(t)) out.push("md5crypt");
  if (/^\$argon2(id|i|d)\$.+/.test(t)) out.push("argon2");
  if (/^\*[0-9A-F]{40}$/i.test(t)) out.push("MySQL5");
  if (/^[0-9a-f]{16}$/i.test(t)) out.push("MySQL323 / LM");
  if (/^[0-9a-f]{32}$/i.test(t)) out.push("MD5 / NTLM");
  if (/^[0-9a-f]{40}$/i.test(t)) out.push("SHA1");
  if (/^[0-9a-f]{56}$/i.test(t)) out.push("SHA224");
  if (/^[0-9a-f]{64}$/i.test(t)) out.push("SHA256");
  if (/^[0-9a-f]{96}$/i.test(t)) out.push("SHA384");
  if (/^[0-9a-f]{128}$/i.test(t)) out.push("SHA512");
  return out;
}

function modPowW(base, exp, mod) {
  let r = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

function parseBigW(s) {
  s = String(s || "").trim().toLowerCase();
  try {
    if (s.startsWith("0x")) return BigInt(s);
    if (/^\d+$/.test(s)) return BigInt(s);
    return null;
  } catch {
    return null;
  }
}

function trialFactor(n) {
  const out = [];
  let m = n;
  for (let p = 2n; p * p <= m && p < 100000n; p += p === 2n ? 1n : 2n) {
    while (m % p === 0n) {
      out.push(p);
      m /= p;
    }
  }
  if (m > 1n) out.push(m);
  return out;
}

function egcdW(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcdW(b, a % b);
  return [g, y, x - (a / b) * y];
}

async function handleSlash(interaction, env) {
  const name = ((interaction.data || {}).name || "").toLowerCase();
  const get = (n) => opt(interaction, n);
  if (name === "ping") return slashReply("syndication is up");
  if (name === "help") {
    return slashReply(
      "**syndication slash kit** (fast stuff, more on `ts` prefix)\n" +
      "`/b64 /hex /url /morse /b32` mode + text\n`/rot` `/caesar` `/atbash` `/rev`\n" +
      "`/upper /lower /len` `/hash` `/dec /enc` `/freq /ic`\n" +
      "`/what` (also `/identify`) ranks ciphers and encodings\n`/hashid /jwt /decon /auto`\n" +
      "`/braille /tap /zw /a1z26 /bacon /ook /rail`\n" +
      "`/xor /xorbrute /b36 /saml`\n" +
      "`/factor /rsa /wiener /hastad /fermat /factordb`\n" +
      "`/backlink /user /ghuser /ghkeys /weather /ip`\n" +
      "`/forensics /dtmf /amorse` (url, wav only)\n" +
      "`/baller-add /baller-show /baller-remove /baller-say`\n" +
      "`/link-add /link-show /link-edit /link-remove`"
    );
  }
  if (name === "b64" || name === "hex" || name === "url") {
    const mode = get("mode").toLowerCase();
    const text = get("text");
    try {
      if (mode === "encode") {
        const out = name === "b64" ? btoa(unescape(encodeURIComponent(text)))
          : name === "hex" ? [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, "0")).join("")
          : encodeURIComponent(text);
        return slashReply(out);
      }
      const out = name === "b64" ? decodeURIComponent(escape(atob(text)))
        : name === "hex" ? new TextDecoder().decode(new Uint8Array(text.match(/../g).map((h) => parseInt(h, 16))))
        : decodeURIComponent(text);
      return slashReply(out);
    } catch {
      return slashReply("could not decode that");
    }
  }
  if (name === "rot") {
    const n = parseInt(get("n") || "13", 10);
    return slashReply(caesar(get("text"), isNaN(n) ? 13 : n));
  }
  if (name === "caesar") {
    const text = get("text").slice(0, 120);
    const lines = [];
    for (let n = 1; n < 26; n++) lines.push(n + ": " + caesar(text, n));
    return slashReply(lines.join("\n"));
  }
  if (name === "atbash") {
    return slashReply(get("text").replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
    }));
  }
  if (name === "rev") return slashReply([...get("text")].reverse().join(""));
  if (name === "upper") return slashReply(get("text").toUpperCase());
  if (name === "lower") return slashReply(get("text").toLowerCase());
  if (name === "len") {
    const t = get("text");
    return slashReply(t.length + " chars / " + new TextEncoder().encode(t).length + " bytes");
  }
  if (name === "hash") {
    const out = await shaHex(get("algo").toLowerCase(), get("text"));
    return slashReply(out === null ? "algo: sha1|sha256|sha384|sha512 (SHA-224 and MD5 are on `ts hash`)" : out);
  }
  if (name === "dec") {
    try {
      const nums = get("codes").split(/[\s,]+/).filter(Boolean);
      return slashReply(String.fromCodePoint(...nums.map(Number)));
    } catch {
      return slashReply("usage: /dec codes:72 105");
    }
  }
  if (name === "enc") {
    return slashReply([...get("text")].map((c) => c.codePointAt(0)).join(" "));
  }
  if (name === "morse" || name === "b32") {
    const mode = get("mode").toLowerCase();
    const text = get("text");
    if (name === "morse") {
      if (mode === "decode") {
        const out = text.trim().split(/\s+/).map((w) => (w === "/" ? " " : MORSE_REV[w] || "?")).join("").replace(/ {2,}/g, " ");
        return slashReply(out);
      }
      return slashReply(text.toLowerCase().split("").map((c) => (c === " " ? "/" : MORSE_MAP[c] || "?")).join(" "));
    }
    if (mode === "encode") {
      const bytes = new TextEncoder().encode(text);
      let bits = "";
      for (const b of bytes) bits += b.toString(2).padStart(8, "0");
      let out = "";
      for (let i = 0; i < bits.length; i += 5) out += B32A[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
      while (out.length % 8 !== 0) out += "=";
      return slashReply(out);
    }
    const out = b32decode(text);
    return slashReply(out === null ? "not valid base32" : out);
  }
  if (name === "freq" || name === "ic") {
    const counts = {};
    let total = 0;
    for (const c of get("text").toUpperCase()) {
      if (c >= "A" && c <= "Z") {
        counts[c] = (counts[c] || 0) + 1;
        total++;
      }
    }
    if (!total) return slashReply("no letters found");
    if (name === "freq") {
      const lines = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + ": " + n + " (" + ((100 * n) / total).toFixed(1) + "%)");
      return slashReply(lines.join("\n"));
    }
    if (total < 2) return slashReply("need at least 2 letters");
    let sum = 0;
    for (const c in counts) sum += counts[c] * (counts[c] - 1);
    return slashReply("index of coincidence: " + (sum / (total * (total - 1))).toFixed(4) + " (~0.066 english, ~0.038 random)");
  }
  if (name === "hashid") {
    const found = hashIdW(get("hash"));
    return slashReply(found.length ? found.join(" / ") : "unknown hash format");
  }
  if (name === "jwt") {
    const parts = get("token").trim().split(".");
    if (parts.length < 2) return slashReply("not a jwt");
    try {
      const b64u = (x) => new TextDecoder().decode(Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
      return slashReply("Decoded only; signature not verified.\nheader: " + b64u(parts[0]) + "\npayload: " + b64u(parts[1]), true);
    } catch {
      return slashReply("not decodable");
    }
  }
  if (name === "auto") {
    const text = get("text").trim();
    const maxInput = 500;
    const { results, stats } = solveLayers(text.slice(0, maxInput), {
      crib: get("crib").trim(), depth: 3, maxExpansions: 8, maxStates: 24, fitSample: 140,
    });
    const matches = results.filter((r) => r.path.length && (r.fit >= 0.45 || r.score >= 10)).slice(0, 5);
    const lines = matches.length
      ? matches.map((r) => "[" + r.path.join(" > ") + "] " + r.text.replace(/\s+/g, " ").slice(0, 220))
      : ["No readable result. Try `/what` or use `ts auto` for a deeper search."];
    lines.push(`Depth up to ${stats.depth}; stopped: ${stats.stoppedBy}.` + (text.length > maxInput ? ` Analyzed first ${maxInput} of ${text.length} chars.` : ""));
    return slashReply(lines.join("\n"));
  }
  if (name === "decon") {
    const t = get("text").slice(0, 300);
    const found = [];
    const push = (label, out) => {
      if (out && out !== t && !found.some((f) => f[1] === out)) found.push([label, out]);
    };
    push("base64", tryB64(t));
    push("hex", tryHex(t));
    push("base32", b32decode(t));
    push("binary", tryBin(t));
    try {
      const u = decodeURIComponent(t);
      if (u !== t) push("url", u);
    } catch {}
    if (!found.length) return slashReply("no idea - try /auto");
    return slashReply(found.map((f) => "[" + f[0] + "] " + f[1].slice(0, 300)).join("\n"));
  }
  if (name === "what" || name === "identify") {
    const text = get("text").trim();
    return slashReply(text ? formatIdentify(identify(text, { mode: "fast", limit: 5 })) : "Give me text to identify.");
  }
  if (name === "braille" || name === "tap") {
    const mode = get("mode").toLowerCase();
    const text = get("text");
    if (name === "braille") {
      if (mode === "decode") {
        let out = "";
        let num = false;
        for (const c of text) {
          if (c === "⠼") {
            num = true;
            continue;
          }
          const letter = BRAILLE_MAP[c];
          if (!letter) {
            out += c === " " ? " " : "?";
            num = false;
            continue;
          }
          if (num && letter >= "a" && letter <= "j") out += letter === "j" ? "0" : String(letter.charCodeAt(0) - 96);
          else {
            out += letter;
            num = false;
          }
        }
        return slashReply(out || "(empty)");
      }
      return slashReply([...text.toLowerCase()].map((c) => BRAILLE_REV[c] || (c === " " ? "⠀" : "?")).join("") || "(empty)");
    }
    if (mode === "decode") {
      const nums = text.trim().split(/\s+/).map(Number);
      if (nums.length % 2 !== 0 || nums.some((n) => !(n >= 1 && n <= 5))) return slashReply("pairs like: 1 5 1 1");
      let out = "";
      for (let i = 0; i < nums.length; i += 2) out += TAP_ROWS[nums[i] - 1][nums[i + 1] - 1];
      return slashReply(out);
    }
    let out = [];
    for (const c of text.toLowerCase()) {
      if (c === "k") {
        out.push("1 3");
        continue;
      }
      if (c === " ") continue;
      let done = false;
      for (let r = 0; r < 5 && !done; r++) {
        const col = TAP_ROWS[r].indexOf(c);
        if (col >= 0) {
          out.push(r + 1 + " " + (col + 1));
          done = true;
        }
      }
      if (!done) return slashReply("letters a-z only");
    }
    return slashReply(out.join(" "));
  }
  if (name === "zw") {
    const text = get("text");
    let z = 0;
    let n = 0;
    let bits = "";
    for (const c of text) {
      if (c === "​") {
        bits += "0";
        z++;
      } else if (c === "‌") {
        bits += "1";
        n++;
      }
    }
    if (!bits.length) return slashReply("no zero-width characters");
    let out = "";
    for (let i = 0; i + 8 <= bits.length; i += 8) out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
    return slashReply("ZWSP:" + z + " ZWNJ:" + n + (out.trim() ? "\ndecoded: " + out.slice(0, 300) : ""));
  }
  if (name === "a1z26") {
    const s = get("text");
    if (/^[\d\s,\-]+$/.test(s.trim()) && /\d/.test(s)) {
      return slashReply(s.trim().split(/[\s,]+/).map((x) => {
        const v = parseInt(x);
        return v >= 1 && v <= 26 ? String.fromCharCode(96 + v) : "?";
      }).join(""));
    }
    return slashReply([...s.toLowerCase()].map((c) => (c >= "a" && c <= "z" ? c.charCodeAt(0) - 96 : c)).join(" "));
  }
  if (name === "bacon") {
    const mode = get("mode").toLowerCase();
    const opts = { variant: Number(get("variant") || "24") };
    if (mode === "encode") return slashReply(baconEncode(get("text"), opts) || "letters and spaces only");
    if (mode === "decode") return slashReply(baconDecode(get("text"), opts) || "groups of 5 (A/B)");
    return slashReply("Choose encode or decode.");
  }
  if (name === "ook") {
    const ops = { "ook. ook?": ">", "ook? ook.": "<", "ook. ook.": "+", "ook! ook!": "-", "ook! ook.": ".", "ook. ook!": ",", "ook! ook?": "[", "ook? ook!": "]" };
    const toks = get("code").trim().toLowerCase().split(/\s+/);
    if (toks.length % 2 !== 0) return slashReply("bad ook");
    const prog = [];
    for (let i = 0; i < toks.length; i += 2) {
      const op = ops[toks[i] + " " + toks[i + 1]];
      if (!op) return slashReply("bad ook");
      prog.push(op);
    }
    return slashReply(bfRun(prog.join("")) ?? "unbalanced brackets");
  }
  if (name === "rail") {
    const text = get("text").slice(0, 200);
    const lines = [];
    for (let r = 2; r <= Math.min(8, text.length - 1); r++) {
      const n = text.length;
      const period = 2 * r - 2;
      const pat = [];
      for (let i = 0; i < n; i++) {
        const m = i % period;
        pat.push(m < r ? m : period - m);
      }
      const out = new Array(n);
      let k = 0;
      for (let row = 0; row < r; row++) {
        for (let i = 0; i < n; i++) {
          if (pat[i] === row) out[i] = text[k++];
        }
      }
      lines.push(r + ": " + out.join(""));
    }
    return slashReply(lines.length ? lines.join("\n") : "too short");
  }
  if (name === "xor" || name === "xorbrute") {
    const hexStr = get("hex").replace(/\s+/g, "");
    if (!hexStr || !/^[0-9a-fA-F]+$/.test(hexStr)) return slashReply("need hex");
    const buf = [...hexStr.match(/../g).map((h) => parseInt(h, 16))];
    if (name === "xor") {
      const key = get("key");
      let out = "";
      if (/^\d+$/.test(key)) {
        out = buf.map((b) => String.fromCharCode(b ^ (parseInt(key) & 0xff))).join("");
      } else if (key) {
        out = buf.map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
      } else return slashReply("need a key");
      return slashReply(out);
    }
    const scored = [];
    for (let k = 0; k < 256; k++) {
      const s = buf.map((b) => String.fromCharCode(b ^ k)).join("");
      scored.push([englishScore(s), k, s]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    return slashReply(scored.slice(0, 3).map(([s, k, t]) => "key " + k + ": " + t.slice(0, 150)).join("\n"));
  }
  if (name === "b36") {
    const mode = get("mode").toLowerCase();
    const text = get("text");
    try {
      if (mode === "decode") {
        const t = text.trim().toLowerCase();
        if (!/^[0-9a-z]+$/.test(t)) return slashReply("bad base36");
        let v = 0n;
        for (const c of t) v = v * 36n + BigInt(c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 87);
        return slashReply(v.toString(10));
      }
      return slashReply(BigInt(text).toString(36));
    } catch {
      return slashReply("bad value");
    }
  }
  if (name === "saml") {
    try {
      const raw = Uint8Array.from(atob(get("text").trim().replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      const ds = new DecompressionStream("deflate-raw");
      const xml = await new Response(new Blob([raw]).stream().pipeThrough(ds)).text();
      return slashReply(xml.slice(0, 1500));
    } catch {
      return slashReply("not decodable");
    }
  }
  if (name === "factor") {
    const n = parseBigW(get("n"));
    if (n === null || n < 2n) return slashReply("need a number");
    const facs = trialFactor(n);
    return slashReply(n.toString() + " = " + facs.map(String).join(" × ") + (facs.length === 1 ? " (prime?)" : ""));
  }
  if (name === "rsa") {
    const n = parseBigW(get("n"));
    const e = parseBigW(get("e"));
    const c = parseBigW(get("c"));
    if (n === null || e === null || c === null) return slashReply("need n, e, c");
    const facs = trialFactor(n);
    const uniq = [...new Set(facs)];
    if (facs.length > 4 || uniq.length > 2 || facs.length === 1) return slashReply("small factors not found - try /factordb");
    const phi = uniq.length === 1 ? uniq[0] * (uniq[0] - 1n) : (uniq[0] - 1n) * (uniq[1] - 1n);
    const eg = (a, b) => (b === 0n ? [a, 1n, 0n] : (() => { const [g, x, y] = eg(b, a % b); return [g, y, x - (a / b) * y]; })());
    const [g, x] = eg(e, phi);
    if (g !== 1n) return slashReply("no inverse");
    const d = ((x % phi) + phi) % phi;
    const m = modPowW(c, d, n);
    let hex = m.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    let text = "";
    try {
      text = new TextDecoder().decode(Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16))));
    } catch {}
    return slashReply("p=" + uniq.join(",") + " d=" + d.toString() + "\nm=" + m.toString() + (/^[\x20-\x7e\s]*$/.test(text) && text ? "\ntext: " + text : ""));
  }
  if (name === "wiener") {
    const e = parseBigW(get("e"));
    const n = parseBigW(get("n"));
    if (e === null || n === null) return slashReply("need e and n");
    const isqrt = (v = 0n) => {
      if (v < 0n) return null;
      if (v < 2n) return v;
      let x = v;
      let y = (x + 1n) >> 1n;
      while (y < x) {
        x = y;
        y = (x + v / x) >> 1n;
      }
      return x;
    };
    let a = e;
    let b = n;
    const cf = [];
    while (b > 0n) {
      cf.push(a / b);
      const t = a % b;
      a = b;
      b = t;
    }
    let hn1 = 1n;
    let hn2 = 0n;
    let kd1 = 0n;
    let kd2 = 1n;
    for (const q of cf) {
      const h = q * hn1 + hn2;
      const k = q * kd1 + kd2;
      hn2 = hn1;
      hn1 = h;
      kd2 = kd1;
      kd1 = k;
      if (h === 0n) continue;
      if ((e * k - 1n) % h !== 0n) continue;
      const phi = (e * k - 1n) / h;
      const s = n - phi + 1n;
      const r = isqrt(s * s - 4n * n);
      if (r === null || r * r !== s * s - 4n * n || (s + r) % 2n !== 0n) continue;
      const p = (s + r) / 2n;
      const qq = (s - r) / 2n;
      if (p * qq === n) return slashReply("p=" + p.toString() + " q=" + qq.toString() + " d=" + k.toString());
    }
    return slashReply("wiener failed");
  }
  if (name === "hastad") {
    const parts = get("pairs").split(/\s+/).filter(Boolean);
    if (parts.length < 3) return slashReply("need 3+ c:n pairs");
    const rems = [];
    const mods = [];
    for (const x of parts) {
      const [cs, ns] = x.split(":");
      const c = parseBigW(cs);
      const n = parseBigW(ns);
      if (c === null || n === null) return slashReply("bad pair " + x);
      rems.push(c);
      mods.push(n);
    }
    let M = 1n;
    for (const m of mods) M *= m;
    let acc = 0n;
    for (let i = 0; i < rems.length; i++) {
      const Mi = M / mods[i];
      const gg = egcdW(BigInt(Mi % mods[i]), BigInt(mods[i]));
      if (gg[0] !== 1n) return slashReply("moduli not coprime");
      const tA = BigInt(rems[i]) * BigInt(Mi);
      const tF = (((BigInt(gg[1]) % BigInt(mods[i])) + BigInt(mods[i])) % BigInt(mods[i]));
      acc = (BigInt(acc) + tA * tF) % BigInt(M);
    }
    let r = acc < 2n ? acc : acc;
    let y = (2n * r + acc / (r * r)) / 3n;
    while (y < r) {
      r = y;
      y = (2n * r + acc / (r * r)) / 3n;
    }
    if (r * r * r !== acc) return slashReply("no exact cube root");
    let hex = r.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    let text = "";
    try {
      text = new TextDecoder().decode(Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16))));
    } catch {}
    return slashReply("m=" + r.toString() + (/^[\x20-\x7e\s]*$/.test(text) && text ? "\ntext: " + text : ""));
  }
  if (name === "fermat") {
    const n = parseBigW(get("n"));
    if (n === null || n < 2n) return slashReply("need n");
    const isqrt2 = (v = 0n) => {
      if (v < 2n) return v;
      let x = v;
      let y = (x + 1n) >> 1n;
      while (y < x) {
        x = y;
        y = (x + v / x) >> 1n;
      }
      return x;
    };
    let a = isqrt2(n);
    if (a * a < n) a++;
    for (let i = 0; i < 500000; i++) {
      const b2 = a * a - n;
      const b = isqrt2(b2);
      if (b * b === b2) return slashReply(n.toString() + " = " + (a - b).toString() + " × " + (a + b).toString());
      a++;
    }
    return slashReply("no close factors in 500k steps");
  }
  if (name === "factordb") {
    const n = (get("n") || "").trim();
    if (!n) return slashReply("need n");
    try {
      const res = await fetch("http://factordb.com/api?query=" + encodeURIComponent(n), { signal: AbortSignal.timeout(10000) });
      const j = await res.json();
      if (j.factors && j.factors.length) {
        return slashReply(n + " = " + j.factors.map(([f, e]) => (e > 1 ? f + "^" + e : "" + f)).join(" × "));
      }
      return slashReply("factordb: " + (j.status || "unknown"));
    } catch {
      return slashReply("factordb unreachable");
    }
  }
  if (name === "backlink") {
    const id = get("text").trim();
    if (!id) return slashReply("need an id");
    const rules = [
      ["YouTube", /^[A-Za-z0-9_-]{11}$/, (x) => "https://youtu.be/" + x],
      ["Imgur", /^[A-Za-z0-9]{5,7}$/, (x) => "https://imgur.com/" + x],
      ["Pastebin", /^[A-Za-z0-9]{8}$/, (x) => "https://pastebin.com/" + x],
      ["Notion", /^[0-9a-f]{32}$/i, (x) => "https://www.notion.so/" + x],
      ["Gyazo", /^[0-9a-f]{32}$/i, (x) => "https://gyazo.com/" + x],
      ["Drive file", /^[A-Za-z0-9_-]{25,}$/, (x) => "https://drive.google.com/file/d/" + x + "/view"],
      ["Lightshot", /^[a-z0-9]{6}$/, (x) => "https://prnt.sc/" + x],
      ["Vocaroo", /^[A-Za-z0-9]{12}$/, (x) => "https://vocaroo.com/" + x],
      ["IMDb", /^tt\d{7,8}$/, (x) => "https://www.imdb.com/title/" + x + "/"],
      ["Reddit", /^[a-z0-9]{6,7}$/, (x) => "https://www.reddit.com/comments/" + x],
      ["Vimeo", /^\d{8,10}$/, (x) => "https://vimeo.com/" + x],
    ];
    const hits = rules.filter((r) => r[1] instanceof RegExp && r[1].test(id)).map((r) => (typeof r[2] === "function" ? String(r[0]) + ": <" + r[2](id) + ">" : String(r[0])));
    if (/^https?:\/\//i.test(id)) {
      try {
        const res = await fetch(id, { signal: AbortSignal.timeout(8000) });
        return slashReply("resolves to <" + res.url + "> (" + res.status + ")\n" + hits.join("\n"));
      } catch {
        return slashReply(hits.length ? hits.join("\n") : "no match");
      }
    }
    return slashReply(hits.length ? hits.join("\n") : "no known service matches");
  }
  if (name === "user") {
    const uname = get("name");
    if (!/^[A-Za-z0-9_.-]{2,32}$/.test(uname)) return slashReply("bad username");
    const sites = [
      ["GitHub", "https://github.com/"], ["GitLab", "https://gitlab.com/"], ["npm", "https://www.npmjs.com/~"],
      ["PyPI", "https://pypi.org/user/"], ["Docker", "https://hub.docker.com/v2/users/"], ["Keybase", "https://keybase.io/"],
      ["Twitch", "https://www.twitch.tv/"], ["Lichess", "https://lichess.org/@/"], ["Codepen", "https://codepen.io/"],
      ["Replit", "https://replit.com/@"], ["Scratch", "https://scratch.mit.edu/users/"], ["dev.to", "https://dev.to/"],
      ["Medium", "https://medium.com/@"], ["HackerOne", "https://hackerone.com/"], ["SoundCloud", "https://soundcloud.com/"],
      ["TryHackMe", "https://tryhackme.com/p/"], ["itch.io", "https://"], ["Reddit", "https://www.reddit.com/user/"],
      ["Telegram", "https://t.me/"], ["Steam", "https://steamcommunity.com/id/"],
    ];
    const jobs = sites.map(async ([site, base]) => {
      const u = site === "Lichess" ? base + encodeURIComponent(uname) + "/all"
        : site === "itch.io" ? "https://" + encodeURIComponent(uname) + ".itch.io/"
        : site === "Reddit" ? "https://www.reddit.com/user/" + encodeURIComponent(uname) + "/about.json"
        : base + encodeURIComponent(uname);
      try {
        const res = await fetch(u, { signal: AbortSignal.timeout(7000), headers: { "User-Agent": "syndication-bot" } });
        if (res.status >= 200 && res.status < 300) return site;
      } catch {}
      return null;
    });
    const found = (await Promise.all(jobs)).filter(Boolean);
    return slashReply(found.length ? uname + " on: " + found.join(", ") : "no hits for " + uname);
  }
  if (name === "ghuser" || name === "ghkeys") {
    const uname = get("name");
    if (!/^[A-Za-z0-9-]{1,39}$/.test(uname)) return slashReply("bad username");
    try {
      if (name === "ghuser") {
        const res = await fetch("https://api.github.com/users/" + uname, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "syndication-bot" } });
        if (res.status === 404) return slashReply("not found");
        const u = await res.json();
        const lines = [u.login + (u.name ? " (" + u.name + ")" : ""), "repos:" + u.public_repos + " followers:" + u.followers + " since:" + String(u.created_at).slice(0, 10)];
        if (u.bio) lines.push(String(u.bio).slice(0, 200));
        if (u.email) lines.push(u.email);
        if (u.blog) lines.push(u.blog);
        return slashReply(lines.join("\n"));
      }
      const [ssh, gpg] = await Promise.all([
        fetch("https://api.github.com/users/" + uname + "/keys?per_page=20", { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "syndication-bot" } }).then((r) => (r.ok ? r.json() : [])),
        fetch("https://api.github.com/users/" + uname + "/gpg_keys?per_page=20", { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "syndication-bot" } }).then((r) => (r.ok ? r.json() : [])),
      ]);
      const lines = ssh.map((k) => "ssh: " + k.title).concat(gpg.map((k) => "gpg: " + k.key_id));
      return slashReply(lines.length ? lines.join("\n") : "no public keys");
    } catch {
      return slashReply("github failed");
    }
  }
  if (name === "weather") {
    const city = get("city");
    const date = get("date");
    if (!city) return slashReply("need a city");
    try {
      const g = await (await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(city) + "&count=1", { signal: AbortSignal.timeout(8000) })).json();
      if (!g.results || !g.results.length) return slashReply("city not found");
      const geo = g.results[0];
      const place = geo.name + ", " + (geo.country || "");
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        const w = await (await fetch("https://archive-api.open-meteo.com/v1/archive?latitude=" + geo.latitude + "&longitude=" + geo.longitude + "&start_date=" + date + "&end_date=" + date + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum", { signal: AbortSignal.timeout(8000) })).json();
        return slashReply(place + " " + date + ": " + w.daily.temperature_2m_min[0] + ".." + w.daily.temperature_2m_max[0] + "C rain " + w.daily.precipitation_sum[0] + "mm");
      }
      const w = await (await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + geo.latitude + "&longitude=" + geo.longitude + "&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=3", { signal: AbortSignal.timeout(8000) })).json();
      const lines = [place + " 3-day:"];
      for (let i = 0; i < w.daily.time.length; i++) lines.push(w.daily.time[i] + ": " + w.daily.temperature_2m_min[i] + ".." + w.daily.temperature_2m_max[i] + "C");
      return slashReply(lines.join("\n"));
    } catch {
      return slashReply("weather failed");
    }
  }
  if (name === "ip") {
    const target = get("target").trim();
    if (!target || /[\s/]/.test(target)) return slashReply("need an ip");
    try {
      const j = await (await fetch("https://ipinfo.io/" + encodeURIComponent(target) + "/json", { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "syndication-bot" } })).json();
      if (j.error || j.bogon) return slashReply("no info");
      const lines = [j.ip];
      if (j.city || j.country) lines.push([j.city, j.region, j.country].filter(Boolean).join(", "));
      if (j.org) lines.push(j.org);
      return slashReply(lines.join("\n"));
    } catch {
      return slashReply("lookup failed");
    }
  }
  if (name === "forensics") {
    const url = get("url").trim();
    if (!/^https?:\/\//i.test(url)) return slashReply("need an http url");
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return slashReply("download failed: " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8388608) return slashReply("over 8MB");
      const lines = ["size: " + buf.length + " bytes"];
      const hex4 = buf.slice(0, 4).toString("hex");
      const magic = hex4.startsWith("89504e47") ? "PNG" : hex4.startsWith("ffd8ff") ? "JPEG" : hex4.startsWith("474946") ? "GIF" : hex4.startsWith("504b0304") ? "ZIP" : hex4.startsWith("25504446") ? "PDF" : hex4.startsWith("1f8b") ? "GZip" : hex4.startsWith("424d") ? "BMP" : hex4.startsWith("7f454c46") ? "ELF" : hex4.startsWith("4d5a") ? "PE" : "unknown";
      lines.push("magic: " + magic);
      if (magic === "PNG" && buf.length > 33) {
        lines.push("dims: " + buf.readUInt32BE(16) + "x" + buf.readUInt32BE(20));
        let pos = 8;
        while (pos + 12 <= buf.length) {
          const len = buf.readUInt32BE(pos);
          const type = buf.toString("ascii", pos + 4, pos + 8);
          if (type === "tEXt") {
            const zero = buf.indexOf(0, pos + 8);
            lines.push("tEXt: " + buf.slice(pos + 8, zero).toString("latin1") + " = " + buf.slice(zero + 1, pos + 8 + len).toString("latin1").slice(0, 200));
          }
          if (pos + 12 + len > buf.length) break;
          pos += 12 + len;
          if (type === "IEND") break;
        }
      }
      const strs = buf.toString("latin1").match(/[ -~]{5,}/g) || [];
      const interesting = strs.filter((s) => /flag|ctf\{|http|passw|secret|key/i.test(s)).slice(0, 6);
      lines.push("strings: " + strs.length + " runs");
      for (const s of interesting) lines.push("> " + s.slice(0, 120));
      return slashReply(lines.join("\n"));
    } catch {
      return slashReply("forensics failed");
    }
  }
  if (name === "dtmf" || name === "amorse") {
    const url = get("url").trim();
    if (!/^https?:\/\//i.test(url)) return slashReply("need an audio url (wav works best)");
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return slashReply("download failed");
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 8388608) return slashReply("over 8MB");
      if (buf.toString("ascii", 0, 4) !== "RIFF") return slashReply("need a wav file (no mp3 on workers)");
      let pos = 12;
      let fmt = null;
      let data = null;
      while (pos + 8 <= buf.length) {
        const id = buf.toString("ascii", pos, pos + 4);
        const size = buf.readUInt32LE(pos + 4);
        if (id === "fmt ") fmt = { ch: buf.readUInt16LE(pos + 10), sr: buf.readUInt32LE(pos + 12), bits: buf.readUInt16LE(pos + 22) };
        if (id === "data") data = buf.slice(pos + 8, pos + 8 + size);
        pos += 8 + size + (size % 2);
      }
      if (!fmt || !data || fmt.bits !== 8 && fmt.bits !== 16) return slashReply("need 8/16-bit pcm wav");
      const n = Math.floor(data.length / (fmt.bits / 8) / fmt.ch);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let ch = 0; ch < fmt.ch; ch++) {
          const off = (i * fmt.ch + ch) * (fmt.bits / 8);
          sum += fmt.bits === 16 ? data.readInt16LE(off) / 32768 : (data[off] - 128) / 128;
        }
        samples[i] = sum / fmt.ch;
      }
      const sr = fmt.sr;
      if (name === "dtmf") {
        const rows = [697, 770, 852, 941];
        const cols = [1209, 1336, 1477, 1633];
        const keys = ["123A", "456B", "789C", "*0#D"];
        const goertzel = (seg, f) => {
          const N = seg.length;
          const k = 0.5 + (N * f) / sr;
          const w = (2 * Math.PI * k) / N;
          const cw = Math.cos(w);
          let s1 = 0;
          let s2 = 0;
          for (const x of seg) {
            const s0 = x + 2 * cw * s1 - s2;
            s2 = s1;
            s1 = s0;
          }
          return s1 * s1 + s2 * s2 - cw * s1 * s2;
        };
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
            const rp = rows.map((f) => goertzel(seg, f));
            const cp = cols.map((f) => goertzel(seg, f));
            const ri = rp.indexOf(Math.max(...rp));
            const ci = cp.indexOf(Math.max(...cp));
            const rs = [...rp].sort((a, b) => b - a);
            const cs = [...cp].sort((a, b) => b - a);
            if (rp[ri] > 4 * rs[1] && cp[ci] > 4 * cs[1]) digit = keys[ri][ci];
          }
          if (digit === cur && digit !== "") run++;
          else {
            cur = digit;
            run = digit ? 1 : 0;
            if (!digit) last = "";
          }
          if (run === 3 && cur !== last) {
            out += cur;
            last = cur;
          }
        }
        return slashReply(out ? "dtmf: " + out : "no tones found");
      }
      const win = Math.floor(sr * 0.005);
      const env2 = new Float32Array(samples.length);
      let acc = 0;
      for (let i = 0; i < samples.length; i++) {
        acc += Math.abs(samples[i]);
        if (i >= win) acc -= Math.abs(samples[i - win]);
        env2[i] = acc / Math.min(i + 1, win);
      }
      let peak = 0;
      for (const v of env2) if (v > peak) peak = v;
      const thresh = Math.max(peak * 0.3, 0.02);
      const segs = [];
      let start = -1;
      for (let i = 0; i < env2.length; i++) {
        if (env2[i] > thresh && start < 0) start = i;
        else if (env2[i] <= thresh && start >= 0) {
          if (i - start > sr * 0.02) segs.push([start, i]);
          start = -1;
        }
      }
      if (start >= 0) segs.push([start, env2.length]);
      if (!segs.length) return slashReply("no tones found");
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
        morse += segs[i][1] - segs[i][0] < split ? "." : "-";
        if (i + 1 < segs.length) {
          const g = segs[i + 1][0] - segs[i][1];
          if (g > unit * 6) morse += " / ";
          else if (g > unit * 2.5) morse += " ";
        }
      }
      const table = { ".-": "a", "-...": "b", "-.-.": "c", "-..": "d", ".": "e", "..-.": "f", "--.": "g", "....": "h", "..": "i", ".---": "j", "-.-": "k", ".-..": "l", "--": "m", "-.": "n", "---": "o", ".--.": "p", "--.-": "q", ".-.": "r", "...": "s", "-": "t", "..-": "u", "...-": "v", ".--": "w", "-..-": "x", "-.--": "y", "--..": "z", "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9" };
      const text = morse.split(" / ").map((w) => w.split(" ").map((c) => table[c] || "?").join("")).join(" ");
      return slashReply("morse: " + morse + "\ntext: " + text);
    } catch {
      return slashReply("audio decode failed");
    }
  }
  if (name === "baller-say") return slashReply(get("text"));
  if (DATABASE_COMMANDS.has(name)) {
    const domain = (env.DOMAIN || "https://go.squeakyfiddlepro.me").replace(/\/$/, "");
    if (name === "baller-add") {
      const t = get("trigger").trim();
      const r = get("response").trim();
      if (!t || !r) return slashReply("need trigger + response");
      if (t.length > 2000 || r.length > 2000) return slashReply("Trigger and response must be at most 2,000 characters each.");
      const { changed } = await turso(env, INSERT_TRIGGER, [t, r], true);
      return slashReply(changed ? "Trigger saved." : "That trigger already exists.");
    }
    if (name === "baller-remove") {
      const { changed } = await turso(env, "DELETE FROM ballers WHERE cause = ?", [get("trigger").trim()], true);
      return slashReply(changed ? "Trigger removed." : "Trigger not found.");
    }
    if (name === "baller-show") {
      const { rows } = await turso(env, "SELECT cause, effect FROM ballers ORDER BY rowid LIMIT 15");
      if (!rows.length) return slashReply("no triggers yet");
      return slashReply(rows.map(([c, e]) => c.slice(0, 40) + " → " + e.slice(0, 75)).join("\n"));
    }
    if (name === "link-add") {
      const nm = get("name").trim();
      const sh = get("short");
      const u = linkTarget(get("url"));
      if (!nm || nm.length > 100) return slashReply("Use a name between 1 and 100 characters.");
      if (!validNewSlug(sh)) return slashReply("Use 1 to 64 letters, digits, hyphens, or underscores. `health` and `interactions` are reserved.");
      if (!u) return slashReply("Use a full HTTP(S) destination URL without credentials.");
      const { changed } = await turso(env, INSERT_LINK, [sh, nm, u, new Date().toISOString()], true);
      return slashReply(changed ? "live: " + domain + "/" + sh : "short already exists");
    }
    if (name === "link-edit") {
      const field = get("field");
      if (field !== "name" && field !== "link") return slashReply("Choose a field: name or destination.");
      const value = field === "link" ? linkTarget(get("value")) : get("value").trim();
      if (!value || (field === "name" && value.length > 100)) return slashReply(field === "link"
        ? "Use a full HTTP(S) destination URL without credentials." : "Use a name between 1 and 100 characters.");
      const { changed } = await turso(env, "UPDATE links SET " + field + " = ? WHERE backlink = ?", [value, get("short")], true);
      return slashReply(changed ? "Short link updated." : "Short link not found.");
    }
    if (name === "link-remove") {
      const { changed } = await turso(env, "DELETE FROM links WHERE backlink = ?", [get("short")], true);
      return slashReply(changed ? "Short link removed." : "Short link not found.");
    }
    if (name === "link-show") {
      const { rows } = await turso(env, "SELECT name, backlink FROM links ORDER BY rowid LIMIT 15");
      if (!rows.length) return slashReply("no links yet");
      return slashReply(rows.map(([n, s]) => n.slice(0, 40) + " - " + domain + "/" + encodeURIComponent(s)).join("\n"));
    }
  }
  return slashReply("unknown command - /help");
}

export { handleSlash };

async function readInteraction(request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_INTERACTION_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

async function safelyHandleSlash(interaction, env) {
  try {
    return await handleSlash(interaction, env);
  } catch {
    console.error("Slash command failed:", interaction.data?.name);
    return slashReply(DATABASE_COMMANDS.has(interaction.data?.name) ? "Short-link/trigger database unavailable; try again later." : "Command failed; try again later.", true);
  }
}

async function finishDatabaseCommand(interaction, env) {
  try {
    const { data } = await (await safelyHandleSlash(interaction, env)).json();
    const { content, allowed_mentions } = data;
    const app = encodeURIComponent(interaction.application_id);
    const token = encodeURIComponent(interaction.token);
    const url = `https://discord.com/api/v10/webhooks/${app}/${token}/messages/@original`;
    const update = () => fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, allowed_mentions }),
      signal: AbortSignal.timeout(8000),
    });
    let res = await update();
    if (res.status === 404) {
      await res.body?.cancel();
      await new Promise((resolve) => setTimeout(resolve, 250));
      res = await update();
    }
    if (!res.ok) console.error("Discord could not deliver the deferred reply:", res.status);
  } catch {
    console.error("Discord deferred reply failed");
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    let slug;
    try {
      slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
    } catch {
      return new Response("invalid path", { status: 400 });
    }
    if (slug.toLowerCase() === "interactions") {
      if (url.pathname !== "/interactions" || request.method !== "POST") {
        return new Response("method not allowed", { status: 405, headers: { Allow: "POST" } });
      }
      const sig = request.headers.get("X-Signature-Ed25519");
      const ts = request.headers.get("X-Signature-Timestamp");
      if (!/^[a-f\d]{128}$/i.test(sig || "") || !/^\d{10,12}$/.test(ts || "") || Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
        return new Response("bad signature", { status: 401 });
      }
      const body = await readInteraction(request);
      if (!body) return new Response("interaction too large", { status: 413 });
      if (!(await verifyDiscord(sig, ts, body, env.DISCORD_PUBLIC_KEY))) return new Response("bad signature", { status: 401 });
      let interaction;
      try {
        interaction = JSON.parse(new TextDecoder().decode(body));
      } catch {
        return new Response("invalid interaction", { status: 400 });
      }
      if (interaction?.type === 1) return Response.json({ type: 1 });
      if (interaction?.type !== 2) return new Response("unhandled", { status: 400 });
      const who = interaction.member?.user?.id || interaction.user?.id;
      if (!who || !(env.ALLOWED_USERS || "").split(",").some((id) => id.trim() === who)) {
        return slashReply("not on the allowlist", true);
      }
      if (DATABASE_COMMANDS.has(interaction.data?.name)) {
        ctx.waitUntil(finishDatabaseCommand(interaction, env));
        return Response.json({ type: 5, data: { flags: 64 } });
      }
      return safelyHandleSlash(interaction, env);
    }
    const head = request.method === "HEAD";
    if (!head && request.method !== "GET") return new Response("method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    if (slug.toLowerCase() === "health") return new Response(head ? null : "ok");
    if (!slug) return new Response(head ? null : LANDING, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (slug.includes("/")) return new Response(head ? null : "unknown short link", { status: 404 });
    try {
      const { rows } = await turso(env, LOOKUP_LINK, [slug]);
      const target = linkTarget(rows[0]?.[0]);
      if (target) return Response.redirect(target, 302);
      return new Response(head ? null : "unknown short link", { status: 404 });
    } catch {
      return new Response(head ? null : "short-link database unavailable", { status: 503 });
    }
  },
};
