const fs = require("node:fs");
const zlib = require("node:zlib");
const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

function englishScore(s) {
  const m = s.toLowerCase().match(/[a-z ]/g);
  if (!m) return 0;
  const common = "etaoinshrdlu ";
  let hits = 0;
  for (const c of m) if (common.includes(c)) hits++;
  return hits / Math.max(1, s.length);
}

let dictSet = null;

function wordBonus(s) {
  const words = s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1);
  if (!words.length) return 0;
  if (!dictSet) {
    const dict = loadWords();
    if (!dict.length) return 0;
    dictSet = new Set(dict);
  }
  let hits = 0;
  for (const w of words) if (dictSet.has(w)) hits++;
  return hits / words.length;
}

let ngramCache = null;

function getNgrams() {
  if (ngramCache) return ngramCache;
  const bi = {};
  const tri = {};
  let biTotal = 0;
  let triTotal = 0;
  for (const w of loadWords()) {
    for (let i = 0; i + 1 < w.length; i++) {
      const b = w.slice(i, i + 2);
      bi[b] = (bi[b] || 0) + 1;
      biTotal++;
    }
    for (let i = 0; i + 2 < w.length; i++) {
      const t = w.slice(i, i + 3);
      tri[t] = (tri[t] || 0) + 1;
      triTotal++;
    }
  }
  ngramCache = { bi, tri, biTotal, triTotal, floorBi: Math.log(0.5 / biTotal), floorTri: Math.log(0.5 / triTotal) };
  return ngramCache;
}

function ngramScore(s) {
  const { bi, tri, biTotal, triTotal, floorBi, floorTri } = getNgrams();
  const words = s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 1);
  let sum = 0;
  let n = 0;
  for (const w of words) {
    for (let i = 0; i + 1 < w.length; i++) {
      const b = w.slice(i, i + 2);
      sum += bi[b] ? Math.log(bi[b] / biTotal) : floorBi;
      n++;
    }
    for (let i = 0; i + 2 < w.length; i++) {
      const t = w.slice(i, i + 3);
      sum += tri[t] ? Math.log(tri[t] / triTotal) : floorTri;
      n++;
    }
  }
  return n ? sum / n : -Infinity;
}

function fullRank(s) {
  return englishScore(s) * 3000 + ngramScore(s) * 500 + wordBonus(s) * 8000;
}

function rankCode(s) {
  const bad = (s.match(/[^\x20-\x7e\s]/g) || []).length;
  return englishScore(s) * 3000 + wordBonus(s) * 4000 - (bad / Math.max(1, s.length)) * 30000;
}

let dictWords = null;

function loadWords() {
  if (dictWords) return dictWords;
  const paths = [config.dict, "/usr/share/dict/words", "/usr/share/dict/american-english"];
  for (const p of paths) {
    try {
      const words = fs.readFileSync(p, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{2,15}$/.test(w));
      if (words.length > 1000) {
        dictWords = words;
        return dictWords;
      }
    } catch {}
  }
  return [];
}

function patternOf(w) {
  const m = {};
  let n = 0;
  let s = "";
  for (const c of w) {
    if (!(c in m)) m[c] = n++;
    s += String.fromCharCode(97 + m[c]);
  }
  return s;
}

let patternIndex = null;

function getPatternIndex() {
  if (patternIndex) return patternIndex;
  patternIndex = new Map();
  for (const w of loadWords()) {
    const key = w.length + ":" + patternOf(w);
    if (!patternIndex.has(key)) patternIndex.set(key, []);
    patternIndex.get(key).push(w);
  }
  for (const [key, list] of patternIndex) {
    list.sort((a, b) => ngramScore(b) - ngramScore(a));
  }
  return patternIndex;
}

function consistent(cword, pword, cmap, pmap) {
  for (let i = 0; i < cword.length; i++) {
    const c = cword[i];
    const p = pword[i];
    if (cmap[c] && cmap[c] !== p) return false;
    if (pmap[p] && pmap[p] !== c) return false;
  }
  return true;
}

