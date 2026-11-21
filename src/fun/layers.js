const { decoders, transforms, englishFit } = require("./identify.js");

const LIMITS = { maxInput: 2000, maxDepth: 6, defaultDepth: 4, maxStates: 600, maxExpansions: 200, fitSample: 300 };

const LETTER_OPS = new Set(["rot13", "caesar", "atbash"]);

function letterCount(s) {
  return (s.match(/[A-Za-z]/g) || []).length;
}

function letterShare(s) {
  const visible = s.replace(/\s+/g, "").length;
  if (!visible) return 0;
  return (s.match(/[A-Za-z]/g) || []).length / visible;
}

function bestCaesar(s, sample) {
  const head = s.slice(0, sample);
  const counts = new Array(26).fill(0);
  for (const ch of head.toUpperCase()) {
    const x = ch.charCodeAt(0) - 65;
    if (x >= 0 && x < 26) counts[x]++;
  }
  const ranked = [];
  for (let k = 1; k < 26; k++) {
    if (k === 13) continue;
    let m = 0;
    for (let x = 0; x < 26; x++) m += counts[x] * transforms.EN[(x + k) % 26];
    ranked.push({ k, m });
  }
  ranked.sort((a, b) => b.m - a.m);
  let best = null;
  for (const { k } of ranked.slice(0, 2)) {
    const fit = englishFit(transforms.shift(head, k));
    if (!best || fit > best.fit) best = { k, fit };
  }
  return best ? { k: best.k, out: transforms.shift(s, best.k), fit: best.fit } : null;
}

function bestRail(s, sample) {
  const ranked = [];
  for (let r = 2; r <= Math.min(8, s.length - 1); r++) {
    const out = transforms.railDecode(s, r);
    if (out) ranked.push({ r, out, cov: transforms.bigramCoverage(out.slice(0, sample)) });
  }
  ranked.sort((a, b) => b.cov - a.cov);
  let best = null;
  for (const c of ranked.slice(0, 2)) {
    const fit = englishFit(c.out.slice(0, sample));
    if (!best || fit > best.fit) best = { r: c.r, out: c.out, fit };
  }
  return best;
}

