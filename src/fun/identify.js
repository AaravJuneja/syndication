const { baconDecode } = require("./bacon.js");

const MODES = {
  full: { maxInput: 4000, fitSample: 400, refineSample: 300, periods: 4, passes: 2 },
  fast: { maxInput: 1200, fitSample: 240, refineSample: 200, periods: 3, passes: 1 },
};

const EN_PCT = [8.2, 1.5, 2.8, 4.3, 12.7, 2.2, 2.0, 6.1, 7.0, 0.15, 0.77, 4.0, 2.4, 6.7, 7.5, 1.9, 0.1, 6.0, 6.3, 9.1, 2.8, 1.0, 2.4, 0.15, 2.0, 0.07];
const EN_SUM = EN_PCT.reduce((a, b) => a + b, 0);
const EN = EN_PCT.map((x) => x / EN_SUM);

const TOP_BIGRAMS = new Set(
  "TH HE IN ER AN RE ON AT EN ND TI ES OR TE OF ED IS IT AL AR ST TO NT NG SE HA AS OU IO LE VE CO ME DE HI RI RO IC NE EA RA CE LI CH LL BE MA SI OM UR".split(" ")
);

const COMMON_WORDS = new Set(
  (
    "a i the of and to in is it you that he was for on are as with his they at be this have from or one had by " +
    "but not what all were we when your can said there use an each which she do how their if will up other about " +
    "out many then them these so some her would make like him into time has look two more go see no way could my " +
    "than first been call who its now find long down day did get come made may part over new after only our " +
    "know just where most very me back give good any well also because here why off went old us should those " +
    "think also work even want great little house night light under never place water small found still every " +
    "between again right while thing help home city north south east west gate send money letter number hidden " +
    "treasure enemy army king queen castle bridge river road door open close stop start begin end lost safe " +
    "friend please thank yes name life love death war peace today tomorrow morning evening dark black white " +
    "red blue green gold silver dog cat big man men woman child best worst times age wall fire attack defend " +
    "flag hello world secret message key code cipher password dawn meet tonight answer"
  ).split(" ")
);

const MORSE = {
  ".-": "a", "-...": "b", "-.-.": "c", "-..": "d", ".": "e", "..-.": "f", "--.": "g", "....": "h", "..": "i",
  ".---": "j", "-.-": "k", ".-..": "l", "--": "m", "-.": "n", "---": "o", ".--.": "p", "--.-": "q", ".-.": "r",
  "...": "s", "-": "t", "..-": "u", "...-": "v", ".--": "w", "-..-": "x", "-.--": "y", "--..": "z",
  "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7",
  "---..": "8", "----.": "9", ".-.-.-": ".", "--..--": ",", "..--..": "?", "-.-.--": "!", "-..-.": "/",
  "-....-": "-", "-.--.": "(", "-.--.-": ")", "---...": ":", ".----.": "'", ".-..-.": "\"", ".--.-.": "@", "-...-": "=",
};

const BRAILLE = {
  "⠁": "a", "⠃": "b", "⠉": "c", "⠙": "d", "⠑": "e", "⠋": "f", "⠛": "g", "⠓": "h", "⠊": "i", "⠚": "j",
  "⠅": "k", "⠇": "l", "⠍": "m", "⠝": "n", "⠕": "o", "⠏": "p", "⠟": "q", "⠗": "r", "⠎": "s", "⠞": "t",
  "⠥": "u", "⠧": "v", "⠺": "w", "⠭": "x", "⠽": "y", "⠵": "z", "⠀": " ",
};

