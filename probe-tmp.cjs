const crypto = require("node:crypto");
const fs = require("node:fs");
const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
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

function englishScore(s) {
  const m = s.toLowerCase().match(/[a-z ]/g);
  if (!m) return 0;
  const common = "etaoinshrdlu ";
  let hits = 0;
  for (const c of m) if (common.includes(c)) hits++;
  return hits / Math.max(1, s.length);
}

function rankText(s) {
  const chi = chi2(s);
  return isFinite(chi) ? 100000 - chi : englishScore(s) * 1000;
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

function fullRank(s) {
  return rankText(s) + wordBonus(s) * 50000;
}

function commonWordScore(w) {
  let s = 0;
  for (const c of w) s += EN_FREQ[c] || 0;
  return s / Math.max(1, w.length);
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
    list.sort((a, b) => commonWordScore(b) - commonWordScore(a));
    if (list.length > 1200) patternIndex.set(key, list.slice(0, 1200));
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

function applyMap(cword, pword, cmap, pmap) {
  const added = [];
  for (let i = 0; i < cword.length; i++) {
    if (!cmap[cword[i]]) {
      cmap[cword[i]] = pword[i];
      pmap[pword[i]] = cword[i];
      added.push(cword[i]);
    }
  }
  return added;
}

function undoMap(added, cmap, pmap) {
  for (const c of added) {
    delete pmap[cmap[c]];
    delete cmap[c];
  }
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
  const cmap = {};
  const pmap = {};
  let nodes = 0;
  const cap = 8000000;
  const deadline = Date.now() + 12000;
  const solutions = [];
  const firstCount = new Map();
  const backtrack = (i) => {
    if (solutions.length >= 1000) return true;
    if (i >= ordered.length) {
      solutions.push({ ...cmap });
      return solutions.length >= 1000;
    }
    const cw = ordered[i];
    for (const pw of cands.get(cw)) {
      if (++nodes > cap || Date.now() > deadline) return true;
      if (!consistent(cw, pw, cmap, pmap)) continue;
      if (i === 0) {
        const seen = firstCount.get(pw) || 0;
        if (seen >= 2) continue;
        firstCount.set(pw, seen + 1);
      }
      const added = applyMap(cw, pw, cmap, pmap);
      if (backtrack(i + 1)) {
        undoMap(added, cmap, pmap);
        if (solutions.length >= 1000 || nodes > cap || Date.now() > deadline) return true;
        continue;
      }
      undoMap(added, cmap, pmap);
    }
    return false;
  };
  backtrack(0);
  if (!solutions.length) return null;
  let best = solutions[0];
  let bestRank = -Infinity;
  for (const sol of solutions) {
    const text = cipher.replace(/[a-zA-Z]/g, (c) => {
      const low = c.toLowerCase();
      if (!sol[low]) return " ";
      return c === low ? sol[low] : sol[low].toUpperCase();
    });
    const rank = fullRank(text);
    if (rank > bestRank) {
      bestRank = rank;
      best = sol;
    }
  }
  return cipher.replace(/[a-zA-Z]/g, (c) => {
    const low = c.toLowerCase();
    if (!best[low]) return "?";
    return c === low ? best[low] : best[low].toUpperCase();
  });
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

function ascendVig(cipher, key) {
  let best = key;
  let bestRank = fullRank(vigDecrypt(cipher, key));
  for (let pass = 0; pass < 4; pass++) {
    let improved = false;
    for (let pos = 0; pos < best.length; pos++) {
      for (let s = 0; s < 26; s++) {
        const k = best.slice(0, pos) + String.fromCharCode(65 + s) + best.slice(pos + 1);
        const rank = fullRank(vigDecrypt(cipher, k));
        if (rank > bestRank) {
          bestRank = rank;
          best = k;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
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
  let best = null;
  for (const kl of lensOrder) {
    let key = "";
    for (let col = 0; col < kl; col++) {
      let colStr = "";
      for (let i = col; i < clean.length; i += kl) colStr += clean[i];
      let bestShift = 0;
      let bestRank = -Infinity;
      for (let s = 0; s < 26; s++) {
        const dec = [...colStr].map((c) => String.fromCharCode(65 + ((c.charCodeAt(0) - 65 - s + 26) % 26))).join("");
        const rank = fullRank(dec);
        if (rank > bestRank) {
          bestRank = rank;
          bestShift = s;
        }
      }
      key += String.fromCharCode(65 + bestShift);
    }
    key = ascendVig(cipher.slice(0, 600), key);
    const plain = vigDecrypt(cipher, key);
    const rank = fullRank(plain);
    if (!best || rank > best.rank) best = { key, plain, rank };
  }
  return best;
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
      out.push({ a, b, dec, rank: fullRank(dec) });
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

function xorCrack(hexStr) {
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
  let best = null;
  for (const ks of ksOrder) {
    let key = "";
    for (let col = 0; col < ks; col++) {
      const colBytes = [];
      for (let i = col; i < work.length; i += ks) colBytes.push(work[i]);
      let bestK = 0;
      let bestRank = -Infinity;
      for (let k = 0; k < 256; k++) {
        const s = String.fromCharCode(...colBytes.map((b) => b ^ k));
        const rank = fullRank(s);
        if (rank > bestRank) {
          bestRank = rank;
          bestK = k;
        }
      }
      key += String.fromCharCode(bestK);
    }
    key = ascendXor(work, key);
    const plain = [...buf].map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
    const rank = fullRank(plain);
    if (!best || rank > best.rank) best = { key, plain, rank };
  }
  return best;
}

function ascendXor(work, key) {
  const dec = (k) => [...work].map((b, i) => String.fromCharCode(b ^ k.charCodeAt(i % k.length))).join("");
  let best = key;
  let bestRank = fullRank(dec(key));
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    for (let pos = 0; pos < best.length; pos++) {
      for (let v = 0; v < 256; v++) {
        const k = best.slice(0, pos) + String.fromCharCode(v) + best.slice(pos + 1);
        const rank = fullRank(dec(k));
        if (rank > bestRank) {
          bestRank = rank;
          best = k;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return best;
}

module.exports = async function solve(client, message) {
  const p = require("../config").commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();

  if (lower.startsWith(p + "sub ")) {
    const out = subSolve(arg(p + "sub ").slice(0, 400));
    await message.channel.send(out === null ? "Could not solve. Longer quotes work best." : cut(out));
    return true;
  }
  if (lower.startsWith(p + "vigcrack ")) {
    const r = vigCrack(arg(p + "vigcrack ").slice(0, 600));
    await message.channel.send(r === null ? "Need 20+ letters A-Z." : cut("key: " + r.key + "\n" + r.plain));
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
  if (lower.startsWith(p + "xorcrack ")) {
    const r = xorCrack(arg(p + "xorcrack "));
    if (!r) {
      await message.channel.send("Usage: `ts xorcrack <hex>` (8+ bytes)");
      return true;
    }
    const keyShown = /^[\x20-\x7e]*$/.test(r.key) ? r.key : Buffer.from(r.key, "latin1").toString("hex");
    await message.channel.send(cut("key: " + keyShown + "\n" + r.plain));
    return true;
  }
  return false;
};

module.exports = { fullRank, wordBonus, englishScore };