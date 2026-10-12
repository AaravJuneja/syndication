const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

function squareFrom(key) {
  const seen = new Set();
  let s = "";
  for (const c of String(key || "").toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "")) {
    if (!seen.has(c)) {
      seen.add(c);
      s += c;
    }
  }
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (c === "J" || seen.has(c)) continue;
    seen.add(c);
    s += c;
  }
  return s;
}

function posMap(sq) {
  const m = {};
  for (let i = 0; i < sq.length; i++) m[sq[i]] = [Math.floor(i / 5), i % 5];
  return m;
}

function at(sq, r, c) {
  return sq[((r % 5 + 5) % 5) * 5 + ((c % 5 + 5) % 5)];
}

function playfairPrep(t, filler) {
  t = String(t).toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "");
  let out = "";
  let i = 0;
  while (i < t.length) {
    const a = t[i];
    if (i + 1 >= t.length) {
      out += a + filler;
      i++;
    } else if (t[i] === t[i + 1]) {
      out += a + filler;
      i++;
    } else {
      out += a + t[i + 1];
      i += 2;
    }
  }
  return out;
}

function playfair(text, key, decode) {
  const sq = squareFrom(key);
  const pm = posMap(sq);
  const dir = decode ? -1 : 1;
  const t = decode ? String(text).toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "") : playfairPrep(text, "X");
  let out = "";
  for (let i = 0; i + 1 < t.length; i += 2) {
    const p1 = pm[t[i]];
    const p2 = pm[t[i + 1]];
    if (!p1 || !p2) continue;
    if (p1[0] === p2[0]) out += at(sq, p1[0], p1[1] + dir) + at(sq, p2[0], p2[1] + dir);
    else if (p1[1] === p2[1]) out += at(sq, p1[0] + dir, p1[1]) + at(sq, p2[0] + dir, p2[1]);
    else out += at(sq, p1[0], p2[1]) + at(sq, p2[0], p1[1]);
  }
  return out;
}

function bifid(text, key, period, decode) {
  const sq = squareFrom(key);
  const pm = posMap(sq);
  const t = String(text).toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "");
  if (!t) return "";
  const n = period >= 2 ? period : t.length;
  let out = "";
  for (let b = 0; b < t.length; b += n) {
    const blk = t.slice(b, b + n);
    const m = blk.length;
    if (!decode) {
      const rows = [];
      const cols = [];
      for (const ch of blk) {
        const p = pm[ch];
        rows.push(p[0]);
        cols.push(p[1]);
      }
      const s = rows.concat(cols);
      for (let i = 0; i < m; i++) out += sq[s[2 * i] * 5 + s[2 * i + 1]];
    } else {
      const s = [];
      for (const ch of blk) {
        const p = pm[ch];
        s.push(p[0], p[1]);
      }
      const rows = s.slice(0, m);
      const cols = s.slice(m);
      for (let i = 0; i < m; i++) out += sq[rows[i] * 5 + cols[i]];
    }
  }
  return out;
}

const TRIFID_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ_";

function trifidSquare(key) {
  const seen = new Set();
  let s = "";
  for (const c of String(key || "").toUpperCase().replace(/\+/g, "_").replace(/[^A-Z_]/g, "")) {
    if (!seen.has(c)) {
      seen.add(c);
      s += c;
    }
  }
  for (const c of TRIFID_ALPHA) {
    if (!seen.has(c)) {
      seen.add(c);
      s += c;
    }
  }
  return s;
}

function trifidPos(sq) {
  const m = {};
  for (let i = 0; i < 27; i++) m[sq[i]] = [Math.floor(i / 9), Math.floor((i % 9) / 3), i % 3];
  return m;
}

function trifid(text, key, period, decode) {
  const sq = trifidSquare(key);
  const pm = trifidPos(sq);
  const t = String(text).toUpperCase().replace(/[^A-Z]/g, "_").replace(/\+/g, "_");
  if (!t) return "";
  const n = period >= 2 ? period : 5;
  let out = "";
  for (let b = 0; b < t.length; b += n) {
    const blk = t.slice(b, b + n);
    const m = blk.length;
    if (!decode) {
      const L = [];
      const R = [];
      const C = [];
      for (const ch of blk) {
        const p = pm[ch];
        L.push(p[0]);
        R.push(p[1]);
        C.push(p[2]);
      }
      const s = L.concat(R, C);
      for (let i = 0; i < m; i++) out += sq[(s[3 * i] ) * 9 + s[3 * i + 1] * 3 + s[3 * i + 2]];
    } else {
      const s = [];
      for (const ch of blk) {
        const p = pm[ch];
        s.push(p[0], p[1], p[2]);
      }
      for (let i = 0; i < m; i++) out += sq[s[i] * 9 + s[m + i] * 3 + s[2 * m + i]];
    }
  }
  return out;
}