function subSolve(cipher) {
  const words = cipher.toLowerCase().match(/[a-z]+/g) || [];
  const uniq = [...new Set(words.filter((w) => w.length > 1))];
  if (!uniq.length) return null;
  const index = getPatternIndex();
  const cands = new Map();
  for (const w of uniq) {
    const list = index.get(w.length + ":" + patternOf(w)) || [];
    if (!list.length) return null;
    cands.set(w, list);
  }
  const ordered = [...uniq].sort((a, b) => b.length - a.length || cands.get(a).length - cands.get(b).length);
  let beam = [{ mapC: {}, mapP: {}, pdone: [] }];
  for (let wi = 0; wi < ordered.length; wi++) {
    const cw = ordered[wi];
    let pool = cands.get(cw);
    if (wi === 0 && pool.length > 500) {
      const ranked = pool.map((w) => ({ w, s: ngramScore(w) })).sort((a, b) => b.s - a.s);
      const picked = new Set();
      for (let i = 0; i < ranked.length && picked.size < 450; i += 8) picked.add(ranked[i].w);
      for (let i = 0; i < 100 && i < ranked.length; i++) picked.add(ranked[i].w);
      pool = [...picked];
    }
    const next = [];
    for (const h of beam) {
      for (const pw of pool) {
        if (!consistent(cw, pw, h.mapC, h.mapP)) continue;
        const nc = { ...h.mapC };
        const np = { ...h.mapP };
        for (let i = 0; i < cw.length; i++) {
          nc[cw[i]] = pw[i];
          np[pw[i]] = cw[i];
        }
        const pdone = [...h.pdone, pw];
        next.push({ mapC: nc, mapP: np, pdone, rank: fullRank(pdone.join(" ")) });
      }
    }
    if (!next.length) return null;
    next.sort((a, b) => b.rank - a.rank);
    beam = next.slice(0, 250);
  }
  const ranked = beam.map((h) => {
    const text = cipher.replace(/[a-zA-Z]/g, (c) => {
      const low = c.toLowerCase();
      if (!h.mapC[low]) return "?";
      return c === low ? h.mapC[low] : h.mapC[low].toUpperCase();
    });
    return { text, rank: fullRank(text) };
  });
  ranked.sort((a, b) => b.rank - a.rank);
  const out = [];
  while (out.length < 8 && ranked.length) {
    let bi = 0;
    let bs = -Infinity;
    for (let i = 0; i < ranked.length; i++) {
      let sim = 0;
      if (out.length) {
        const words = new Set(ranked[i].text.toLowerCase().split(/[^a-z]+/).filter(Boolean));
        let best = 0;
        for (const shown of out) {
          const sw = shown.toLowerCase().split(/[^a-z]+/).filter(Boolean);
          const shared = sw.filter((w) => words.has(w)).length;
          best = Math.max(best, shared / Math.max(1, sw.length));
        }
        sim = best;
      }
      const score = ranked[i].rank - sim * 4000;
      if (score > bs) {
        bs = score;
        bi = i;
      }
    }
    out.push(ranked[bi].text);
    ranked.splice(bi, 1);
  }
  return out.length ? out : null;
}

function icOf(s) {
  const counts = {};
  let total = 0;
  for (const c of s) {
    counts[c] = (counts[c] || 0) + 1;
    total++;
  }
  if (total < 2) return 0;
  let sum = 0;
  for (const c in counts) sum += counts[c] * (counts[c] - 1);
  return sum / (total * (total - 1));
}

function vigDecrypt(cipher, key) {
  let plain = "";
  let ki = 0;
  for (const c of cipher) {
    if (/[a-zA-Z]/.test(c)) {
      const base = c === c.toLowerCase() ? 97 : 65;
      const shift = key.charCodeAt(ki++ % key.length) - 65;
      plain += String.fromCharCode(base + ((c.charCodeAt(0) - base - shift + 26) % 26));
    } else {
      plain += c;
    }
  }
  return plain;
}

