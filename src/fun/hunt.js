const crypto = require("node:crypto");
const fs = require("node:fs");
const readline = require("node:readline");
const config = require("../config");

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

const { findMatches, getServiceFamily, tryParseInputUrl } = require("./backlink/engine");

async function backlink(message, raw) {
  const input = (raw || "").trim();
  if (!input) {
    await message.channel.send("Usage: `ts backlink <id or url>`");
    return;
  }
  const lines = [];
  const parsed = tryParseInputUrl(input);
  const family = parsed ? getServiceFamily(parsed.hostname) : null;
  if (parsed && (family === "tinyurl" || family === "bitly" || family === "googl")) {
    try {
      const res = await fetch(input.startsWith("http") ? input : "https://" + input, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "syndication-bot" },
      });
      lines.push("resolves to: <" + res.url + "> (" + res.status + ")");
    } catch {
      lines.push("shortener did not resolve.");
    }
  }
  const matches = findMatches(input, 60);
  const ranked = matches.slice().sort((a, b) => b.score - a.score);
  const top = ranked.filter((m) => m.confidence !== "low").slice(0, 10);
  for (const m of top) lines.push("[" + m.confidence + "] " + m.name + " `" + m.matched + "`\n<" + m.url + ">");
  if (!top.length && ranked.length) {
    const m = ranked[0];
    lines.push("[low] " + m.name + " `" + m.matched + "`\n<" + m.url + ">");
    lines.push("+" + (ranked.length - 1) + " more low-confidence matches.");
  }
  await message.channel.send(lines.length ? cut(lines.join("\n\n")) : "No known service matches that ID.");
}

function zwScan(text) {
  const bits = [];
  let zwsp = 0;
  let zwnj = 0;
  let zwj = 0;
  let feff = 0;
  for (const c of text) {
    if (c === "​") {
      bits.push("0");
      zwsp++;
    } else if (c === "‌") {
      bits.push("1");
      zwnj++;
    } else if (c === "‍") zwj++;
    else if (c === "﻿") feff++;
  }
  return { bits: bits.join(""), zwsp, zwnj, zwj, feff };
}

function zwDecode(bits) {
  let out = "";
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
  }
  return out;
}

const BRAILLE = {
  "⠁": "a", "⠃": "b", "⠉": "c", "⠙": "d", "⠑": "e", "⠋": "f", "⠛": "g", "⠓": "h", "⠊": "i", "⠚": "j",
  "⠅": "k", "⠇": "l", "⠍": "m", "⠝": "n", "⠕": "o", "⠏": "p", "⠟": "q", "⠗": "r", "⠎": "s", "⠞": "t",
  "⠥": "u", "⠧": "v", "⠺": "w", "⠭": "x", "⠽": "y", "⠵": "z", "⠀": " ",
};
const BRAILLE_REV = Object.fromEntries(Object.entries(BRAILLE).map(([k, v]) => [v, k]));

function brailleDecode(s) {
  let out = "";
  let num = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "⠼") {
      num = true;
      continue;
    }
    const letter = BRAILLE[c];
    if (!letter) {
      out += c === " " ? " " : "?";
      num = false;
      continue;
    }
    if (num && letter >= "a" && letter <= "j") {
      out += letter === "j" ? "0" : String(letter.charCodeAt(0) - 96);
    } else {
      out += letter;
      num = false;
    }
  }
  return out;
}

const TAP_ROWS = ["abcde", "fghij", "lmnop", "qrstu", "vwxyz"];

function tapDecode(s) {
  const nums = s.trim().split(/\s+/).map(Number);
  if (nums.length % 2 !== 0 || nums.some((n) => !(n >= 1 && n <= 5))) return null;
  let out = "";
  for (let i = 0; i < nums.length; i += 2) {
    out += TAP_ROWS[nums[i] - 1][nums[i + 1] - 1];
  }
  return out;
}

function tapEncode(s) {
  let out = [];
  for (const c of s.toLowerCase()) {
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
    if (!done) return null;
  }
  return out.join(" ");
}

let dictCache = null;