const POLY_SQUARE = "ABCDEFGHIKLMNOPQRSTUVWXYZ";
const TAP_SQUARE = "ABCDEFGHIJLMNOPQRSTUVWXYZ";
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const B91 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$%&()*+,./:;<=>?@[]^_`{|}~\"";
const AFFINE_A = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
const AFFINE_INV = [1, 9, 21, 15, 3, 19, 7, 23, 11, 5, 17, 25];

const HASH_LENGTHS = {
  32: "MD5, NTLM or MD4",
  40: "SHA-1 or RIPEMD-160",
  56: "SHA-224 or SHA3-224",
  64: "SHA-256, SHA3-256 or BLAKE2s",
  96: "SHA-384 or SHA3-384",
  128: "SHA-512, SHA3-512 or BLAKE2b",
};

function unit(x) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function round(x, d) {
  const m = Math.pow(10, d === undefined ? 3 : d);
  return Math.round(x * m) / m;
}

function lettersOf(s) {
  return String(s).toUpperCase().replace(/[^A-Z]/g, "");
}

function letterCounts(L) {
  const c = new Array(26).fill(0);
  for (let i = 0; i < L.length; i++) c[L.charCodeAt(i) - 65]++;
  return c;
}

function icFromCounts(c, n) {
  if (n < 2) return 0;
  let sum = 0;
  for (const x of c) sum += x * (x - 1);
  return sum / (n * (n - 1));
}

function icOf(L) {
  return icFromCounts(letterCounts(L), L.length);
}

function englishCorr(c, n) {
  if (!n) return 0;
  let m = 0;
  for (let i = 0; i < 26; i++) m += (c[i] / n) * EN[i];
  return m;
}

const BIGRAM_TABLE = new Uint8Array(676);
for (const bg of TOP_BIGRAMS) BIGRAM_TABLE[(bg.charCodeAt(0) - 65) * 26 + bg.charCodeAt(1) - 65] = 1;

function letterIndex(cp) {
  if (cp >= 65 && cp <= 90) return cp - 65;
  if (cp >= 97 && cp <= 122) return cp - 97;
  return -1;
}

function bigramCoverage(s) {
  const str = String(s);
  let pairs = 0;
  let hits = 0;
  let prev = -1;
  for (let i = 0; i < str.length; i++) {
    const x = letterIndex(str.charCodeAt(i));
    if (x >= 0 && prev >= 0) {
      pairs++;
      hits += BIGRAM_TABLE[prev * 26 + x];
    }
    prev = x;
  }
  return pairs ? hits / pairs : 0;
}

const TRIE_NEXT = [];
const TRIE_WORD = [0];
TRIE_NEXT.push(new Int32Array(26));
for (const w of COMMON_WORDS) {
  let node = 0;
  for (let i = 0; i < w.length; i++) {
    const x = w.charCodeAt(i) - 97;
    if (!TRIE_NEXT[node][x]) {
      TRIE_NEXT.push(new Int32Array(26));
      TRIE_WORD.push(0);
      TRIE_NEXT[node][x] = TRIE_NEXT.length - 1;
    }
    node = TRIE_NEXT[node][x];
  }
  TRIE_WORD[node] = 1;
}

function idxCoverage(idx, len) {
  let c = 0;
  let i = 0;
  while (i + 2 < len) {
    let node = 0;
    let hit = 0;
    for (let j = i; j < len; j++) {
      node = TRIE_NEXT[node][idx[j]];
      if (!node) break;
      if (TRIE_WORD[node] && j - i + 1 >= 3) hit = j - i + 1;
    }
    if (hit) {
      c += hit === 3 ? 1.5 : hit;
      i += hit;
    } else i++;
  }
  return len ? c / len : 0;
}

function idxStats(idx, len) {
  const counts = new Uint32Array(26);
  let hits = 0;
  for (let i = 0; i < len; i++) {
    counts[idx[i]]++;
    if (i) hits += BIGRAM_TABLE[idx[i - 1] * 26 + idx[i]];
  }
  let corr = 0;
  for (let x = 0; x < 26; x++) corr += counts[x] * EN[x];
  return { corr: len ? corr / len : 0, big: len > 1 ? hits / (len - 1) : 0, distinct: distinctOf(counts) };
}

function distinctOf(counts) {
  let d = 0;
  for (let x = 0; x < 26; x++) if (counts[x]) d++;
  return d;
}

function combineFit(corr, big, wordS, letters, distinct) {
  const freqS = unit((corr - 0.042) / (0.064 - 0.042));
  const bigS = unit((big - 0.1) / (0.33 - 0.1));
  let fit = 0.2 * freqS + 0.2 * bigS + 0.6 * wordS;
  if (letters < 12) fit *= 0.6 + 0.4 * (letters / 12);
  const expected = Math.min(10, Math.ceil(letters / 3));
  if (distinct < expected) fit *= distinct / expected;
  return fit;
}

function letterFit(idx, len) {
  if (len < 3) return 0;
  const st = idxStats(idx, len);
  return combineFit(st.corr, st.big, unit(idxCoverage(idx, len) / 0.55), len, st.distinct);
}

function englishFit(s) {
  const str = String(s);
  const idx = new Uint8Array(str.length);
  const counts = new Uint32Array(26);
  let len = 0;
  let pairs = 0;
  let hits = 0;
  let prev = -1;
  let visible = 0;
  let tokens = 0;
  let tokenChars = 0;
  let tokenHits = 0;
  let oneLetterHits = 0;
  let node = 0;
  let tokLen = 0;
  const endToken = () => {
    if (!tokLen) return;
    tokenChars += tokLen;
    if (node > 0 && TRIE_WORD[node]) {
      if (tokLen > 1) tokenHits += tokLen;
      else oneLetterHits++;
    }
    tokLen = 0;
    node = 0;
  };
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    const x = letterIndex(cp);
    if (x >= 0) {
      idx[len++] = x;
      counts[x]++;
      visible++;
      if (prev >= 0) {
        pairs++;
        hits += BIGRAM_TABLE[prev * 26 + x];
      }
      if (!tokLen) {
        tokens++;
        node = 0;
      }
      if (node >= 0) node = TRIE_NEXT[node][x] || -1;
      tokLen++;
    } else {
      if (cp === 39 && tokLen) {
        node = -1;
      } else {
        endToken();
      }
      if (cp !== 32 && cp !== 9 && cp !== 10 && cp !== 13) visible++;
    }
    prev = x;
  }
  endToken();
  if (len < 3) return 0;
  let corr = 0;
  for (let x = 0; x < 26; x++) corr += counts[x] * EN[x];
  corr /= len;
  const big = pairs ? hits / pairs : 0;
  const spaced = tokens >= 2 && len / tokens <= 12;
  if (spaced && tokens > 3) tokenHits += oneLetterHits;
  const wordS = spaced ? unit(tokenChars ? tokenHits / tokenChars / 0.45 : 0) : unit(idxCoverage(idx, len) / 0.55);
  let fit = combineFit(corr, big, wordS, len, distinctOf(counts));
  const alpha = len / (visible || 1);
  if (alpha < 0.75) fit *= alpha / 0.75;
  return round(fit, 3);
}

function entropy(s) {
  const m = new Map();
  let n = 0;
  for (const ch of s) {
    m.set(ch, (m.get(ch) || 0) + 1);
    n++;
  }
  let h = 0;
  for (const v of m.values()) h -= (v / n) * Math.log2(v / n);
  return n ? h : 0;
}

function readable(s) {
  if (!s) return false;
  let ok = 0;
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    n++;
    if (cp === 9 || cp === 10 || cp === 13 || (cp >= 32 && cp < 127) || (cp >= 160 && cp < 0xfff0)) ok++;
  }
  return ok / n >= 0.95;
}

function utf8(bytes) {
  if (!bytes || !bytes.length) return null;
  try {
    const s = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return readable(s) ? s : null;
  } catch {
    return null;
  }
}

function shift(s, n) {
  return String(s).replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + n) % 26 + 26) % 26 + base);
  });
}

function atbash(s) {
  return String(s).replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
  });
}

function affineDecode(s, ai, b) {
  return String(s).replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    const y = c.charCodeAt(0) - base;
    return String.fromCharCode(base + (((AFFINE_INV[ai] * (y - b)) % 26) + 26) % 26);
  });
}

function rot47(s) {
  return String(s).replace(/[!-~]/g, (c) => String.fromCharCode(33 + ((c.charCodeAt(0) - 33 + 47) % 94)));
}

function reverse(s) {
  return [...String(s)].reverse().join("");
}

function railDecode(s, rails, limit) {
  const str = String(s);
  const n = str.length;
  if (rails < 2 || n <= rails) return null;
  const period = 2 * rails - 2;
  const start = new Uint32Array(rails + 1);
  for (let i = 0; i < n; i++) {
    const m = i % period;
    start[(m < rails ? m : period - m) + 1]++;
  }
  for (let r = 1; r <= rails; r++) start[r] += start[r - 1];
  const take = limit && limit < n ? limit : n;
  let out = "";
  for (let i = 0; i < take; i++) {
    const m = i % period;
    out += str[start[m < rails ? m : period - m]++];
  }
  return out;
}

function base64Bytes(s) {
  let t = String(s).replace(/\s+/g, "");
  t = t.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(t)) return null;
  t = t.replace(/=+$/, "");
  if (t.length % 4 === 1) return null;
  const out = [];
  let buf = 0;
  let bits = 0;
  for (const ch of t) {
    buf = ((buf << 6) | B64.indexOf(ch)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return Uint8Array.from(out);
}

function base32Bytes(s) {
  const t = String(s).replace(/\s+/g, "").toUpperCase().replace(/=+$/, "");
  if (!t || !/^[A-Z2-7]+$/.test(t)) return null;
  const out = [];
  let buf = 0;
  let bits = 0;
  for (const ch of t) {
    buf = ((buf << 5) | B32.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return Uint8Array.from(out);
}

function hexBytes(s) {
  const t = String(s).replace(/0x|\\x/gi, "").replace(/[\s:,-]+/g, "");
  if (!t || t.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(t)) return null;
  const out = new Uint8Array(t.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function binaryBytes(s) {
  const t = String(s).replace(/\s+/g, "");
  if (!t || !/^[01]+$/.test(t) || t.length % 8 !== 0) return null;
  const out = new Uint8Array(t.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(t.slice(i * 8, i * 8 + 8), 2);
  return out;
}

function numberTokens(s) {
  const t = String(s).trim();
  if (!/^\d+(?:[\s,;.-]+\d+)+$/.test(t)) return null;
  return t.split(/[\s,;.-]+/);
}

function decimalText(s) {
  const toks = numberTokens(s);
  if (!toks) return null;
  const cps = toks.map(Number);
  if (cps.some((v) => v > 255)) return null;
  try {
    const out = String.fromCodePoint(...cps);
    return readable(out) ? out : null;
  } catch {
    return null;
  }
}

function octalText(s) {
  const toks = String(s).trim().split(/[\s,]+/);
  if (toks.length < 2 || !toks.every((t) => /^[0-7]{2,3}$/.test(t))) return null;
  const vals = toks.map((t) => parseInt(t, 8));
  if (vals.some((v) => v > 255)) return null;
  return utf8(Uint8Array.from(vals));
}

function a1z26Text(s) {
  const toks = numberTokens(s);
  if (!toks) return null;
  const vals = toks.map(Number);
  if (vals.some((v) => v < 1 || v > 26)) return null;
  return vals.map((v) => String.fromCharCode(96 + v)).join("");
}

function a85Bytes(s) {
  let t = String(s).replace(/\s+/g, "");
  const wrapped = t.startsWith("<~") && t.endsWith("~>");
  if (wrapped) t = t.slice(2, -2);
  if (!t || !/^[!-uz]+$/.test(t)) return null;
  const out = [];
  let group = [];
  const flush = (g) => {
    const k = g.length;
    let v = 0;
    for (let i = 0; i < 5; i++) v = v * 85 + (i < k ? g[i] : 84);
    if (v > 4294967295) return false;
    const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    for (let i = 0; i < k - 1; i++) out.push(b[i]);
    return true;
  };
  for (const c of t) {
    if (c === "z") {
      if (group.length) return null;
      out.push(0, 0, 0, 0);
      continue;
    }
    group.push(c.charCodeAt(0) - 33);
    if (group.length === 5) {
      if (!flush(group)) return null;
      group = [];
    }
  }
  if (group.length === 1) return null;
  if (group.length && !flush(group)) return null;
  return Uint8Array.from(out);
}

function base58Bytes(s) {
  const t = String(s).trim();
  if (!t || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(t)) return null;
  let n = 0n;
  for (const c of t) n = n * 58n + BigInt(B58.indexOf(c));
  const out = [];
  while (n > 0n) {
    out.unshift(Number(n % 256n));
    n /= 256n;
  }
  let ones = 0;
  while (ones < t.length && t[ones] === "1") ones++;
  return Uint8Array.from(new Array(ones).fill(0).concat(out));
}

function base91Bytes(s) {
  const t = String(s).replace(/\s+/g, "");
  if (!t) return null;
  const out = [];
  let v = -1;
  let queue = 0;
  let nbits = 0;
  for (const c of t) {
    const d = B91.indexOf(c);
    if (d < 0) return null;
    if (v < 0) {
      v = d;
      continue;
    }
    v += d * 91;
    queue |= v << nbits;
    nbits += (v & 8191) > 88 ? 13 : 14;
    while (nbits > 7) {
      out.push(queue & 255);
      queue >>>= 8;
      nbits -= 8;
    }
    v = -1;
  }
  if (v >= 0) out.push((queue | (v << nbits)) & 255);
  return Uint8Array.from(out);
}

function base100Text(s) {
  const bytes = [];
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (/\s/.test(ch)) continue;
    if (cp < 0x1f3f7 || cp > 0x1f4f6) return null;
    bytes.push(cp - 0x1f3f7);
  }
  return bytes.length ? utf8(Uint8Array.from(bytes)) : null;
}

function morseText(s) {
  const t = String(s)
    .replace(/[•·∙]/g, ".")
    .replace(/[−–—_]/g, "-")
    .replace(/[|\\]/g, "/")
    .trim();
  if (!/^[.\-/\s]+$/.test(t) || !/[.-]/.test(t)) return null;
  const words = t.split("/").map((w) => w.trim()).filter(Boolean);
  let unknown = 0;
  let total = 0;
  const out = words.map((w) =>
    w.split(/\s+/).map((tok) => {
      total++;
      if (MORSE[tok]) return MORSE[tok];
      unknown++;
      return "?";
    }).join("")
  );
  return { text: out.join(" "), unknown, total };
}

function brailleText(s) {
  let out = "";
  let hits = 0;
  let total = 0;
  for (const ch of String(s)) {
    if (/\s/.test(ch)) {
      out += " ";
      continue;
    }
    total++;
    if (BRAILLE[ch]) {
      out += BRAILLE[ch];
      hits++;
    } else out += "?";
  }
  return total ? { text: out, hits, total } : null;
}

function squareText(s, square) {
  const d = String(s).replace(/\s+/g, "");
  if (!d || d.length % 2 !== 0 || !/^[1-5]+$/.test(d)) return null;
  let out = "";
  for (let i = 0; i < d.length; i += 2) out += square[(+d[i] - 1) * 5 + (+d[i + 1] - 1)];
  return out.toLowerCase();
}

function urlText(s) {
  if (!/%[0-9a-fA-F]{2}/.test(s)) return null;
  try {
    const out = decodeURIComponent(s.replace(/\+/g, " "));
    return out !== s ? out : null;
  } catch {
    return null;
  }
}

function htmlText(s) {
  if (!/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/.test(s)) return null;
  const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try {
        return String.fromCodePoint(n);
      } catch {
        return m;
      }
    }
    return named[e.toLowerCase()] !== undefined ? named[e.toLowerCase()] : m;
  });
}

function escapeText(s) {
  if (!/\\(u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\}|x[0-9a-fA-F]{2})/.test(s)) return null;
  try {
    return s
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (m, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\x([0-9a-fA-F]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  } catch {
    return null;
  }
}

function qpText(s) {
  if (!/=[0-9A-F]{2}/.test(s)) return null;
  const t = s.replace(/=\r?\n/g, "");
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "=") {
      const h = t.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(h)) return null;
      out.push(parseInt(h, 16));
      i += 2;
    } else {
      const cp = t.charCodeAt(i);
      if (cp > 126) return null;
      out.push(cp);
    }
  }
  return utf8(Uint8Array.from(out));
}

function uuText(s) {
  const lines = String(s).split(/\r?\n/).filter((l) => l && !/^begin\s/i.test(l) && l !== "end" && l !== "`");
  if (!lines.length) return null;
  const out = [];
  for (const line of lines) {
    const val = (c) => (c === "`" || c === " " ? 0 : c.charCodeAt(0) - 32);
    const n = val(line[0]);
    if (n < 0 || n > 45) return null;
    const data = line.slice(1, Math.ceil(n / 3) * 4 + 1);
    if (data.length < Math.ceil(n / 3) * 4) return null;
    const before = out.length;
    for (let i = 0; i < data.length; i += 4) {
      const v = [0, 1, 2, 3].map((j) => val(data[i + j]));
      if (v.some((x) => x < 0 || x > 63)) return null;
      const trip = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
      out.push((trip >>> 16) & 255, (trip >>> 8) & 255, trip & 255);
    }
    out.length = before + n;
  }
  return utf8(Uint8Array.from(out));
}