function beamVig(clean, kl, width) {
  width = width || 48;
  let beam = [{ key: "", rank: 0 }];
  for (let pos = 0; pos < kl; pos++) {
    const next = [];
    for (const { key } of beam) {
      for (let s = 0; s < 26; s++) {
        const k = key + String.fromCharCode(65 + s);
        let dec = "";
        for (let i = 0; i < clean.length; i++) {
          if (i % kl <= pos) dec += String.fromCharCode(65 + ((clean.charCodeAt(i) - 65 - (k.charCodeAt(i % kl) - 65) + 26) % 26));
        }
        next.push({ key: k, rank: rankCode(dec) });
      }
    }
    next.sort((a, b) => b.rank - a.rank);
    beam = next.slice(0, width);
  }
  return beam;
}

function beamXor(work, ks) {
  const width = ks > 12 ? 16 : 48;
  let beam = [{ key: "", rank: 0 }];
  for (let pos = 0; pos < ks; pos++) {
    const next = [];
    for (const { key } of beam) {
      for (let v = 0; v < 256; v++) {
        const k = key + String.fromCharCode(v);
        let dec = "";
        for (let i = 0; i < work.length; i++) {
          if (i % ks <= pos) dec += String.fromCharCode(work[i] ^ k.charCodeAt(i % ks));
        }
        next.push({ key: k, rank: rankCode(dec) });
      }
    }
    next.sort((a, b) => b.rank - a.rank);
    beam = next.slice(0, width);
  }
  return beam;
}

function vigCrack(cipher) {
  const clean = cipher.toUpperCase().replace(/[^A-Z]/g, "");
  if (clean.length < 20) return null;
  const lens = [];
  for (let kl = 2; kl <= Math.min(20, Math.floor(clean.length / 4)); kl++) {
    let sum = 0;
    for (let col = 0; col < kl; col++) {
      let colStr = "";
      for (let i = col; i < clean.length; i += kl) colStr += clean[i];
      sum += icOf(colStr);
    }
    lens.push({ kl, ic: sum / kl });
  }
  lens.sort((a, b) => b.ic - a.ic);
  const tried = new Set();
  const lensOrder = [];
  for (const { kl } of lens) {
    if (lensOrder.length < 5 && !tried.has(kl)) {
      tried.add(kl);
      lensOrder.push(kl);
    }
  }
  for (let kl = 2; kl <= 6 && lensOrder.length < 7; kl++) {
    if (!tried.has(kl) && kl <= Math.min(20, Math.floor(clean.length / 4))) {
      tried.add(kl);
      lensOrder.push(kl);
    }
  }
  let results = [];
  for (const kl of lensOrder) {
    const beams = beamVig(clean.slice(0, 400), kl, 48);
    for (const { key } of beams.slice(0, 3)) {
      const plain = vigDecrypt(cipher, key);
      results.push({ key, kl, plain, rank: rankCode(plain) });
    }
  }
  results.sort((a, b) => b.rank - a.rank);
  const out = [];
  const seen = new Set();
  for (const r of results) {
    if (!seen.has(r.plain)) {
      seen.add(r.plain);
      out.push(r);
    }
    if (out.length >= 3) break;
  }
  return out;
}

function affineBrute(text) {
  const t = text.slice(0, 200);
  const valid = [1, 3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25];
  const out = [];
  for (const a of valid) {
    for (let b = 0; b < 26; b++) {
      const dec = t.replace(/[a-zA-Z]/g, (c) => {
        const base = c <= "Z" ? 65 : 97;
        const y = c.charCodeAt(0) - base;
        const ainv = [1, 9, 21, 15, 3, 19, 7, 23, 11, 5, 17, 25][valid.indexOf(a)];
        return String.fromCharCode(base + (((ainv * (y - b + 26)) % 26 + 26) % 26));
      });
      out.push({ a, b, dec, rank: rankCode(dec) });
    }
  }
  out.sort((x, y) => y.rank - x.rank);
  return out.slice(0, 5);
}