function loadDict() {
  if (dictCache) return dictCache;
  const paths = [config.dict, "/usr/share/dict/words", "/usr/share/dict/american-english"];
  for (const p of paths) {
    try {
      const words = fs.readFileSync(p, "utf8").split("\n").map((w) => w.trim().toLowerCase()).filter((w) => /^[a-z]{2,15}$/.test(w));
      if (words.length > 1000) {
        dictCache = new Set(words);
        return dictCache;
      }
    } catch {}
  }
  return new Set();
}

function signature(w) {
  return [...w].sort().join("");
}

function anagram(letters) {
  const t = letters.toLowerCase().replace(/[^a-z]/g, "");
  if (t.length < 2 || t.length > 12) return null;
  const dict = loadDict();
  if (!dict.size) return null;
  const sig = signature(t);
  const hits = [];
  for (const w of dict) {
    if (w.length === t.length && signature(w) === sig && w !== t) hits.push(w);
  }
  return hits.slice(0, 20);
}

function phoneWords(digits) {
  const t = digits.replace(/\D/g, "");
  if (t.length < 2 || t.length > 7 || /[01]/.test(t)) return null;
  const pad = { 2: "abc", 3: "def", 4: "ghi", 5: "jkl", 6: "mno", 7: "pqrs", 8: "tuv", 9: "wxyz" };
  const dict = loadDict();
  if (!dict.size) return null;
  let combos = [""];
  for (const d of t) {
    const next = [];
    for (const c of combos) for (const l of pad[d]) next.push(c + l);
    combos = next;
  }
  return combos.filter((w) => dict.has(w)).slice(0, 20);
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

async function webRecon(message, url) {
  if (!/^https?:\/\//i.test(url)) {
    await message.channel.send("Usage: `ts web <http(s) url>`");
    return;
  }
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "syndication-bot" },
    });
  } catch {
    await message.channel.send("Fetch failed.");
    return;
  }
  const lines = ["status: " + res.status + " <- " + res.url];
  const g = (n) => res.headers.get(n);
  if (g("server")) lines.push("server: " + g("server"));
  if (g("x-powered-by")) lines.push("powered-by: " + g("x-powered-by"));
  const sec = ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy"];
  const missing = sec.filter((h) => !g(h));
  lines.push("missing-headers: " + (missing.length ? missing.join(", ") : "none"));
  try {
    const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (cookies.length) lines.push("cookies: " + cookies.map((c) => c.split(";")[0]).join(", "));
  } catch {}
  let body = "";
  try {
    body = (await res.text()).slice(0, 60000);
  } catch {}
  const title = body.match(/<title[^>]*>([\s\S]{0,200})<\/title>/i);
  if (title) lines.push("title: " + title[1].trim());
  const gen = body.match(/<meta[^>]*name=["']generator["'][^>]*content=["']([^"']{0,120})/i);
  if (gen) lines.push("generator: " + gen[1]);
  const comments = [...body.matchAll(/<!--([\s\S]{0,150}? airport)?-->/g)];
  void comments;
  const real = [...body.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => m[1].trim()).filter(Boolean).slice(0, 4);
  for (const c of real) lines.push("comment: " + c.slice(0, 140));
  const scripts = [...body.matchAll(/<script[^>]+src=["']([^"']{0,200})/gi)].map((m) => m[1]).slice(0, 10);
  for (const s of scripts) lines.push("js: " + s);
  try {
    const origin = new URL(res.url).origin;
    const robots = await (
      await fetch(origin + "/robots.txt", { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "syndication-bot" } })
    ).text();
    const picks = robots.split("\n").map((l) => l.trim()).filter((l) => /^(disallow|allow|sitemap)/i.test(l)).slice(0, 12);
    if (picks.length) {
      lines.push("robots.txt:");
      for (const pl of picks) lines.push("  " + pl.slice(0, 140));
    }
  } catch {}
  await message.channel.send(cut(lines.join("\n")));
}

const USER_SITES = [
  ["GitHub", "https://github.com/{}", "status"],
  ["GitLab", "https://gitlab.com/{}", "status"],
  ["Reddit", "https://www.reddit.com/user/{}/about.json", "status"],
  ["npm", "https://www.npmjs.com/~{}", "status"],
  ["PyPI", "https://pypi.org/user/{}/", "status"],
  ["crates.io", "https://crates.io/users/{}", "status"],
  ["Docker Hub", "https://hub.docker.com/v2/users/{}/", "status"],
  ["Keybase", "https://keybase.io/{}", "status"],
  ["Twitch", "https://www.twitch.tv/{}", "status"],
  ["Lichess", "https://lichess.org/@/{}/all", "status"],
  ["TryHackMe", "https://tryhackme.com/p/{}", "status"],
  ["Codepen", "https://codepen.io/{}", "status"],
  ["Replit", "https://replit.com/@{}", "status"],
  ["Scratch", "https://scratch.mit.edu/users/{}/", "status"],
  ["itch.io", "https://{}.itch.io/", "status"],
  ["dev.to", "https://dev.to/{}", "status"],
  ["Medium", "https://medium.com/@{}", "status"],
  ["HackerOne", "https://hackerone.com/{}", "status"],
  ["Telegram", "https://t.me/{}", "has:tgme_page_extra"],
  ["Steam", "https://steamcommunity.com/id/{}", "not:The specified profile could not be found"],
  ["SoundCloud", "https://soundcloud.com/{}", "status"],
  ["YouTube", "https://www.youtube.com/@{}", "not:404 Not Found"],
];

async function userCheck(message, name) {
  if (!/^[A-Za-z0-9_.-]{2,32}$/.test(name)) {
    await message.channel.send("Usage: `ts user <username>` (letters, digits, _.-)");
    return;
  }
  const jobs = USER_SITES.map(async ([site, tpl, rule]) => {
    try {
      const res = await fetch(tpl.replace("{}", encodeURIComponent(name)), {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) syndication-bot" },
      });
      if (!res.ok) return null;
      if (rule === "status") return site + ": <" + tpl.replace("{}", name) + ">";
      const text = (await res.text()).slice(0, 60000);
      if (rule.startsWith("has:")) {
        return text.includes(rule.slice(4)) ? site + ": <" + tpl.replace("{}", name) + ">" : null;
      }
      if (rule.startsWith("not:")) {
        return text.includes(rule.slice(4)) ? null : site + ": <" + tpl.replace("{}", name) + ">";
      }
      return null;
    } catch {
      return null;
    }
  });
  const found = (await Promise.all(jobs)).filter(Boolean);
  await message.channel.send(
    found.length ? cut("`" + name + "` found on " + found.length + "/" + USER_SITES.length + ":\n" + found.join("\n")) : "No hits for `" + name + "`."
  );
}

function jwtForge(payloadText) {
  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return null;
  }
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return b64u({ alg: "none", typ: "JWT" }) + "." + b64u(payload) + ".";
}

async function jwtCrack(message, tok) {
  const parts = (tok || "").trim().split(".");
  if (parts.length !== 3) {
    await message.channel.send("Usage: `ts jwt crack <token>`");
    return;
  }
  let alg;
  try {
    alg = JSON.parse(Buffer.from(parts[0], "base64").toString("utf8")).alg;
  } catch {
    await message.channel.send("Unreadable header.");
    return;
  }
  const hash = { HS256: "sha256", HS384: "sha384", HS512: "sha512" }[alg];
  if (!hash) {
    await message.channel.send("Only HS256/HS384/HS512 supported. Try `ts jwt none` for unsigned.");
    return;
  }
  if (!fs.existsSync(config.wordlist)) {
    await message.channel.send("Wordlist not found at `" + config.wordlist + "`. Set WORDLIST.");
    return;
  }
  await message.channel.send("Cracking " + alg + ", runs until found or the list ends…");
  const signing = parts[0] + "." + parts[1];
  const target = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  let tried = 0;
  const cap = 5000000;
  try {
    const rl = readline.createInterface({ input: fs.createReadStream(config.wordlist), crlfDelay: Infinity });
    for await (const line of rl) {
      const w = line.replace(/\r$/, "");
      tried++;
      const mac = crypto.createHmac(hash, w).update(signing).digest();
      if (mac.length === target.length && crypto.timingSafeEqual(mac, target)) {
        await message.channel.send("Secret: `" + w + "` (" + tried + " tries)");
        rl.close();
        return;
      }
      if (tried >= cap) break;
    }
  } catch {}
  await message.channel.send("Not found in first " + tried + " entries.");
}

module.exports = async function hunt(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();

  if (lower.startsWith(p + "backlink ")) {
    await backlink(message, arg(p + "backlink "));
    return true;
  }
  if (lower.startsWith(p + "zw")) {
    const rest = content.slice((p + "zw").length).trim();
    const scan = zwScan(rest || "");
    if (!scan.bits.length) {
      await message.channel.send("No zero-width characters. Counts ZWSP/ZWNJ/ZWJ/FEFF: 0/0/0/0.");
      return true;
    }
    let out = "ZWSP:" + scan.zwsp + " ZWNJ:" + scan.zwnj + " ZWJ:" + scan.zwj + " FEFF:" + scan.feff + " bits:" + scan.bits.length;
    if (scan.bits.length >= 8) out += "\ndecoded: " + zwDecode(scan.bits).slice(0, 400);
    else out += "\nbits: " + scan.bits;
    await message.channel.send(cut(out));
    return true;
  }
  if (lower.startsWith(p + "braille ")) {
    const [mode, ...rest] = arg(p + "braille ").split(/\s+/);
    const text = rest.join(" ");
    if (mode === "decode") {
      await message.channel.send(cut(brailleDecode(text) || "(empty)"));
      return true;
    }
    if (mode === "encode") {
      await message.channel.send(cut([...text.toLowerCase()].map((c) => BRAILLE_REV[c] || (c === " " ? "⠀" : "?")).join("") || "(empty)"));
      return true;
    }
    await message.channel.send("Usage: `ts braille encode|decode <text>`");
    return true;
  }
  if (lower.startsWith(p + "tap ")) {
    const [mode, ...rest] = arg(p + "tap ").split(/\s+/);
    const text = rest.join(" ");
    if (mode === "decode") {
      const out = tapDecode(text);
      await message.channel.send(out === null ? "Usage: `ts tap decode 1 5 1 1` (row col pairs)" : cut(out));
      return true;
    }
    if (mode === "encode") {
      const out = tapEncode(text);
      await message.channel.send(out === null ? "Letters a-z only (k becomes c)." : cut(out));
      return true;
    }
    await message.channel.send("Usage: `ts tap encode|decode <text>`");
    return true;
  }
  if (lower.startsWith(p + "anagram ")) {
    const hits = anagram(arg(p + "anagram "));
    await message.channel.send(hits === null ? "Need 2-12 letters." : hits.length ? cut(hits.join(", ")) : "No anagrams in dictionary.");
    return true;
  }
  if (lower.startsWith(p + "phone ")) {
    const hits = phoneWords(arg(p + "phone "));
    await message.channel.send(hits === null ? "Need 2-7 digits, no 0/1." : hits.length ? cut(hits.join(", ")) : "No dictionary words match.");
    return true;
  }
  if (lower.startsWith(p + "bf ")) {
    const out = bf(arg(p + "bf "), 200000);
    await message.channel.send(out === null ? "Unbalanced brackets." : cut(out === "" ? "(no output)" : out));
    return true;
  }
  if (lower.startsWith(p + "web ")) {
    await webRecon(message, arg(p + "web ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "user ")) {
    await userCheck(message, arg(p + "user ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "jwt none ")) {
    const out = jwtForge(arg(p + "jwt none "));
    await message.channel.send(out === null ? "Usage: `ts jwt none {\"user\":\"admin\"}`" : cut(out));
    return true;
  }
  if (lower.startsWith(p + "jwt crack ")) {
    await jwtCrack(message, arg(p + "jwt crack ").split(/\s+/)[0] || "");
    return true;
  }
  return false;
};
