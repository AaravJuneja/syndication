const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

function parseOpts(parts) {
  const o = { key: "", n: 0, drop: 0, vert: false, colrow: false, input: "", text: "" };
  const rest = [];
  for (const tok of parts) {
    const low = tok.toLowerCase();
    if (/^(k|key)=/.test(low)) o.key = tok.slice(tok.indexOf("=") + 1);
    else if (/^n=\d+$/.test(low)) o.n = parseInt(low.slice(2));
    else if (/^drop=\d+$/.test(low)) o.drop = parseInt(low.slice(5));
    else if (/^in=/.test(tok)) o.input = tok.slice(3);
    else rest.push(tok);
  }
  o.text = rest.join(" ");
  return o;
}

function polyGrid(key) {
  const seen = new Set();
  let s = "";
  for (const c of String(key || "").toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "")) {
    if (!seen.has(c)) {
      seen.add(c);
      s += c;
    }
  }
  for (const c of "ABCDEFGHIKLMNOPQRSTUVWXYZ") {
    if (!seen.has(c)) {
      seen.add(c);
      s += c;
    }
  }
  return s;
}

function polybius(text, key, colrow, decode) {
  const g = polyGrid(key);
  const idx = {};
  for (let i = 0; i < 25; i++) idx[g[i]] = [Math.floor(i / 5) + 1, (i % 5) + 1];
  if (!decode) {
    const t = String(text).toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "");
    if (!t) return "";
    return [...t].map((c) => {
      const p = idx[c];
      return colrow ? "" + p[1] + p[0] : "" + p[0] + p[1];
    }).join(" ");
  }
  const t = String(text).replace(/\s+/g, "");
  if (!t || t.length % 2 !== 0 || !/^[1-5]+$/.test(t)) return null;
  let out = "";
  for (let i = 0; i < t.length; i += 2) {
    const a = parseInt(colrow ? t[i + 1] : t[i]) - 1;
    const b = parseInt(colrow ? t[i] : t[i + 1]) - 1;
    out += g[a * 5 + b];
  }
  return out;
}

const PIGPEN = {
  A: "┘", B: "┴", C: "└", D: "├", E: "□", F: "┤", G: "┌", H: "┬", I: "┐",
  J: "┘·", K: "┴·", L: "└·", M: "├·", N: "□·", O: "┤·", P: "┌·", Q: "┬·", R: "┐·",
  S: "∨", T: ">", U: "∧", V: "<",
  W: "∨·", X: ">·", Y: "∧·", Z: "<·",
};
const PIGPEN_REV = {};
for (const k in PIGPEN) PIGPEN_REV[PIGPEN[k]] = k;

function pigpen(text, decode) {
  if (!decode) {
    let out = "";
    for (const c of String(text).toUpperCase()) {
      if (c === " ") out += " ";
      else if (PIGPEN[c]) out += PIGPEN[c];
    }
    return out;
  }
  const t = String(text).replace(/\s+/g, "").replace(/\./g, "·");
  if (!t) return null;
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const two = t.slice(i, i + 2);
    if (PIGPEN_REV[two]) {
      out += PIGPEN_REV[two];
      i++;
    } else if (PIGPEN_REV[t[i]]) out += PIGPEN_REV[t[i]];
    else return null;
  }
  return out;
}

const KB_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

function kbShift(text, dir, n) {
  const right = {};
  const left = {};
  for (const row of KB_ROWS) {
    for (let i = 0; i < row.length; i++) {
      right[row[i]] = row[(i + 1) % row.length];
      left[row[i]] = row[(i - 1 + row.length) % row.length];
    }
  }
  const down = { q: "a", w: "s", e: "d", r: "f", t: "g", y: "h", u: "j", i: "k", o: "l", p: "l", a: "z", s: "x", d: "c", f: "v", g: "b", h: "n", j: "m", k: "m", l: "m" };
  const up = {};
  for (const k in down) if (!(down[k] in up)) up[down[k]] = k;
  up.a = "q";
  up.s = "w";
  up.d = "e";
  up.f = "r";
  up.g = "t";
  up.h = "y";
  up.j = "u";
  up.k = "i";
  up.l = "o";
  up.z = "a";
  up.x = "s";
  up.c = "d";
  up.v = "f";
  up.b = "g";
  up.n = "h";
  up.m = "j";
  const map = dir === "right" ? right : dir === "left" ? left : dir === "down" ? down : up;
  let t = String(text);
  for (let s = 0; s < (n || 1); s++) {
    let out = "";
    for (const c of t) {
      const low = c.toLowerCase();
      if (map[low]) {
        const m = map[low];
        out += c === low ? m : m.toUpperCase();
      } else out += c;
    }
    t = out;
  }
  return t;
}