const STEPS = [
  { label: "base64", cost: 1, gate: (s) => /^[A-Za-z0-9+/_=\s-]{4,}$/.test(s), run: decoders.base64 },
  { label: "base32", cost: 1, gate: (s) => /^[A-Z2-7=\s]{8,}$/.test(s), run: decoders.base32 },
  { label: "hex", cost: 1, gate: (s) => /^(?:0x|\\x|[0-9a-fA-F\s:,-])+$/.test(s), run: decoders.hex },
  { label: "binary", cost: 1, gate: (s) => /^[01\s]{8,}$/.test(s), run: decoders.binary },
  { label: "octal", cost: 1, gate: (s) => /^[0-7\s,]+$/.test(s), run: decoders.octal },
  { label: "decimal", cost: 1, gate: (s) => /^[\d\s,;.-]+$/.test(s), run: decoders.decimal },
  { label: "a1z26", cost: 1, gate: (s) => /^[\d\s,;.-]+$/.test(s), run: decoders.a1z26 },
  { label: "ascii85", cost: 1, gate: (s) => /^(<~)?[!-uz\s]+(~>)?$/.test(s), run: decoders.ascii85 },
  { label: "base58", cost: 2, gate: (s) => /^[1-9A-HJ-NP-Za-km-z]{6,300}$/.test(s.trim()), run: decoders.base58 },
  { label: "base100", cost: 1, gate: (s) => /[\u{1F3F7}-\u{1F4F6}]/u.test(s), run: decoders.base100 },
  { label: "url", cost: 1, gate: (s) => /%[0-9a-fA-F]{2}/.test(s), run: decoders.url },
  { label: "html", cost: 1, gate: (s) => /&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/.test(s), run: decoders.html },
  { label: "unicode", cost: 1, gate: (s) => /\\[ux]/.test(s), run: decoders.unicode },
  { label: "qp", cost: 1, gate: (s) => /=[0-9A-F]{2}/.test(s), run: decoders.qp },
  { label: "uu", cost: 2, gate: (s) => /^begin\s|^[!-M`][ -`]{4,}$/m.test(s), run: decoders.uu },
  { label: "morse", cost: 1, gate: (s) => /^[.\-/\s|•·−–—_\\]+$/.test(s), run: decoders.morse },
  { label: "bacon", cost: 1, gate: (s) => /^[abAB01\s/]{10,}$/.test(s), run: decoders.bacon },
  { label: "braille", cost: 1, gate: (s) => /[\u2800-\u28ff]/.test(s), run: decoders.braille },
  { label: "rot13", cost: 3, gate: (s, prev) => !LETTER_OPS.has(prev) && letterCount(s) >= 2, run: decoders.rot13 },
  {
    label: "caesar",
    cost: 3,
    gate: (s, prev) => !LETTER_OPS.has(prev) && letterShare(s) >= 0.8 && /[A-Za-z]{4}/.test(s),
    run: (s, sample) => {
      const b = bestCaesar(s, sample);
      return b ? { text: b.out, label: "rot" + b.k } : null;
    },
  },
  { label: "atbash", cost: 3, gate: (s, prev) => !LETTER_OPS.has(prev) && letterCount(s) >= 2, run: decoders.atbash },
  { label: "reverse", cost: 3, gate: (s, prev) => prev !== "reverse" && s.length >= 4, run: decoders.reverse },
  { label: "rot47", cost: 3, gate: (s, prev) => prev !== "rot47" && /[!-/:-@[-`{-~]/.test(s) && /^[!-~\s]+$/.test(s), run: decoders.rot47 },
  {
    label: "rail",
    cost: 4,
    gate: (s, prev) => prev !== "rail" && s.length >= 8 && s.length <= 600,
    run: (s, sample) => {
      const b = bestRail(s, sample);
      return b ? { text: b.out, label: "rail" + b.r } : null;
    },
  },
  {
    label: "xor",
    cost: 2,
    gate: (s) => /^[0-9a-fA-F\s]{12,}$/.test(s) && s.replace(/\s+/g, "").length % 2 === 0,
    run: (s, sample) => {
      const bytes = transforms.hexBytes(s);
      const b = bytes ? transforms.bestSingleByteXor(bytes, sample) : null;
      return b && b.fit >= 0.3 ? { text: b.text, label: "xor0x" + b.key.toString(16).padStart(2, "0") } : null;
    },
  },
];

function scoreText(text, crib, sample) {
  const fit = englishFit(text.slice(0, sample));
  let score = fit;
  if (/[A-Za-z0-9_]{2,}\{[^}\s]{1,80}\}/.test(text)) score += 0.3;
  if (crib && text.toLowerCase().includes(crib)) score += 10;
  return { fit, score };
}

function printable(s) {
  if (!s) return false;
  let ok = 0;
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    n++;
    if (cp === 9 || cp === 10 || cp === 13 || (cp >= 32 && cp < 127) || cp >= 160) ok++;
  }
  return ok / n >= 0.95;
}

function solveLayers(text, opts) {
  const options = opts || {};
  const input = String(text || "").slice(0, LIMITS.maxInput);
  const depth = Math.max(1, Math.min(LIMITS.maxDepth, Number(options.depth) || LIMITS.defaultDepth));
  const maxExpansions = Math.max(1, Math.min(LIMITS.maxExpansions, Number(options.maxExpansions) || LIMITS.maxExpansions));
  const maxStates = Math.max(1, Math.min(LIMITS.maxStates, Number(options.maxStates) || LIMITS.maxStates));
  const sample = Math.max(80, Math.min(LIMITS.fitSample, Number(options.fitSample) || LIMITS.fitSample));
  const crib = options.crib ? String(options.crib).toLowerCase() : "";
  const seen = new Set([input]);
  const root = scoreText(input, crib, sample);
  const queue = [{ text: input, path: [], cost: 0, prev: "", score: root.score }];
  const results = [{ text: input, path: [], cost: 0, prev: "", score: root.score, fit: root.fit }];
  let expanded = 0;
  let generated = 0;
  let stoppedBy = "exhausted";
  while (queue.length) {
    if (expanded >= maxExpansions) {
      stoppedBy = "expansion limit";
      break;
    }
    if (generated >= maxStates) {
      stoppedBy = "state limit";
      break;
    }
    queue.sort((a, b) => a.cost - b.cost || b.score - a.score);
    const node = queue.shift();
    expanded++;
    if (node.path.length >= depth) continue;
    for (const step of STEPS) {
      if (!step.gate(node.text, node.prev)) continue;
      let out;
      try {
        out = step.run(node.text, sample);
      } catch {
        out = null;
      }
      if (!out) continue;
      const label = typeof out === "object" ? out.label : step.label;
      const value = typeof out === "object" ? out.text : out;
      if (!value || value === node.text || value.length > 4000 || seen.has(value) || !printable(value)) continue;
      seen.add(value);
      generated++;
      const rated = scoreText(value, crib, sample);
      const child = { text: value, path: node.path.concat(label), cost: node.cost + step.cost, prev: step.label, score: rated.score, fit: rated.fit };
      results.push(child);
      if (crib && value.toLowerCase().includes(crib)) {
        stoppedBy = "crib found";
        queue.length = 0;
        break;
      }
      if (!crib && rated.fit >= 0.85) {
        stoppedBy = "readable result";
        queue.length = 0;
        break;
      }
      if (rated.fit < 0.7) queue.push(child);
      if (generated >= maxStates) break;
    }
  }
  results.sort((a, b) => b.score - a.score || a.path.length - b.path.length);
  return {
    results: results.slice(0, options.limit || 8).map((r) => ({ path: r.path, text: r.text, score: Math.round(r.score * 1000) / 1000, fit: r.fit })),
    stats: { expanded, generated, depth, maxExpansions, maxStates, fitSample: sample, stoppedBy, truncated: String(text || "").length > LIMITS.maxInput },
  };
}

module.exports = { solveLayers, LAYER_LIMITS: LIMITS, LAYER_STEPS: STEPS.map((s) => s.label) };