function baconDecode(s) {
  const t = s.toLowerCase().replace(/[^ab01]/g, "").replace(/0/g, "a").replace(/1/g, "b");
  if (!t || t.length % 5 !== 0) return null;
  const alpha = "abcdefghiklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < t.length; i += 5) {
    const v = parseInt(t.slice(i, i + 5).replace(/a/g, "0").replace(/b/g, "1"), 2);
    out += v < 24 ? alpha[v] : "?";
  }
  return out;
}

function baconEncode(s) {
  const alpha = "abcdefghiklmnopqrstuvwxyz";
  let out = "";
  for (const c of s.toLowerCase()) {
    let idx = alpha.indexOf(c === "j" ? "i" : c);
    if (c === " ") {
      out += " ";
      continue;
    }
    if (idx < 0) return null;
    out += idx.toString(2).padStart(5, "0").replace(/0/g, "a").replace(/1/g, "b") + " ";
  }
  return out.trim();
}

function a1z26(s) {
  if (/^[\d\s,\-]+$/.test(s.trim()) && /\d/.test(s)) {
    return s.trim().split(/[\s,]+/).map((n) => {
      const v = parseInt(n);
      return v >= 1 && v <= 26 ? String.fromCharCode(96 + v) : "?";
    }).join("");
  }
  return [...s.toLowerCase()].map((c) => (c >= "a" && c <= "z" ? c.charCodeAt(0) - 96 : c)).join(" ");
}

const OOK_OPS = { "ook. ook?": ">", "ook? ook.": "<", "ook. ook.": "+", "ook! ook!": "-", "ook! ook.": ".", "ook. ook!": ",", "ook! ook?": "[", "ook? ook!": "]" };

function ookToBf(s) {
  const toks = s.trim().toLowerCase().split(/\s+/);
  if (toks.length % 2 !== 0) return null;
  let out = "";
  for (let i = 0; i < toks.length; i += 2) {
    const op = OOK_OPS[toks[i] + " " + toks[i + 1]];
    if (!op) return null;
    out += op;
  }
  return out;
}

function bf(code, maxSteps) {
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
  while (ip < prog.length && steps++ < (maxSteps || 200000)) {
    const c = prog[ip];
    if (c === ">") p = (p + 1) % 30000;
    else if (c === "<") p = (p + 29999) % 30000;
    else if (c === "+") mem[p]++;
    else if (c === "-") mem[p]--;
    else if (c === ".") out += String.fromCharCode(mem[p]);
    else if (c === "[") {
      if (mem[p] === 0) ip = jumps[ip];
    } else if (c === "]") {
      if (mem[p] !== 0) ip = jumps[ip];
    }
    ip++;
    if (out.length > 500) break;
  }
  return out;
}

function modPow(base, exp, mod) {
  let r = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return r;
}

function isPrime(n) {
  if (n < 2n) return false;
  for (const p of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n]) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  let d = n - 1n;
  let r = 0n;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    r++;
  }
  for (const a of [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n]) {
    if (a % n === 0n) continue;
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    let cont = false;
    for (let i = 1n; i < r; i++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        cont = true;
        break;
      }
    }
    if (!cont) return false;
  }
  return true;
}

function pollardRho(n) {
  if (n % 2n === 0n) return 2n;
  let c = 1n;
  while (true) {
    let x = 2n;
    let y = 2n;
    let d = 1n;
    const f = (v) => ((v * v) % n + c) % n;
    while (d === 1n) {
      x = f(x);
      y = f(f(y));
      const diff = x > y ? x - y : y - x;
      d = gcd(diff, n);
    }
    if (d !== n) return d;
    c++;
  }
}

function gcd(a, b) {
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function factorize(n, out) {
  out = out || [];
  if (n === 1n) return out;
  if (isPrime(n)) {
    out.push(n);
    return out;
  }
  const d = pollardRho(n);
  factorize(d, out);
  factorize(n / d, out);
  return out;
}

function egcd(a, b) {
  if (b === 0n) return [a, 1n, 0n];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - (a / b) * y];
}