function rc4(data, key, drop) {
  const kb = Buffer.from(String(key), "utf8");
  if (!kb.length) return null;
  const S = [...Array(256).keys()];
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + kb[i % kb.length]) % 256;
    [S[i], S[j]] = [S[j], S[i]];
  }
  let ii = 0;
  let jj = 0;
  const next = () => {
    ii = (ii + 1) % 256;
    jj = (jj + S[ii]) % 256;
    [S[ii], S[jj]] = [S[jj], S[ii]];
    return S[(S[ii] + S[jj]) % 256];
  };
  for (let d = 0; d < (drop || 0); d++) next();
  return Buffer.from(data.map((b) => b ^ next()));
}

function egcd(a, b) {
  if (b === 0) return [a, 1, 0];
  const [g, x, y] = egcd(b, a % b);
  return [g, y, x - Math.floor(a / b) * y];
}

function modInv(a, m) {
  const [g, x] = egcd(((a % m) + m) % m, m);
  if (g !== 1) return null;
  return ((x % m) + m) % m;
}

function hill(text, keyStr, decode) {
  const nums = String(keyStr || "").split(/[\s,]+/).filter(Boolean).map(Number);
  if (nums.length !== 4 || nums.some((x) => !Number.isInteger(x))) return null;
  const [a, b, c, d] = nums.map((x) => ((x % 26) + 26) % 26);
  const det = (((a * d - b * c) % 26) + 26) % 26;
  const di = modInv(det, 26);
  if (di === null) return "badkey";
  const inv = [(d * di) % 26, ((-b * di) % 26 + 26) % 26, ((-c * di) % 26 + 26) % 26, (a * di) % 26];
  let t = String(text).toUpperCase().replace(/[^A-Z]/g, "");
  if (!t) return "";
  if (!decode && t.length % 2 === 1) t += "X";
  if (decode && t.length % 2 === 1) return null;
  const M = decode ? inv : [a, b, c, d];
  let out = "";
  for (let i = 0; i < t.length; i += 2) {
    const p0 = t.charCodeAt(i) - 65;
    const p1 = t.charCodeAt(i + 1) - 65;
    out += String.fromCharCode(65 + ((M[0] * p0 + M[1] * p1) % 26)) + String.fromCharCode(65 + ((M[2] * p0 + M[3] * p1) % 26));
  }
  return out;
}

function deadfishRun(prog) {
  let acc = 0;
  const out = [];
  for (const c of String(prog)) {
    if (c === "i") acc++;
    else if (c === "d") acc--;
    else if (c === "s") acc = acc * acc;
    else if (c === "o") out.push(acc);
    else if (c === "h") break;
    else continue;
    if (acc === -1 || acc === 256) acc = 0;
    if (out.length > 200) break;
  }
  return out;
}

function deadfishEncode(text) {
  const targets = [...String(text)].map((c) => c.codePointAt(0));
  if (targets.some((v) => v > 1200)) return null;
  let acc = 0;
  let prog = "";
  for (const v of targets) {
    const seen = new Map([[acc, ""]]);
    const q = [acc];
    let path = null;
    while (q.length) {
      const cur = q.shift();
      const ops = seen.get(cur);
      if (cur === v) {
        path = ops;
        break;
      }
      if (ops.length > 64) continue;
      const nexts = [cur + 1, cur - 1, cur * cur];
      const chars = ["i", "d", "s"];
      for (let k = 0; k < 3; k++) {
        let nv = nexts[k];
        if (nv === -1 || nv === 256) nv = 0;
        if (nv < -1 || nv > 1400 || seen.has(nv)) continue;
        seen.set(nv, ops + chars[k]);
        q.push(nv);
      }
    }
    if (path === null) return null;
    prog += path + "o";
    acc = v;
  }
  return prog;
}