function bestSingleByteXor(input, sampleSize) {
  const bytes = input.length > (sampleSize || 300) ? input.slice(0, sampleSize || 300) : input;
  const ranked = [];
  for (let k = 1; k < 256; k++) {
    let bad = 0;
    let good = 0;
    for (let i = 0; i < bytes.length; i++) {
      const x = bytes[i] ^ k;
      if ((x < 32 || x > 126) && x !== 9 && x !== 10 && x !== 13) bad++;
      else if (x === 32 || letterIndex(x) >= 0) good++;
    }
    if (bad <= bytes.length * 0.05) ranked.push({ k, good });
  }
  ranked.sort((a, b) => b.good - a.good);
  let best = null;
  for (const { k } of ranked.slice(0, 4)) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] ^ k);
    const fit = englishFit(s);
    if (!best || fit > best.fit) best = { key: k, text: s, fit };
  }
  return best;
}

function periodScan(L, maxP) {
  const rows = [];
  const limit = Math.min(maxP || 20, Math.floor(L.length / 8));
  const idx = new Uint8Array(L.length);
  for (let i = 0; i < L.length; i++) idx[i] = L.charCodeAt(i) - 65;
  for (let p = 1; p <= limit; p++) {
    const counts = new Uint32Array(p * 26);
    const sizes = new Uint32Array(p);
    for (let i = 0; i < idx.length; i++) {
      const col = i % p;
      counts[col * 26 + idx[i]]++;
      sizes[col]++;
    }
    let sum = 0;
    for (let col = 0; col < p; col++) {
      const n = sizes[col];
      if (n < 2) continue;
      let acc = 0;
      for (let x = 0; x < 26; x++) {
        const v = counts[col * 26 + x];
        acc += v * (v - 1);
      }
      sum += acc / (n * (n - 1));
    }
    rows.push({ length: p, ic: sum / p });
  }
  return rows;
}

function pickPeriod(rows) {
  const multi = rows.filter((r) => r.length >= 2);
  if (!multi.length) return null;
  const firm = multi.find((r) => r.ic >= 0.058);
  if (firm) return firm;
  const best = multi.reduce((a, b) => (b.ic > a.ic ? b : a));
  return best.ic >= 0.05 ? best : null;
}

function columnScores(L, p, mode) {
  const table = [];
  for (let col = 0; col < p; col++) {
    const c = new Array(26).fill(0);
    let n = 0;
    for (let i = col; i < L.length; i += p) {
      c[L.charCodeAt(i) - 65]++;
      n++;
    }
    const scores = [];
    for (let k = 0; k < 26; k++) {
      let m = 0;
      for (let x = 0; x < 26; x++) {
        const plain = mode === "beaufort" ? (k - x + 26) % 26 : (x - k + 26) % 26;
        m += c[x] * EN[plain];
      }
      scores.push({ k, m });
    }
    scores.sort((a, b) => b.m - a.m);
    table.push(scores);
  }
  return table;
}