function modInv(a, m) {
  const [g, x] = egcd(a, m);
  if (g !== 1n) return null;
  return ((x % m) + m) % m;
}

function b36Decode(s) {
  const t = s.trim().toLowerCase();
  if (!t || !/^[0-9a-z]+$/.test(t)) return null;
  let v = 0n;
  for (const c of t) {
    const d = c <= "9" ? c.charCodeAt(0) - 48 : c.charCodeAt(0) - 87;
    v = v * 36n + BigInt(d);
  }
  return v.toString(10);
}

function isqrt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

function isSquare(n) {
  const r = isqrt(n);
  return r !== null && r * r === n ? r : null;
}

function wiener(e, n) {
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
    const disc = s * s - 4n * n;
    const r = isSquare(disc);
    if (r === null || (s + r) % 2n !== 0n) continue;
    const p = (s + r) / 2n;
    const qq = (s - r) / 2n;
    if (p * qq === n) return { p, q: qq, d: k };
  }
  return null;
}

function fermatFactor(n, limit) {
  let a = isqrt(n);
  if (a === null) return null;
  if (a * a < n) a++;
  const cap = limit || 2000000n;
  for (let i = 0n; i < cap; i++) {
    const b = isSquare(a * a - n);
    if (b !== null) return [a - b, a + b];
    a++;
  }
  return null;
}

function icbrt(n) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  let x = n;
  let y = (2n * x + n / (x * x)) / 3n;
  while (y < x) {
    x = y;
    y = (2n * x + n / (x * x)) / 3n;
  }
  return x;
}

function crt(rems, mods) {
  let M = 1n;
  for (const m of mods) M *= m;
  let x = 0n;
  for (let i = 0; i < rems.length; i++) {
    const Mi = M / mods[i];
    const inv = modInv(Mi % mods[i], mods[i]);
    if (inv === null) return null;
    x = (x + rems[i] * Mi * inv) % M;
  }
  return { x, M };
}

async function factordb(message, n) {
  let j;
  try {
    const res = await fetch("http://factordb.com/api?query=" + encodeURIComponent(n.toString()), {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "syndication-bot" },
    });
    j = await res.json();
  } catch {
    await message.channel.send("FactorDB unreachable.");
    return;
  }
  if (j.status === "FF" || (j.factors && j.factors.length)) {
    await message.channel.send(cut(n.toString() + " = " + j.factors.map(([f, e]) => (e > 1 ? f + "^" + e : "" + f)).join(" × ")));
    return;
  }
  await message.channel.send("FactorDB status: " + (j.status || "unknown") + " (try `ts fermat` for close primes).");
}

function xorDrag(hexStr, crib) {
  const t = hexStr.replace(/\s+/g, "");
  if (!t || !/^[0-9a-fA-F]+$/.test(t) || !crib) return null;
  const buf = Buffer.from(t, "hex");
  const cb = Buffer.from(crib, "utf8");
  const out = [];
  for (let off = 0; off + cb.length <= buf.length; off++) {
    const ks = [];
    for (let i = 0; i < cb.length; i++) ks.push(buf[off + i] ^ cb[i]);
    const key = Buffer.from(ks);
    if (/^[\x20-\x7e]+$/.test(key.toString("latin1"))) {
      out.push(off + ": " + key.toString("hex") + " (" + key.toString("utf8") + ")");
    }
  }
  return out;
}

function samlDecode(s) {
  let t = s.trim().replace(/\s+/g, "");
  if (!t) return null;
  if (t.includes("%")) {
    try {
      t = decodeURIComponent(t);
    } catch {}
  }
  try {
    const raw = Buffer.from(t, "base64");
    if (!raw.length) return null;
    try {
      return zlib.inflateRawSync(raw).toString("utf8");
    } catch {
      return zlib.inflateSync(raw).toString("utf8");
    }
  } catch {
    return null;
  }
}