const COW_TOKS = ["moo", "mOo", "moO", "mOO", "Moo", "MOo", "MoO", "MOO", "OOO", "MMM", "OOM", "oom"];

function cowRun(prog, input) {
  const toks = String(prog).match(/moo|mOo|moO|mOO|Moo|MOo|MoO|MOO|OOO|MMM|OOM|oom/g) || [];
  if (!toks.length) return null;
  const match = {};
  const stack = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i] === "MOO") stack.push(i);
    else if (toks[i] === "moo") {
      const j = stack.pop();
      if (j === undefined) return null;
      match[j] = i;
      match[i] = j;
    }
  }
  if (stack.length) return null;
  const tape = [0];
  let ptr = 0;
  let reg = null;
  let inp = [...String(input || "")];
  let out = "";
  let steps = 0;
  const single = (code) => {
    if (code === 0 || code === 7) return;
    if (code === 1) {
      if (ptr > 0) ptr--;
    } else if (code === 2) {
      ptr++;
      if (ptr >= tape.length) tape.push(0);
    } else if (code === 3) return;
    else if (code === 4) {
      if (tape[ptr] === 0) tape[ptr] = inp.length ? inp.shift().codePointAt(0) : 0;
      else out += String.fromCodePoint(tape[ptr]);
    } else if (code === 5) tape[ptr]--;
    else if (code === 6) tape[ptr]++;
    else if (code === 8) tape[ptr] = 0;
    else if (code === 9) {
      if (reg === null) reg = tape[ptr];
      else {
        tape[ptr] = reg;
        reg = null;
      }
    } else if (code === 10) out += String(tape[ptr]);
    else if (code === 11) {
      const num = inp.join("").match(/^-?\d+/);
      tape[ptr] = num ? parseInt(num[0]) : 0;
      inp = [];
    }
  };
  let pc = 0;
  while (pc < toks.length && steps++ < 200000 && out.length < 500) {
    const code = COW_TOKS.indexOf(toks[pc]);
    if (code === 7) {
      if (tape[ptr] === 0) pc = match[pc];
    } else if (code === 0) {
      if (tape[ptr] !== 0) pc = match[pc];
    } else single(code);
    pc++;
  }
  return out;
}

function wsEncode(text) {
  let out = "";
  for (const c of String(text)) {
    const v = c.codePointAt(0);
    const bits = v.toString(2).replace(/0/g, "S").replace(/1/g, "T");
    out += "SS" + "S" + bits + "L" + "TLSS";
  }
  return out + "LLL";
}