function refinePeriodicKey(L, table, mode, sampleSize, passes) {
  const k = table.map((col) => col[0].k);
  const p = k.length;
  const len = Math.min(L.length, sampleSize || 300);
  const src = new Uint8Array(len);
  for (let i = 0; i < len; i++) src[i] = L.charCodeAt(i) - 65;
  const out = new Uint8Array(len);
  const score = () => {
    for (let i = 0; i < len; i++) {
      const x = src[i];
      const kk = k[i % p];
      out[i] = mode === "beaufort" ? (kk - x + 26) % 26 : (x - kk + 26) % 26;
    }
    return letterFit(out, len);
  };
  let bestFit = score();
  if (p > 16) return { key: k, fit: bestFit };
  for (let pass = 0; pass < (passes || 2); pass++) {
    let improved = false;
    for (let pos = 0; pos < p; pos++) {
      const start = k[pos];
      let bestV = start;
      for (const { k: v } of table[pos].slice(0, 4)) {
        if (v === start) continue;
        k[pos] = v;
        const fit = score();
        if (fit > bestFit + 0.001) {
          bestFit = fit;
          bestV = v;
        }
      }
      k[pos] = bestV;
      if (bestV !== start) improved = true;
    }
    if (!improved) break;
  }
  return { key: k, fit: bestFit };
}

function applyPeriodic(s, key, mode) {
  let i = 0;
  return String(s).replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    const x = ch.charCodeAt(0) - base;
    const k = key[i++ % key.length];
    const p = mode === "beaufort" ? (k - x + 26) % 26 : (x - k + 26) % 26;
    return String.fromCharCode(base + p);
  });
}

function charsetSummary(s) {
  const parts = [];
  if (/[A-Z]/.test(s)) parts.push("A-Z");
  if (/[a-z]/.test(s)) parts.push("a-z");
  if (/[0-9]/.test(s)) parts.push("0-9");
  const sym = [...new Set(s.replace(/[A-Za-z0-9\s]/g, ""))];
  if (sym.length) parts.push("symbols " + sym.slice(0, 12).join("") + (sym.length > 12 ? "…" : ""));
  if (/\s/.test(s)) parts.push("whitespace");
  return parts.join(", ") || "empty";
}

function modeOf(opts) {
  return MODES[(opts && opts.mode) || "full"] || MODES.full;
}

function analyze(text, opts) {
  return scan(text, opts).stats;
}

function scan(text, opts) {
  const mode = modeOf(opts);
  const raw = String(text || "");
  const s = raw.length > mode.maxInput ? raw.slice(0, mode.maxInput) : raw;
  const L = lettersOf(s);
  const counts = letterCounts(L);
  const rows = L.length >= 20 ? periodScan(L, 20) : [];
  const period = pickPeriod(rows);
  const stats = {
    length: raw.length,
    analyzed: s.length,
    letters: L.length,
    ic: round(icFromCounts(counts, L.length), 4),
    englishCorr: round(englishCorr(counts, L.length), 4),
    entropy: round(entropy(s), 2),
    englishFit: englishFit(s.length > mode.fitSample ? s.slice(0, mode.fitSample) : s),
    fitSample: Math.min(s.length, mode.fitSample),
    period: period && period.length > 1 ? { length: period.length, ic: round(period.ic, 4) } : null,
    charset: charsetSummary(s),
  };
  return { stats, rows };
}

const TAIL_ALPHABETS = {
  base64: /[A-Za-z0-9+/=_-]/,
  base32: /[A-Za-z2-7=]/,
  hex: /[0-9a-fA-Fx\\:,-]/,
  binary: /[01]/,
  octal: /[0-7,]/,
  decimal: /[0-9,;.-]/,
  a1z26: /[0-9,;.-]/,
  morse: /[.\-/|\\•·∙−–—_]/,
  bacon: /[abAB01/]/,
  polybius: /[1-5,;]/,
  tap: /[1-5.]/,
  adfgvx: /[ADFGVX]/,
  adfgx: /[ADFGX]/,
  brainfuck: /[+\-<>[\].,]/,
};

function confidenceOf(score) {
  if (score >= 80) return "strong";
  if (score >= 55) return "likely";
  if (score >= 30) return "possible";
  return "weak";
}