function foursquare(text, keys, decode) {
  const g = [0, 1, 2, 3].map((i) => squareFrom(keys[i] || ""));
  const maps = g.map(posMap);
  let t = String(text).toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "");
  if (!decode && t.length % 2 === 1) t += "X";
  let out = "";
  for (let i = 0; i + 1 < t.length; i += 2) {
    if (!decode) {
      const p1 = maps[0][t[i]];
      const p2 = maps[3][t[i + 1]];
      if (!p1 || !p2) continue;
      out += at(g[1], p1[0], p2[1]) + at(g[2], p2[0], p1[1]);
    } else {
      const q1 = maps[1][t[i]];
      const q2 = maps[2][t[i + 1]];
      if (!q1 || !q2) continue;
      out += at(g[0], q1[0], q2[1]) + at(g[3], q2[0], q1[1]);
    }
  }
  return out;
}

function twosquare(text, keys, decode, vertical) {
  const g = [squareFrom(keys[0] || ""), squareFrom(keys[1] || "")];
  const maps = g.map(posMap);
  let t = String(text).toUpperCase().replace(/J/g, "I").replace(/[^A-Z]/g, "");
  if (!decode && t.length % 2 === 1) t += "X";
  let out = "";
  for (let i = 0; i + 1 < t.length; i += 2) {
    if (!decode) {
      const p1 = maps[0][t[i]];
      const p2 = maps[1][t[i + 1]];
      if (!p1 || !p2) continue;
      const same = vertical ? p1[1] === p2[1] : p1[0] === p2[0];
      if (same) out += t[i + 1] + t[i];
      else out += at(g[1], p1[0], p2[1]) + at(g[0], p2[0], p1[1]);
    } else {
      const q1 = maps[1][t[i]];
      const q2 = maps[0][t[i + 1]];
      if (!q1 || !q2) continue;
      const same = vertical ? q1[1] === q2[1] : q1[0] === q2[0];
      if (same) out += t[i + 1] + t[i];
      else out += at(g[0], q1[0], q2[1]) + at(g[1], q2[0], q1[1]);
    }
  }
  return out;
}

function parseOpts(parts) {
  const o = { key: "", keys: [], n: 0, vert: false, text: "" };
  const rest = [];
  for (const tok of parts) {
    const low = tok.toLowerCase();
    if (/^(k|key)=/.test(low)) o.key = tok.slice(tok.indexOf("=") + 1);
    else if (/^keys=/.test(low)) o.keys = tok.slice(5).split(",");
    else if (/^n=\d+$/.test(low)) o.n = parseInt(low.slice(2));
    else if (low === "vert" || low === "vertical") o.vert = true;
    else rest.push(tok);
  }
  o.text = rest.join(" ");
  return o;
}

module.exports = async function squares(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();

  if (lower.startsWith(p + "playfair ")) {
    const parts = arg(p + "playfair ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts playfair encode|decode [k=KEY] <text>` (J joins I, filler X)");
      return true;
    }
    await message.channel.send(cut(playfair(o.text, o.key, mode === "decode") || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "bifid ")) {
    const parts = arg(p + "bifid ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts bifid encode|decode [k=KEY] [n=period] <text>`");
      return true;
    }
    await message.channel.send(cut(bifid(o.text, o.key, o.n, mode === "decode") || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "trifid ")) {
    const parts = arg(p + "trifid ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts trifid encode|decode [k=KEY] [n=5] <text>` (space becomes _)");
      return true;
    }
    await message.channel.send(cut(trifid(o.text, o.key, o.n || 5, mode === "decode") || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "foursquare ")) {
    const parts = arg(p + "foursquare ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts foursquare encode|decode [keys=K1,K2,K3,K4] <text>`");
      return true;
    }
    await message.channel.send(cut(foursquare(o.text, o.keys, mode === "decode") || "(empty)"));
    return true;
  }
  if (lower.startsWith(p + "twosquare ")) {
    const parts = arg(p + "twosquare ").split(/\s+/);
    const mode = (parts.shift() || "").toLowerCase();
    const o = parseOpts(parts);
    if ((mode !== "encode" && mode !== "decode") || !o.text) {
      await message.channel.send("Usage: `ts twosquare encode|decode [keys=K1,K2] [vert] <text>`");
      return true;
    }
    await message.channel.send(cut(twosquare(o.text, o.keys, mode === "decode", o.vert) || "(empty)"));
    return true;
  }
  return false;
};