function parseBig(s) {
  s = s.trim().toLowerCase();
  try {
    if (s.startsWith("0x")) return BigInt(s);
    if (/^\d+$/.test(s)) return BigInt(s);
    const buf = Buffer.from(s.replace(/\s+/g, ""), "hex");
    if (buf.length) return BigInt("0x" + buf.toString("hex"));
    return null;
  } catch {
    return null;
  }
}

function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = a[i] ^ b[i];
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

function xorCrack(hexStr, crib) {
  const t = hexStr.replace(/\s+/g, "");
  if (!t || !/^[0-9a-fA-F]+$/.test(t)) return null;
  const buf = Buffer.from(t, "hex");
  if (buf.length < 8) return null;
  const sizes = [];
  for (let ks = 2; ks <= Math.min(40, Math.floor(buf.length / 8)); ks++) {
    const blocks = [];
    for (let i = 0; i < 8; i++) blocks.push(buf.slice(i * ks, (i + 1) * ks));
    let dist = 0;
    let pairs = 0;
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 4; j++) {
        dist += hamming(blocks[i], blocks[j]) / ks;
        pairs++;
      }
    }
    sizes.push({ ks, score: dist / pairs });
  }
  sizes.sort((a, b) => a.score - b.score);
  const work = buf.length > 300 ? buf.slice(0, 300) : buf;
  const triedKs = new Set();
  const ksOrder = [];
  for (const { ks } of sizes) {
    if (ksOrder.length < 6 && !triedKs.has(ks)) {
      triedKs.add(ks);
      ksOrder.push(ks);
    }
  }
  for (let ks = 2; ks <= 5 && ksOrder.length < 8; ks++) {
    if (!triedKs.has(ks) && ks <= Math.floor(work.length / 8)) {
      triedKs.add(ks);
      ksOrder.push(ks);
    }
  }
  const results = [];
  for (const ks of ksOrder) {
    const beams = beamXor(work, ks);
    for (const { key } of beams.slice(0, 2)) {
      const plain = [...buf].map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
      let rank = rankCode(plain);
      if (crib && plain.includes(crib)) rank += 1e12;
      results.push({ key, ks, plain, rank });
    }
  }
  results.sort((a, b) => b.rank - a.rank);
  const out = [];
  const seen = new Set();
  for (const r of results) {
    if (!seen.has(r.plain)) {
      seen.add(r.plain);
      out.push(r);
    }
    if (out.length >= 3) break;
  }
  return out;
}