function clip(s, n) {
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function looksEncoded(s) {
  const t = String(s).trim();
  if (t.length < 4) return false;
  return (
    (/^[A-Za-z0-9+/]+={0,2}$/.test(t) && t.length % 4 === 0 && /[0-9+/=]/.test(t)) ||
    /^(?:[0-9a-fA-F]{2}\s?){4,}$/.test(t) ||
    /^[01\s]{16,}$/.test(t) ||
    /^[.\-/\s]{6,}$/.test(t) ||
    /^[A-Z2-7]+=*$/.test(t)
  );
}

function decodedBonus(text) {
  const fit = englishFit(text.length > 400 ? text.slice(0, 400) : text);
  if (fit >= 0.5) return { bonus: 25, note: "decoded text reads as English (fit " + fit + ")" };
  if (looksEncoded(text)) return { bonus: 18, note: "decoded text looks like another encoded layer, try ts auto" };
  if (/[A-Za-z]{3}/.test(text)) return { bonus: 8, note: "decodes to readable text" };
  return { bonus: 0, note: "decodes to printable text" };
}

function identify(text, opts) {
  const options = opts || {};
  const mode = modeOf(options);
  const raw = String(text || "");
  const s = (raw.length > mode.maxInput ? raw.slice(0, mode.maxInput) : raw).trim();
  const scanned = scan(raw, options);
  const stats = scanned.stats;
  const found = new Map();
  const add = (c) => {
    c.score = Math.max(0, Math.min(99, Math.round(c.score)));
    c.confidence = confidenceOf(c.score);
    c.evidence = c.evidence || [];
    c.caveats = c.caveats || [];
    const prev = found.get(c.id);
    if (!prev || prev.score < c.score) found.set(c.id, c);
  };
  if (!s) return { stats, candidates: [] };

  const compact = s.replace(/\s+/g, "");
  const L = lettersOf(s);
  const n = L.length;
  const onlyLetters = /^[A-Za-z\s]+$/.test(s);
  const letterish = n >= 0.8 * compact.length;
  const baseFit = stats.englishFit;
  const fitP = (t) => englishFit(t.length > mode.fitSample ? t.slice(0, mode.fitSample) : t);
  const sampled = s.length > mode.fitSample;
  const checkedOn = sampled ? " (read-checked on the first " + mode.fitSample + " chars)" : "";

  const encoding = (id, name, struct, evidence, decoded, next, caveats, requireDecode) => {
    if (!decoded && requireDecode) return;
    let score = struct;
    const ev = evidence.slice();
    if (decoded) {
      const b = decodedBonus(decoded);
      score += 25 + b.bonus;
      ev.push(b.note);
    } else {
      score *= 0.55;
      ev.push("did not decode to readable text");
    }
    add({ id, name, family: "encoding", score, evidence: ev, caveats, preview: decoded ? clip(decoded, 140) : undefined, next });
  };

  const jwt = s.match(/^([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]{8,})\.([A-Za-z0-9_-]*)$/);
  if (jwt) {
    const header = utf8(base64Bytes(jwt[1]));
    const payload = utf8(base64Bytes(jwt[2]));
    let alg = null;
    try {
      alg = header ? JSON.parse(header).alg : null;
    } catch {}
    if (alg !== null && alg !== undefined) {
      add({
        id: "jwt",
        name: "JSON Web Token",
        family: "format",
        score: 96,
        evidence: ["three base64url segments", "header is JSON with alg " + alg],
        caveats: ["signature is not verified here"],
        preview: payload ? clip(payload, 140) : undefined,
        next: "ts jwt <token>",
      });
    }
  }

  if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(s)) {
    add({ id: "hash-bcrypt", name: "bcrypt hash", family: "hash", score: 95, evidence: ["$2x$cost$ prefix with 53 char salt+hash"], caveats: ["one-way, not decodable"], next: "ts hashid <hash>" });
  } else if (/^\$(1|5|6|argon2(id|i|d)|y)\$/.test(s)) {
    add({ id: "hash-crypt", name: "crypt(3) style password hash", family: "hash", score: 90, evidence: ["modular crypt prefix " + s.split("$")[1]], caveats: ["one-way, not decodable"], next: "ts hashid <hash>" });
  }

  const hex = hexBytes(s);
  if (hex) {
    const digits = compact.replace(/0x|\\x/gi, "").replace(/[:,-]/g, "");
    const decoded = utf8(hex);
    const hashName = HASH_LENGTHS[digits.length];
    const mixed = /[a-fA-F]/.test(digits) && /[0-9]/.test(digits);
    const bitsOnly = /^[01]+$/.test(digits);
    encoding("hex", "Hexadecimal bytes", bitsOnly ? 15 : mixed ? 45 : 30, ["only 0-9 a-f, " + digits.length + " digits (even)"], decoded, "ts hex decode <text>", [], !mixed);
    if (hashName && !decoded) {
      add({ id: "hash", name: "Hash digest (" + hashName + ")", family: "hash", score: 72, evidence: [digits.length + " hex digits = " + digits.length * 4 + " bits", "bytes are not text"], caveats: ["one-way, the length only narrows the algorithm"], next: "ts hashid <hash>" });
    }
    if (!bitsOnly && hex.length >= 6 && (!decoded || fitP(decoded) < 0.3)) {
      const x = bestSingleByteXor(hex, mode.fitSample);
      if (x && x.fit >= 0.5) {
        add({ id: "xor1", name: "Single-byte XOR over hex", family: "stream", score: 50 + 45 * x.fit, evidence: ["hex bytes are not text on their own", "XOR with 0x" + x.key.toString(16).padStart(2, "0") + " gives English-like text (fit " + x.fit + ")"], preview: clip(x.text, 140), next: "ts xorbrute <hex>" });
      }
    }
  }

  const bin = binaryBytes(s);
  if (bin) encoding("binary", "Binary (8-bit ASCII)", 60, ["only 0/1, " + compact.length + " bits = " + bin.length + " bytes"], utf8(bin), "ts bin decode <text>");

  const oct = /^[0-7\s,]+$/.test(s) ? octalText(s) : null;
  if (oct) encoding("octal", "Octal bytes", 55, ["groups of 2-3 octal digits, all ≤ 377"], oct);

  const nums = numberTokens(s);
  if (nums) {
    const vals = nums.map(Number);
    const a1 = a1z26Text(s);
    if (a1) encoding("a1z26", "A1Z26 (letter numbers)", 55, ["all " + vals.length + " numbers are 1-26"], a1, "ts a1z26 <numbers>");
    const dec = decimalText(s);
    if (dec && vals.every((v) => v >= 9)) encoding("decimal", "Decimal character codes", vals.every((v) => v >= 32 && v <= 126) ? 55 : 40, ["numbers fall in character code range"], dec, "ts dec <numbers>");
    if (vals.length >= 4 && vals.every((v) => v >= 22 && v <= 110) && vals.some((v) => v > 55)) {
      add({ id: "nihilist", name: "Nihilist cipher", family: "polybius", score: 35, evidence: ["two digit sums between 22 and 110, the range of Polybius sums"], caveats: ["needs both the square key and the keyword", "no ts command yet"] });
    }
  }

  const digits15 = compact.replace(/[,;]/g, "");
  if (/^[1-5]+$/.test(digits15) && digits15.length >= 4 && digits15.length % 2 === 0) {
    const poly = squareText(digits15, POLY_SQUARE);
    const tap = squareText(digits15, TAP_SQUARE);
    const polyFit = fitP(poly);
    const tapFit = fitP(tap);
    add({ id: "polybius", name: "Polybius square (row/column digits)", family: "polybius", score: 50 + 40 * polyFit, evidence: ["only digits 1-5, " + digits15.length / 2 + " pairs", "standard square reads " + clip(poly, 40)], caveats: ["a keyed square or column-first order changes the reading"], preview: clip(poly, 140), next: "ts polybius decode <digits>" });
    add({ id: "tap", name: "Tap code", family: "polybius", score: 45 + 40 * tapFit, evidence: ["only digits 1-5 in pairs", "tap square (K as C) reads " + clip(tap, 40)], preview: clip(tap, 140), next: "ts tap decode <pairs>" });
  }
  const tapDots = s.match(/^\.+(?:\s+\.+)+$/);
  if (tapDots) {
    const groups = s.trim().split(/\s+/).map((g) => g.length);
    if (groups.length % 2 === 0 && groups.every((g) => g <= 5)) {
      const pairs = groups.join("");
      const tap = squareText(pairs, TAP_SQUARE);
      add({ id: "tap", name: "Tap code (dot groups)", family: "polybius", score: 60 + 35 * fitP(tap), evidence: ["groups of 1-5 dots in pairs"], preview: clip(tap, 140), next: "ts tap decode " + groups.join(" ") });
    }
  }

  const morse = morseText(s);
  if (morse && morse.total >= 2) {
    const ratio = 1 - morse.unknown / morse.total;
    add({ id: "morse", name: "Morse code", family: "encoding", score: 45 + 30 * ratio + 20 * fitP(morse.text), evidence: ["only dots, dashes and separators", Math.round(ratio * 100) + "% of " + morse.total + " symbols are valid Morse"], preview: clip(morse.text, 140), next: "ts morse decode <text>" });
  }

  const ab = compact.replace(/\//g, "");
  const twoSymbols = (/^[abAB]+$/.test(ab) && /[aA]/.test(ab) && /[bB]/.test(ab)) || (/^[01]+$/.test(ab) && /0/.test(ab) && /1/.test(ab));
  if (ab.length >= 10 && ab.length % 5 === 0 && twoSymbols) {
    const d24 = baconDecode(s, { variant: 24 });
    const d26 = baconDecode(s, { variant: 26 });
    const f24 = d24 && !d24.includes("?") ? fitP(d24) : 0;
    const f26 = d26 && !d26.includes("?") ? fitP(d26) : 0;
    const use26 = f26 > f24 + 0.05;
    const text = use26 ? d26 : d24;
    const fit = use26 ? f26 : f24;
    const binaryPenalty = /^[01]+$/.test(ab) && ab.length % 8 === 0 ? 15 : 0;
    add({
      id: "bacon",
      name: "Baconian cipher (" + (use26 ? "26" : "24") + "-letter table)",
      family: "substitution",
      score: 50 + 45 * fit - binaryPenalty,
      evidence: ["two symbols only, " + ab.length / 5 + " groups of 5", text ? "decodes to " + clip(text, 40) : "some groups fall outside the table"],
      caveats: binaryPenalty ? ["length is also a multiple of 8, so 8-bit binary is possible"] : [],
      preview: text ? clip(text, 140) : undefined,
      next: "ts bacon decode " + (use26 ? "v=26 " : "") + "<text>",
    });
  }

  if (/^[ADFGVX\s]+$/.test(s) && compact.length >= 8 && compact.length % 2 === 0) {
    const v = /V/.test(s);
    add({ id: v ? "adfgvx" : "adfgx", name: v ? "ADFGVX cipher" : "ADFGX cipher", family: "fractionation", score: 72, evidence: ["only the letters " + (v ? "A D F G V X" : "A D F G X") + ", even length " + compact.length], caveats: ["needs the square key and the transposition keyword"], next: "ts " + (v ? "adfgvx" : "adfgx") + " decode sq=KEY k=WORD <text>" });
  }

  const b32 = /^[A-Z2-7]+=*$/.test(compact) && compact.length >= 8 ? base32Bytes(compact) : null;
  if (b32) {
    const padded = compact.length % 8 === 0;
    encoding("base32", "Base32", padded ? 50 : 30, ["only A-Z and 2-7" + (padded ? ", length multiple of 8" : "")], utf8(b32), "ts b32 decode <text>", [], !/[2-7=]/.test(compact));
  }

  const b64 = /^[A-Za-z0-9+/_-]+={0,2}$/.test(compact) && compact.length >= 4 ? base64Bytes(compact) : null;
  if (b64) {
    const decoded = utf8(b64);
    const urlSafe = /[-_]/.test(compact);
    let struct = 30;
    const ev = ["only base64" + (urlSafe ? "url" : "") + " alphabet"];
    if (compact.length % 4 === 0) {
      struct += 10;
      ev.push("length " + compact.length + " is a multiple of 4");
    }
    if (/=$/.test(compact)) {
      struct += 8;
      ev.push("= padding");
    }
    if (/[a-z]/.test(compact) && /[A-Z]/.test(compact) && /[0-9]/.test(compact)) struct += 5;
    if (hex) struct -= 20;
    if (onlyLetters && !decoded) struct -= 10;
    encoding("base64", urlSafe ? "Base64url" : "Base64", struct, ev, decoded, "ts b64 decode <text>", [], onlyLetters || !!hex);
  }

  const a85 = /^(<~)?[!-uz\s]+(~>)?$/.test(s) && compact.length >= 5 ? a85Bytes(s) : null;
  if (a85) {
    const wrapped = /^<~[\s\S]*~>$/.test(compact);
    const punct = (compact.match(/[!-/:-@[-`]/g) || []).length / compact.length;
    if (wrapped || punct > 0.15) encoding("ascii85", "Ascii85", wrapped ? 70 : 30, [wrapped ? "wrapped in <~ ~>" : "characters ! to u with heavy punctuation"], utf8(a85), "ts a85 decode <text>", [], !wrapped);
  }

  if (/^[1-9A-HJ-NP-Za-km-z]{6,}$/.test(compact) && !hex) {
    const d = utf8(base58Bytes(compact));
    if (d) encoding("base58", "Base58", 30, ["alphanumeric without 0 O I l"], d, "ts b58 decode <text>");
  }

  if (compact.length >= 6 && /[!#$%&()*,.:;<=>?@[\]^_`{|}~"]/.test(compact) && [...compact].every((c) => B91.includes(c))) {
    const d = utf8(base91Bytes(compact));
    if (d) encoding("base91", "Base91", 25, ["only base91 alphabet with punctuation"], d, "ts b91 decode <text>");
  }

  const b100 = base100Text(s);
  if (b100) encoding("base100", "Base100 (emoji)", 70, ["every symbol is in the base100 emoji block"], b100, "ts b100 decode <text>");

  const url = urlText(s);
  if (url) encoding("url", "URL percent encoding", 50, ["%XX escapes"], readable(url) ? url : null, "ts url decode <text>");
  const html = htmlText(s);
  if (html && html !== s) encoding("html", "HTML entities", 50, ["&name; or &#n; entities"], html, "ts html decode <text>");
  const esc = escapeText(s);
  if (esc && esc !== s) encoding("unicode-escape", "Unicode / hex escapes", 50, ["\\uXXXX or \\xXX escapes"], readable(esc) ? esc : null, "ts uni decode <text>");
  const qp = qpText(s);
  if (qp && qp !== s) encoding("quoted-printable", "Quoted-printable", 45, ["=XX byte escapes"], qp, "ts qp decode <text>");
  if (/^begin\s+\d{3}\s+\S+/m.test(s) || (/^[!-M`][ -`]{4,}$/m.test(s) && !/[a-z]/.test(s))) {
    const uu = uuText(s);
    if (uu) encoding("uuencode", "UUencode", /^begin/m.test(s) ? 70 : 35, [/^begin/m.test(s) ? "begin header line" : "length byte then 6-bit characters"], uu, "ts uu decode <text>");
  }

  const braille = /[\u2800-\u28ff]/.test(s) ? brailleText(s) : null;
  if (braille && braille.hits / braille.total >= 0.6) {
    add({ id: "braille", name: "Braille (Unicode)", family: "encoding", score: 70 + 25 * (braille.hits / braille.total), evidence: [braille.hits + " of " + braille.total + " symbols are Braille letters"], preview: clip(braille.text, 140), next: "ts braille decode <text>" });
  }

  const pigBoxes = (s.match(/[┘┴└├□┤┌┬┐]/g) || []).length;
  if (pigBoxes && /^[┘┴└├□┤┌┬┐∨∧<>·.\s]+$/.test(s)) {
    add({ id: "pigpen", name: "Pigpen (text glyphs)", family: "substitution", score: 82, evidence: ["only pigpen box and angle glyphs used by ts pigpen"], next: "ts pigpen decode <glyphs>" });
  }

  const zw = (raw.match(/[\u200b\u200c\u200d\u2060\ufeff]/g) || []).length;
  if (zw >= 4) {
    add({ id: "zero-width", name: "Zero-width character steganography", family: "steganography", score: 85, evidence: [zw + " zero-width characters hidden in the text"], caveats: ["several incompatible zero-width schemes exist"], next: "ts zw <text>" });
  }

  if (/^[+\-<>[\].,\s]+$/.test(s) && compact.length >= 8 && /[[\].]/.test(s)) {
    add({ id: "brainfuck", name: "Brainfuck program", family: "esolang", score: 88, evidence: ["only the eight Brainfuck operators"], next: "ts bf <code>" });
  }
  const ookToks = s.match(/ook[.?!]/gi) || [];
  if (ookToks.length >= 4 && ookToks.join("").length >= compact.length * 0.9) {
    add({ id: "ook", name: "Ook! program", family: "esolang", score: 92, evidence: [ookToks.length + " Ook tokens"], next: "ts ook <code>" });
  }
  const cowToks = s.match(/moo|mOo|moO|mOO|Moo|MOo|MoO|MOO|OOO|MMM|OOM|oom/g) || [];
  if (cowToks.length >= 3 && cowToks.length * 3 >= compact.length * 0.9) {
    add({ id: "cow", name: "COW program", family: "esolang", score: 88, evidence: [cowToks.length + " moo tokens"], next: "ts cow run <code>" });
  }
  if (/^[idsoh]+$/.test(compact) && compact.length >= 5 && /o/.test(compact)) {
    add({ id: "deadfish", name: "Deadfish program", family: "esolang", score: 55, evidence: ["only the letters i d s o"], next: "ts deadfish run <code>" });
  }
  if (/^[STL]+$/.test(compact) && compact.length >= 12 && /S/.test(compact) && /T/.test(compact) && /L/.test(compact)) {
    add({ id: "whitespace", name: "Whitespace program (S/T/L letters)", family: "esolang", score: 55, evidence: ["only S, T and L"], next: "ts ws decode <program>" });
  }

  const visible = compact.length;
  const symbolShare = visible ? (compact.match(/[!-/:-@[-`{-~]/g) || []).length / visible : 0;
  if (symbolShare > 0.12 && /^[!-~\s]+$/.test(s)) {
    const r = rot47(s.slice(0, mode.fitSample));
    const fit = englishFit(r);
    if (fit >= 0.5 && fit > baseFit + 0.15) {
      add({ id: "rot47", name: "ROT47", family: "rotation", score: 55 + 42 * fit, evidence: ["dense ASCII punctuation", "ROT47 gives English-like text (fit " + fit + ")"], preview: clip(r, 140), next: "ts rot47 <text>" });
    }
  }

  const distinct = new Set(L).size;
  const crowded = (fits, best) => fits.filter((f) => f >= best - 0.08).length > 1;
  const structured = [...found.values()].some((c) => c.score >= 70);
  if (n >= 4 && letterish && distinct >= 5 && !structured) {
    const probe = sampled ? s.slice(0, mode.fitSample) : s;
    const pc = letterCounts(lettersOf(probe));
    const corrOf = (map) => {
      let m = 0;
      for (let x = 0; x < 26; x++) m += pc[x] * EN[map(x)];
      return m;
    };

    const shiftRank = [];
    for (let k = 1; k < 26; k++) shiftRank.push({ k, m: corrOf((x) => (x + k) % 26) });
    shiftRank.sort((a, b) => b.m - a.m);
    const shiftChecked = shiftRank.slice(0, 3).map(({ k }) => {
      const out = shift(probe, k);
      return { k, out, fit: englishFit(out) };
    });
    const best = shiftChecked.reduce((a, b) => (b.fit > a.fit ? b : a));
    if (best.fit >= 0.45 && best.fit > baseFit + 0.15) {
      const close = crowded(shiftChecked.map((c) => c.fit), best.fit);
      const rot13 = best.k === 13;
      add({
        id: rot13 ? "rot13" : "caesar",
        name: rot13 ? "ROT13" : "Caesar shift (decode with rot " + best.k + ")",
        family: "rotation",
        score: 55 + 42 * best.fit - (close ? 20 : 0),
        evidence: ["ranked all 25 shifts by letter frequency and read-checked the top 3" + checkedOn, "shift " + best.k + " gives English-like text (fit " + best.fit + ", original " + baseFit + ")"],
        caveats: close ? ["another shift scores almost as well"] : [],
        preview: clip(best.out, 140),
        next: "ts rot " + best.k + " <text>",
      });
    }

    const at = atbash(probe);
    const atFit = englishFit(at);
    if (atFit >= 0.45 && atFit > baseFit + 0.15) {
      add({ id: "atbash", name: "Atbash", family: "substitution", score: 55 + 42 * atFit, evidence: ["mirroring the alphabet gives English-like text (fit " + atFit + ")" + checkedOn], preview: clip(at, 140), next: "ts atbash <text>" });
    }

    if (n >= 8) {
      const affRank = [];
      for (let ai = 1; ai < AFFINE_A.length; ai++) {
        for (let b = 0; b < 26; b++) {
          if (AFFINE_A[ai] === 25 && b === 25) continue;
          affRank.push({ ai, b, m: corrOf((x) => (((AFFINE_INV[ai] * (x - b)) % 26) + 26) % 26) });
        }
      }
      affRank.sort((a, b) => b.m - a.m);
      const affChecked = affRank.slice(0, 4).map(({ ai, b }) => {
        const out = affineDecode(probe, ai, b);
        return { a: AFFINE_A[ai], b, out, fit: englishFit(out) };
      });
      const bestAff = affChecked.reduce((x, y) => (y.fit > x.fit ? y : x));
      if (bestAff.fit >= 0.55 && bestAff.fit > baseFit + 0.2) {
        const close = crowded(affChecked.map((c) => c.fit), bestAff.fit);
        add({ id: "affine", name: "Affine cipher (a=" + bestAff.a + ", b=" + bestAff.b + ")", family: "substitution", score: 52 + 42 * bestAff.fit - (close ? 20 : 0) - (n < 20 ? 10 : 0), evidence: ["ranked all 285 affine keys that are not shifts or Atbash by letter frequency and read-checked the top 4" + checkedOn, "a=" + bestAff.a + " b=" + bestAff.b + " gives English-like text (fit " + bestAff.fit + ")"], caveats: [close ? "another key scores almost as well" : "", n < 20 ? "short input, an affine match can be a coincidence" : ""].filter(Boolean), preview: clip(bestAff.out, 140), next: "ts affine <text>" });
      }
    }

    const rev = reverse(s).slice(0, mode.fitSample);
    const revFit = englishFit(rev);
    if (revFit >= 0.45 && revFit > baseFit + 0.15) {
      add({ id: "reverse", name: "Reversed text", family: "transposition", score: 55 + 42 * revFit, evidence: ["reading backwards gives English-like text (fit " + revFit + ")" + checkedOn], preview: clip(rev, 140), next: "ts rev <text>" });
    }

    if (n >= 12) {
      const maxRails = Math.min(10, s.length - 1);
      const railRank = [];
      for (let r = 2; r <= maxRails; r++) {
        const head = railDecode(s, r, mode.fitSample);
        if (!head) continue;
        railRank.push({ r, head, cov: bigramCoverage(head) });
      }
      railRank.sort((a, b) => b.cov - a.cov);
      const railChecked = railRank.slice(0, 3).map((x) => ({ r: x.r, out: x.head, fit: englishFit(x.head) }));
      const bestRail = railChecked.length ? railChecked.reduce((x, y) => (y.fit > x.fit ? y : x)) : null;
      if (bestRail && bestRail.fit >= 0.45 && bestRail.fit > baseFit + 0.2) {
        add({ id: "railfence", name: "Rail fence (" + bestRail.r + " rails)", family: "transposition", score: 55 + 42 * bestRail.fit - (crowded(railChecked.map((c) => c.fit), bestRail.fit) ? 20 : 0), evidence: ["ranked 2 to " + maxRails + " rails by common letter pairs and read-checked the top 3" + checkedOn, bestRail.r + " rails gives English-like text (fit " + bestRail.fit + ")"], preview: clip(bestRail.out, 140), next: "ts rail <text>" });
      }
    }
  }

  if (baseFit >= 0.55 && letterish) {
    add({ id: "plaintext", name: "Plain English (no cipher detected)", family: "plaintext", score: 35 + 55 * baseFit, evidence: ["already reads as English (fit " + baseFit + ")"] });
  }

  if (n >= 20 && letterish && distinct >= 10) {
    const ic = stats.ic;
    const corr = stats.englishCorr;
    const strongHit = [...found.values()].some((c) => c.score >= 70);
    const noJ = !/J/.test(L);
    const pairsClean = (() => {
      if (n % 2 !== 0) return false;
      for (let i = 0; i < n; i += 2) if (L[i] === L[i + 1]) return false;
      return true;
    })();

    if (!strongHit && ic >= 0.058 && n >= 30) {
      if (corr >= 0.058 && baseFit < 0.5) {
        add({ id: "transposition", name: "Transposition (letters kept, order scrambled)", family: "transposition", score: Math.min(72, 45 + 2000 * (corr - 0.058) + 1000 * (ic - 0.058)), evidence: ["IoC " + ic + " is English-like", "letter frequencies already match English (correlation " + corr + ")", "but common letter pairs are rare, so the order was changed"], caveats: ["rail fence, columnar, route and scytale all look like this", "no rail count from 2 to 10 produced English"], next: "ts columnar decode k=KEY <text>" });
      } else if (baseFit < 0.45) {
        add({ id: "monoalphabetic", name: "Monoalphabetic substitution", family: "substitution", score: Math.min(75, 45 + 1500 * (ic - 0.058)), evidence: ["IoC " + ic + " is English-like (about 0.066), so letters map one to one", "frequencies do not match English at any Caesar, Atbash or affine key"], caveats: ["keyword or random alphabet, also Pigpen or symbol ciphers rewritten as letters", n < 80 ? "under 80 letters, frequency solving is unreliable" : ""].filter(Boolean), next: "ts sub <text>" });
      }
    }

    if (!strongHit && ic < 0.056) {
      const period = stats.period;
      let tested = null;
      const periodRows = scanned.rows.filter((r) => r.length >= 2 && r.length <= Math.floor(n / 10) && r.ic >= 0.052 && r.ic > ic + 0.006);
      const tryPeriods = [];
      const firstFirm = periodRows.find((r) => r.ic >= 0.058);
      if (firstFirm) tryPeriods.push(firstFirm);
      for (const r of periodRows.slice().sort((a, b) => b.ic - a.ic)) {
        if (tryPeriods.length >= mode.periods) break;
        if (!tryPeriods.includes(r)) tryPeriods.push(r);
      }
      if (period && tryPeriods.length) {
        let bestTrial = null;
        for (const row of tryPeriods) {
          for (const variant of ["vigenere", "beaufort"]) {
            const trial = refinePeriodicKey(L, columnScores(L, row.length, variant), variant, mode.refineSample, mode.passes);
            const adjusted = trial.fit - 0.012 * row.length;
            if (!bestTrial || adjusted > bestTrial.adjusted) bestTrial = { row, variant, key: trial.key, fit: trial.fit, adjusted };
          }
        }
        const probe = sampled ? s.slice(0, mode.fitSample) : s;
        const out = applyPeriodic(probe, bestTrial.key, bestTrial.variant);
        const need = Math.min(0.8, 0.5 + 0.03 * Math.max(0, bestTrial.row.length - 5));
        tested = { mode: bestTrial.variant, key: bestTrial.key.map((k) => String.fromCharCode(65 + k)).join(""), out, fit: englishFit(out), need, row: bestTrial.row, tried: tryPeriods.map((r) => r.length) };
        if (tested.fit >= need) {
          const vig = tested.mode === "vigenere";
          const grons = vig && /^[A-J]+$/.test(tested.key);
          add({
            id: tested.mode,
            name: (vig ? "Vigenère" : "Beaufort") + " (period " + tested.row.length + ", key guess " + tested.key + ")",
            family: "polyalphabetic",
            score: 60 + 35 * tested.fit,
            evidence: [
              "IoC " + ic + " is below English but columns at period " + tested.row.length + " average " + round(tested.row.ic, 4) + " (periods tried: " + tested.tried.join(", ") + ")",
              "column frequency analysis plus a bounded refinement (top 4 letters per position, " + mode.passes + (mode.passes === 1 ? " pass" : " passes") + ") gives " + tested.key + " and the result reads as English (fit " + tested.fit + ", needed " + round(need, 2) + " for this period)" + checkedOn,
            ],
            caveats: [
              vig ? "variant Beaufort decrypts the same way with an inverted key" : "Beaufort is its own inverse, encode and decode match",
              grons ? "key letters are all A-J, so Gronsfeld digits " + [...tested.key].map((c) => c.charCodeAt(0) - 65).join("") + " also fit" : "",
              "key may be a rotation or a multiple of the true key",
            ].filter(Boolean),
            preview: clip(tested.out, 140),
            next: vig ? "ts vigcrack <text>" : "ts beaufort decode k=" + tested.key + " <text>",
          });
        } else {
          add({
            id: "polyalphabetic",
            name: "Periodic polyalphabetic (Vigenère family), period " + period.length + "?",
            family: "polyalphabetic",
            score: Math.min(62, 40 + 1500 * (period.ic - 0.055)),
            evidence: ["overall IoC " + ic + " is flattened", "columns at period " + period.length + " average IoC " + period.ic + ", close to English"],
            caveats: ["no Vigenère or Beaufort key for periods " + tested.tried.join(", ") + " produced English", "Porta, Gronsfeld, Quagmire and autokey with short texts can look similar", "this is a signature, not a confirmation"],
            next: "ts vigcrack <text>",
          });
        }
      }
      if (!tested || tested.fit < tested.need) {
        if (noJ && pairsClean && n >= 20) {
          add({ id: "playfair", name: "Playfair (or another 5x5 digraph cipher)", family: "digraphic", score: 38 + (onlyLetters ? 8 : 0), evidence: ["no J, even length " + n, "no digraph pair repeats a letter", "IoC " + ic + " sits between English and random"], caveats: ["Bifid, Two-square and Four-square share these traits", "needs a key"], next: "ts playfair decode k=KEY <text>" });
        }
        add({ id: "polyalphabetic-unknown", name: "Polyalphabetic or fractionated, period unclear", family: "polyalphabetic", score: 22 + (ic < 0.048 ? 8 : 0), evidence: ["IoC " + ic + " is closer to random (0.038) than English (0.066)"], caveats: ["autokey, running key, Hill, Bifid, or simply random data", "short inputs make IoC noisy"] });
      }
    }
  }

  if (n > 0 && n < 20) {
    for (const c of found.values()) {
      if (["rotation", "substitution", "transposition", "polyalphabetic"].includes(c.family) && c.id !== "bacon" && c.score > 65) {
        c.score = 65;
        c.confidence = confidenceOf(65);
        if (!c.caveats.some((x) => x.startsWith("short input"))) c.caveats.push("short input, treat as a lead, not a result");
      }
    }
  }
  if (raw.length > mode.maxInput) {
    const head = new Set(raw.slice(0, mode.maxInput));
    const tail = raw.slice(mode.maxInput, mode.maxInput + 20000);
    const strangers = (allowed) => {
      const extra = new Set();
      for (const ch of tail) {
        if (/\s/.test(ch) || extra.has(ch)) continue;
        if (allowed ? !allowed.test(ch) : !head.has(ch) && !/[A-Za-z0-9.,;:'"!?()-]/.test(ch)) {
          extra.add(ch);
          if (extra.size >= 8) break;
        }
      }
      return extra;
    };
    const generic = strangers(null);
    for (const c of found.values()) {
      const extra = TAIL_ALPHABETS[c.id] ? strangers(TAIL_ALPHABETS[c.id]) : generic;
      c.caveats.push("only the first " + mode.maxInput + " of " + raw.length + " chars were analyzed");
      if (extra.size) {
        c.score = Math.min(c.score - 25, 60);
        c.caveats.push("later text adds characters not seen in the analyzed part (" + [...extra].join(" ") + "), so the whole input may not be one format");
      }
      c.score = Math.max(0, Math.min(90, c.score));
      c.confidence = confidenceOf(c.score);
    }
  }
  const candidates = [...found.values()].sort((a, b) => b.score - a.score);
  const limit = options.limit || 8;
  return { stats, candidates: candidates.slice(0, limit) };
}

function formatIdentify(result, opts) {
  const max = (opts && opts.max) || 6;
  const lines = [];
  const shown = result.candidates.filter((c) => c.score >= 20).slice(0, max);
  if (!shown.length) {
    lines.push("No confident match. Scores are heuristics, not probabilities.");
  } else {
    lines.push("Ranked guesses (heuristic scores 0-99, not probabilities):");
    shown.forEach((c, i) => {
      lines.push(i + 1 + ". " + c.name + " [" + c.confidence + " " + c.score + "]");
      if (c.evidence.length) lines.push("   why: " + c.evidence.join("; "));
      if (c.caveats.length) lines.push("   but: " + c.caveats.join("; "));
      if (c.preview) lines.push("   reads: " + c.preview);
      if (c.next) lines.push("   try: " + c.next);
    });
  }
  const st = result.stats;
  const parts = [st.length + " chars", st.letters + " letters", "IoC " + st.ic, "entropy " + st.entropy + " bits/char", "English fit " + st.englishFit];
  if (st.period) parts.push("period signal " + st.period.length + " (column IoC " + st.period.ic + ")");
  if (st.analyzed < st.length) parts.push("analyzed first " + st.analyzed + " of " + st.length);
  if (st.fitSample < st.analyzed) parts.push("read checks on first " + st.fitSample);
  lines.push("stats: " + parts.join(", "));
  let out = lines.join("\n");
  if (out.length > 1800) out = out.slice(0, 1799) + "…";
  return out;
}

module.exports = {
  identify,
  formatIdentify,
  analyze,
  englishFit,
  decoders: {
    base64: (s) => utf8(base64Bytes(s)),
    base32: (s) => utf8(base32Bytes(s)),
    hex: (s) => utf8(hexBytes(s)),
    binary: (s) => utf8(binaryBytes(s)),
    octal: octalText,
    decimal: decimalText,
    a1z26: a1z26Text,
    ascii85: (s) => utf8(a85Bytes(s)),
    base58: (s) => utf8(base58Bytes(s)),
    base91: (s) => utf8(base91Bytes(s)),
    base100: base100Text,
    url: urlText,
    html: htmlText,
    unicode: escapeText,
    qp: qpText,
    uu: uuText,
    morse: (s) => {
      const m = morseText(s);
      return m && !m.unknown ? m.text : null;
    },
    bacon: (s) => {
      const d = baconDecode(s, { variant: 24 });
      return d && !d.includes("?") ? d : null;
    },
    braille: (s) => {
      const b = brailleText(s);
      return b && b.hits === b.total ? b.text : null;
    },
    rot13: (s) => shift(s, 13),
    rot47,
    atbash,
    reverse,
  },
  transforms: { shift, atbash, rot47, reverse, railDecode, affineDecode, bestSingleByteXor, hexBytes, bigramCoverage, EN },
};