function wsDecode(prog) {
  let t = String(prog);
  t = /[ \t\n]/.test(t) ? [...t].filter((c) => c === " " || c === "\t" || c === "\n").map((c) => (c === " " ? "S" : c === "\t" ? "T" : "L")).join("") : t.toUpperCase().replace(/[^STL]/g, "");
  if (!t) return null;
  let p = 0;
  const stack = [];
  const heap = {};
  let out = "";
  let steps = 0;
  const readNum = () => {
    if (p >= t.length) return null;
    const sign = t[p++] === "T" ? -1 : 1;
    let bits = "";
    while (p < t.length && t[p] !== "L") bits += t[p++] === "T" ? "1" : "0";
    if (p >= t.length) return null;
    p++;
    return sign * parseInt(bits || "0", 2);
  };
  const readLabel = () => {
    let l = "";
    while (p < t.length && t[p] !== "L") l += t[p++];
    if (p >= t.length) return null;
    p++;
    return l;
  };
  const marks = {};
  for (let i = 0; i < t.length; i++) {
    if (t.startsWith("LSS", i)) {
      let j = i + 3;
      let l = "";
      while (j < t.length && t[j] !== "L") l += t[j++];
      if (j < t.length) marks[l] = i;
    }
  }
  const callStack = [];
  while (p < t.length && steps++ < 200000 && out.length < 500) {
    if (t.startsWith("SS", p)) {
      p += 2;
      const v = readNum();
      if (v === null) return null;
      stack.push(v);
    } else if (t.startsWith("SLS", p)) {
      if (!stack.length) return null;
      stack.push(stack[stack.length - 1]);
      p += 3;
    } else if (t.startsWith("SLTL", p)) {
      if (stack.length < 2) return null;
      stack.push(stack.splice(stack.length - 2, 1)[0]);
      p += 4;
    } else if (t.startsWith("SLT", p)) {
      p += 3;
      const v = readNum();
      if (v === null || v >= stack.length) return null;
      stack.push(stack[stack.length - 1 - v]);
    } else if (t.startsWith("SLL", p)) {
      if (!stack.length) return null;
      stack.pop();
      p += 3;
    } else if (t.startsWith("STL", p)) {
      p += 3;
      const v = readNum();
      if (v === null || v >= stack.length) return null;
      stack.splice(stack.length - 1 - v, v);
    } else if (t.startsWith("TSSS", p)) {
      if (stack.length < 2) return null;
      stack.push(stack.pop() + stack.pop());
      p += 4;
    } else if (t.startsWith("TSST", p)) {
      if (stack.length < 2) return null;
      const a = stack.pop();
      stack.push(stack.pop() - a);
      p += 4;
    } else if (t.startsWith("TSSL", p)) {
      if (stack.length < 2) return null;
      stack.push(stack.pop() * stack.pop());
      p += 4;
    } else if (t.startsWith("TSTS", p)) {
      if (stack.length < 2) return null;
      const a = stack.pop();
      const b = stack.pop();
      if (a === 0) return null;
      stack.push(Math.trunc(b / a));
      p += 4;
    } else if (t.startsWith("TSTT", p)) {
      if (stack.length < 2) return null;
      const a = stack.pop();
      const b = stack.pop();
      if (a === 0) return null;
      stack.push(b % a);
      p += 4;
    } else if (t.startsWith("TTS", p)) {
      if (stack.length < 2) return null;
      heap[stack.pop()] = stack.pop();
      p += 3;
    } else if (t.startsWith("TTT", p)) {
      if (!stack.length) return null;
      stack.push(heap[stack.pop()] || 0);
      p += 3;
    } else if (t.startsWith("LSS", p)) {
      p += 3;
      if (readLabel() === null) return null;
    } else if (t.startsWith("LSL", p)) {
      p += 3;
      const l = readLabel();
      if (l === null || !(l in marks)) return null;
      p = marks[l];
    } else if (t.startsWith("LST", p)) {
      p += 3;
      const l = readLabel();
      if (l === null || !(l in marks)) return null;
      callStack.push(p);
      p = marks[l];
    } else if (t.startsWith("LTS", p)) {
      p += 3;
      const l = readLabel();
      if (l === null || !(l in marks) || !stack.length) return null;
      if (stack.pop() === 0) p = marks[l];
    } else if (t.startsWith("LTT", p)) {
      p += 3;
      const l = readLabel();
      if (l === null || !(l in marks) || !stack.length) return null;
      if (stack.pop() < 0) p = marks[l];
    } else if (t.startsWith("LTL", p)) {
      if (!callStack.length) return null;
      p = callStack.pop();
    } else if (t.startsWith("LLL", p)) break;
    else if (t.startsWith("TLSS", p)) {
      if (!stack.length) return null;
      out += String.fromCodePoint(stack.pop());
      p += 4;
    } else if (t.startsWith("TLST", p)) {
      if (!stack.length) return null;
      out += String(stack.pop());
      p += 4;
    } else if (t.startsWith("TLTS", p) || t.startsWith("TLTT", p)) return null;
    else return null;
  }
  return out;
}