module.exports = async function solve(client, message) {
  const p = require("../config").commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();

  if (lower.startsWith(p + "sub ")) {
    const out = subSolve(arg(p + "sub ").slice(0, 400));
    if (out === null) {
      await message.channel.send("Could not solve. Longer quotes work best.");
      return true;
    }
    await message.channel.send(cut(out.map((t, i) => i + 1 + ". " + t.slice(0, 300)).join("\n")));
    return true;
  }
  if (lower.startsWith(p + "vigcrack ")) {
    const list = vigCrack(arg(p + "vigcrack ").slice(0, 600));
    if (list === null || !list.length) {
      await message.channel.send("Need 20+ letters A-Z.");
      return true;
    }
    await message.channel.send(cut(list.map((r, i) => i + 1 + ". [key " + r.key + "] " + r.plain.slice(0, 300)).join("\n")));
    return true;
  }
  if (lower.startsWith(p + "affine ")) {
    const top = affineBrute(arg(p + "affine "));
    await message.channel.send(cut(top.map((t) => "a=" + t.a + " b=" + t.b + ": " + t.dec.slice(0, 160)).join("\n")));
    return true;
  }
  if (lower.startsWith(p + "bacon ")) {
    const [mode, ...rest] = arg(p + "bacon ").split(/\s+/);
    const text = rest.join(" ");
    if (mode === "encode") {
      const out = baconEncode(text);
      await message.channel.send(out === null ? "Letters and spaces only." : cut(out));
      return true;
    }
    const out = baconDecode(mode === "decode" ? text : mode + " " + text);
    await message.channel.send(out === null ? "Need groups of 5 (A/B or 0/1)." : cut(out));
    return true;
  }
  if (lower.startsWith(p + "a1z26 ")) {
    await message.channel.send(cut(a1z26(arg(p + "a1z26 ")) || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "ook ")) {
    const prog = ookToBf(arg(p + "ook "));
    if (prog === null) {
      await message.channel.send("Bad Ook! Use Ook. Ook? Ook! tokens in pairs.");
      return true;
    }
    const out = bf(prog, 200000);
    await message.channel.send(out === null ? "Unbalanced brackets." : cut(out === "" ? "(no output)" : out));
    return true;
  }
  if (lower.startsWith(p + "b36 ")) {
    const [mode, ...rest] = arg(p + "b36 ").split(/\s+/);
    const text = rest.join(" ");
    if (mode === "decode") {
      const out = b36Decode(text);
      if (out === null) {
        await message.channel.send("Usage: `ts b36 encode|decode <value>`");
        return true;
      }
      await message.channel.send(out);
      return true;
    }
    if (mode === "encode") {
      try {
        await message.channel.send(BigInt(text).toString(36));
        return true;
      } catch {
        await message.channel.send("Usage: `ts b36 encode|decode <value>`");
        return true;
      }
    }
    await message.channel.send("Usage: `ts b36 encode|decode <value>`");
    return true;
  }
  if (lower.startsWith(p + "factor ")) {
    const n = parseBig(arg(p + "factor ").split(/\s+/)[0] || "");
    if (n === null || n < 2n) {
      await message.channel.send("Usage: `ts factor <n>`");
      return true;
    }
    const facs = factorize(n).sort((a, b) => (a < b ? -1 : 1));
    await message.channel.send(n.toString() + " = " + facs.map(String).join(" × "));
    return true;
  }
  if (lower.startsWith(p + "rsa ")) {
    const parts = arg(p + "rsa ").split(/\s+/);
    const n = parseBig(parts[0] || "");
    const e = parseBig(parts[1] || "");
    const c = parseBig(parts[2] || "");
    if (n === null || e === null || c === null) {
      await message.channel.send("Usage: `ts rsa <n> <e> <c>` (decimal or 0x)");
      return true;
    }
    const facs = factorize(n);
    const uniq = [...new Set(facs)];
    if (facs.length > 4 || uniq.length > 2) {
      await message.channel.send("n has " + facs.length + " factors, only n=p*q supported. Factors: " + facs.map(String).join(" × "));
      return true;
    }
    const p1 = uniq[0];
    const phi = uniq.length === 1 ? p1 * (p1 - 1n) : (uniq[0] - 1n) * (uniq[1] - 1n);
    const d = modInv(e, phi);
    if (d === null) {
      await message.channel.send("e has no inverse mod phi. p=" + uniq.join(","));
      return true;
    }
    const m = modPow(c, d, n);
    let hex = m.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    let text = "";
    try {
      text = Buffer.from(hex, "hex").toString("utf8");
    } catch {}
    const readable = /^[\x20-\x7e\s]*$/.test(text) && text.length > 0;
    await message.channel.send(cut("p=" + uniq.join(",") + " d=" + d.toString() + "\nm=" + m.toString() + (readable ? "\ntext: " + text : "\nhex: " + hex)));
    return true;
  }
  if (lower.startsWith(p + "wiener ")) {
    const parts = arg(p + "wiener ").split(/\s+/);
    const e = parseBig(parts[0] || "");
    const n = parseBig(parts[1] || "");
    if (e === null || n === null) {
      await message.channel.send("Usage: `ts wiener <e> <n>` (small-d attack)");
      return true;
    }
    const r = wiener(e, n);
    await message.channel.send(r === null ? "Wiener attack failed (d probably not small)." : cut("p=" + r.p.toString() + " q=" + r.q.toString() + " d=" + r.d.toString()));
    return true;
  }
  if (lower.startsWith(p + "hastad ")) {
    const parts = arg(p + "hastad ").split(/\s+/);
    if (parts.length < 3 || !parts.every((x) => x.includes(":"))) {
      await message.channel.send("Usage: `ts hastad <c1:n1> <c2:n2> <c3:n3>` (e=3 broadcast)");
      return true;
    }
    const rems = [];
    const mods = [];
    for (const x of parts) {
      const [cs, ns] = x.split(":");
      const c = parseBig(cs || "");
      const n = parseBig(ns || "");
      if (c === null || n === null) {
        await message.channel.send("Usage: `ts hastad <c1:n1> <c2:n2> <c3:n3>` (e=3 broadcast)");
        return true;
      }
      rems.push(c);
      mods.push(n);
    }
    const combined = crt(rems, mods);
    if (combined === null) {
      await message.channel.send("Moduli not coprime.");
      return true;
    }
    const m = icbrt(combined.x);
    if (m === null || m * m * m !== combined.x) {
      await message.channel.send("No exact cube root. Wrong pairing or padding?");
      return true;
    }
    let hex = m.toString(16);
    if (hex.length % 2) hex = "0" + hex;
    let text = "";
    try {
      text = Buffer.from(hex, "hex").toString("utf8");
    } catch {}
    const readable = /^[\x20-\x7e\s]*$/.test(text) && text.length > 0;
    await message.channel.send(cut("m=" + m.toString() + (readable ? "\ntext: " + text : "\nhex: " + hex)));
    return true;
  }
  if (lower.startsWith(p + "fermat ")) {
    const n = parseBig(arg(p + "fermat ").split(/\s+/)[0] || "");
    if (n === null || n < 2n) {
      await message.channel.send("Usage: `ts fermat <n>` (close primes)");
      return true;
    }
    const r = fermatFactor(n, 2000000n);
    await message.channel.send(r === null ? "No close factors in 2M steps." : cut(n.toString() + " = " + r[0].toString() + " × " + r[1].toString()));
    return true;
  }
  if (lower.startsWith(p + "factordb ")) {
    const n = parseBig(arg(p + "factordb ").split(/\s+/)[0] || "");
    if (n === null) {
      await message.channel.send("Usage: `ts factordb <n>`");
      return true;
    }
    await factordb(message, n);
    return true;
  }
  if (lower.startsWith(p + "xordrag ")) {
    const parts = arg(p + "xordrag ").split(/\s+/);
    const out = xorDrag(parts[0] || "", parts.slice(1).join(" "));
    if (out === null) {
      await message.channel.send("Usage: `ts xordrag <hex> <known crib>`");
      return true;
    }
    await message.channel.send(out.length ? cut(out.slice(0, 12).join("\n")) : "Crib fits nowhere with a printable key.");
    return true;
  }
  if (lower.startsWith(p + "saml ")) {
    const out = samlDecode(arg(p + "saml "));
    await message.channel.send(out === null ? "Not SAML (base64+deflate) decodable." : cut(out));
    return true;
  }
  if (lower.startsWith(p + "xorcrack ")) {
    const parts = arg(p + "xorcrack ").split(/\s+/);
    const hexStr = parts[0] || "";
    const cribBit = parts.find((t) => t.toLowerCase().startsWith("crib="));
    const crib = cribBit ? cribBit.slice(5) : "";
    const list = xorCrack(hexStr, crib);
    if (!list || !list.length) {
      await message.channel.send("Usage: `ts xorcrack <hex> [crib=text]` (8+ bytes)");
      return true;
    }
    await message.channel.send(
      cut(
        list.map((r, i) => {
          const keyShown = /^[\x20-\x7e]*$/.test(r.key) ? r.key : Buffer.from(r.key, "latin1").toString("hex");
          return i + 1 + ". [key " + keyShown + "] " + r.plain.slice(0, 300);
        }).join("\n")
      )
    );
    return true;
  }
  return false;
};