module.exports = async function grids(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();

  if (lower.startsWith(p + "polybius ")) {
    const parts = arg(p + "polybius ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts polybius encode|decode [k=KEY] [colrow] <text>` (J joins I)");
      return true;
    }
    const out = polybius(o.text, o.key, o.colrow, mode === "decode");
    await message.channel.send(out === null ? "Bad Polybius input (pairs of 1-5)." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "pigpen ")) {
    const parts = arg(p + "pigpen ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const text = parts.join(" ");
    if ((mode !== "encode" && mode !== "decode") || !text) {
      await message.channel.send("Usage: `ts pigpen encode|decode <text>`");
      return true;
    }
    const out = pigpen(text, mode === "decode");
    await message.channel.send(out === null ? "Bad Pigpen input." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "kb ")) {
    const parts = arg(p + "kb ").split(/\s+/);
    const dir = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if (!["right", "left", "up", "down"].includes(dir) || !o.text) {
      await message.channel.send("Usage: `ts kb right|left|up|down [n=1] <text>` (QWERTY neighbor shift)");
      return true;
    }
    await message.channel.send(cut(kbShift(o.text, dir, o.n || 1) || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "rc4 ")) {
    const parts = arg(p + "rc4 ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !o.key) {
      await message.channel.send("Usage: `ts rc4 encode|decode k=KEY [drop=N] <text|hex>`");
      return true;
    }
    if (mode === "encode") {
      const out = rc4([...Buffer.from(o.text, "utf8")], o.key, o.drop);
      await message.channel.send(out === null ? "Need a key." : out.toString("hex").toUpperCase() || "(empty)");
      return true;
    }
    const clean = o.text.replace(/\s+/g, "");
    if (!clean || !/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) {
      await message.channel.send("Decode needs even-length hex.");
      return true;
    }
    const out = rc4([...Buffer.from(clean, "hex")], o.key, o.drop);
    await message.channel.send(out === null ? "Need a key." : cut(out.toString("utf8") || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "hill ")) {
    const parts = arg(p + "hill ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text || !o.key) {
      await message.channel.send("Usage: `ts hill encode|decode k=a,b,c,d <text>` (pads X, key must be invertible mod 26)");
      return true;
    }
    const out = hill(o.text, o.key, mode === "decode");
    await message.channel.send(out === null ? "Key must be 4 integers like k=3,3,2,5." : out === "badkey" ? "Key not invertible mod 26 (need gcd(det,26)=1)." : cut(out || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "deadfish ")) {
    const parts = arg(p + "deadfish ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const text = parts.join(" ");
    if (mode === "run" && text) {
      await message.channel.send(deadfishRun(text).join(" ") || "(no output)");
      return true;
    }
    if (mode === "encode" && text) {
      const out = deadfishEncode(text);
      await message.channel.send(out === null ? "Only char codes under 1200." : cut(out));
      return true;
    }
    await message.channel.send("Usage: `ts deadfish run <program>` / `ts deadfish encode <text>`");
    return true;
  }
  if (lower.startsWith(p + "cow ")) {
    const parts = arg(p + "cow ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if (mode !== "run" || !o.text) {
      await message.channel.send("Usage: `ts cow run [in=TEXT] <program>`");
      return true;
    }
    const out = cowRun(o.text, o.input);
    await message.channel.send(out === null ? "Bad Cow program (unmatched MOO/moo or no tokens)." : cut(out === "" ? "(no output)" : out));
    return true;
  }
  if (lower.startsWith(p + "ws ")) {
    const parts = arg(p + "ws ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const text = parts.join(" ");
    if (mode === "encode" && text) {
      await message.channel.send(cut(wsEncode(text.slice(0, 200))));
      return true;
    }
    if (mode === "decode" && text) {
      const out = wsDecode(text);
      await message.channel.send(out === null ? "Bad Whitespace program." : cut(out === "" ? "(no output)" : out));
      return true;
    }
    await message.channel.send("Usage: `ts ws encode <text>` / `ts ws decode <program>` (S/T/L letters or real whitespace)");
    return true;
  }
  return false;
};
