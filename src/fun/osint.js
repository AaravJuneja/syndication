const dns = require("node:dns").promises;
const fs = require("node:fs");
const path = require("node:path");
const config = require("../config");

const SITES = JSON.parse(fs.readFileSync(path.join(__dirname, "osint", "sites.json"), "utf8"));
const EXCLUDED_PATH = path.join(__dirname, "osint", "sites-excluded.json");

function loadExcluded() {
  try {
    return new Set(JSON.parse(fs.readFileSync(EXCLUDED_PATH, "utf8")));
  } catch {
    return new Set();
  }
}

async function probeUser(name) {
  const entries = Object.entries(SITES);
  const bad = new Set();
  const jobs = entries.map(([site, rule]) => async () => {
    if (rule.r) {
      try {
        if (!new RegExp(rule.r).test(name)) return;
      } catch {
        return;
      }
    }
    try {
      const res = await fetch(rule.u.replace("{}", encodeURIComponent(name)), {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) syndication-bot", Accept: "text/html" },
      });
      if (res.status >= 200 && res.status < 300) bad.add(site);
    } catch {}
  });
  const workers = [];
  for (let i = 0; i < 25; i++) workers.push((async () => { while (jobs.length) await jobs.pop()(); })());
  await Promise.all(workers);
  return bad;
}

function randomName(len) {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < len; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

async function calibrate() {
  const probes = [randomName(24), randomName(24), randomName(8), randomName(8)];
  const bad = new Set();
  for (const name of probes) {
    for (const site of await probeUser(name)) bad.add(site);
  }
  const excluded = [...bad].sort();
  try {
    fs.writeFileSync(EXCLUDED_PATH, JSON.stringify(excluded));
  } catch {}
  return new Set(excluded);
}

function cut(s) {
  s = String(s);
  return s.length > 1900 ? s.slice(0, 1900) + "…" : s;
}

function ghHeaders() {
  const h = { "User-Agent": "syndication-bot", Accept: "application/vnd.github+json" };
  if (config.githubToken) h.Authorization = "Bearer " + config.githubToken;
  return h;
}

async function gh(p) {
  const res = await fetch("https://api.github.com" + p, {
    signal: AbortSignal.timeout(10000),
    headers: ghHeaders(),
  });
  if (res.status === 404) return null;
  if (res.status === 403) return { rateLimited: true };
  if (!res.ok) return null;
  return res.json();
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array(Math.min(n, items.length)).fill(null).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx]);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function ghuser(message, name) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) {
    await message.channel.send("Usage: `ts ghuser <github username>`");
    return;
  }
  const u = await gh("/users/" + name).catch(() => null);
  if (u === null) {
    await message.channel.send("GitHub user not found.");
    return;
  }
  if (!u || u.rateLimited) {
    await message.channel.send("GitHub rate limited, try again later.");
    return;
  }
  const lines = [
    u.login + (u.name ? " (" + u.name + ")" : ""),
    "<" + u.html_url + ">",
    "id: " + u.id + " · type: " + u.type + (u.site_admin ? " · SITE ADMIN" : ""),
    "followers: " + u.followers + " · following: " + u.following + " · repos: " + u.public_repos + " · gists: " + u.public_gists,
    "created: " + String(u.created_at).slice(0, 10),
  ];
  if (u.bio) lines.push("bio: " + String(u.bio).slice(0, 200));
  if (u.company) lines.push("company: " + u.company);
  if (u.location) lines.push("location: " + u.location);
  if (u.email) lines.push("email: " + u.email);
  if (u.blog) lines.push("blog: " + u.blog);
  if (u.twitter_username) lines.push("twitter: @" + u.twitter_username);
  await message.channel.send(cut(lines.join("\n")));
}

async function ghemail(message, email) {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    await message.channel.send("Usage: `ts ghemail <email>`");
    return;
  }
  const r = await gh("/search/users?q=" + encodeURIComponent(email) + "+in:email&per_page=5").catch(() => null);
  if (!r || r.rateLimited) {
    await message.channel.send("GitHub rate limited, try again later.");
    return;
  }
  if (!r.total_count) {
    await message.channel.send("No GitHub user found for that email.");
    return;
  }
  await message.channel.send(cut(r.items.map((u) => u.login + " <" + u.html_url + ">").join("\n")));
}

async function ghemails(message, name) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) {
    await message.channel.send("Usage: `ts ghemails <github username>`");
    return;
  }
  const repos = await gh("/users/" + name + "/repos?per_page=100&type=owner&sort=pushed").catch(() => null);
  if (repos === null) {
    await message.channel.send("GitHub user not found.");
    return;
  }
  if (!repos || repos.rateLimited || !repos.length) {
    await message.channel.send(!repos || repos.rateLimited ? "GitHub rate limited, try again later." : "No repos found.");
    return;
  }
  const found = new Map();
  for (const r of repos.slice(0, 15)) {
    const commits = await gh("/repos/" + name + "/" + r.name + "/commits?author=" + name + "&per_page=5").catch(() => null);
    if (!commits || commits.rateLimited || !Array.isArray(commits)) continue;
    for (const c of commits) {
      for (const e of [c.commit && c.commit.author && c.commit.author.email, c.commit && c.commit.committer && c.commit.committer.email]) {
        if (!e) continue;
        if (!found.has(e)) found.set(e, new Set());
        found.get(e).add(r.name);
      }
    }
  }
  if (!found.size) {
    await message.channel.send("No commit emails harvested (private emails or empty repos).");
    return;
  }
  const lines = [];
  for (const [email, repoSet] of found) {
    const tag = email.endsWith("@users.noreply.github.com") ? " [noreply]" : "";
    lines.push(email + tag + " — " + [...repoSet].slice(0, 4).join(", "));
  }
  await message.channel.send(cut(lines.join("\n")));
}

async function ghkeys(message, name) {
  if (!/^[A-Za-z0-9-]{1,39}$/.test(name)) {
    await message.channel.send("Usage: `ts ghkeys <github username>`");
    return;
  }
  const [ssh, gpg] = await Promise.all([
    gh("/users/" + name + "/keys?per_page=20").catch(() => null),
    gh("/users/" + name + "/gpg_keys?per_page=20").catch(() => null),
  ]);
  if (ssh === null) {
    await message.channel.send("GitHub user not found.");
    return;
  }
  if (!ssh || !gpg || ssh.rateLimited || gpg.rateLimited) {
    await message.channel.send("GitHub rate limited, try again later.");
    return;
  }
  const lines = [];
  for (const k of ssh) lines.push("ssh: " + k.title + " (" + k.id + ")");
  for (const k of gpg) {
    lines.push("gpg: " + k.key_id + ((k.emails || []).map((e) => e.email || e).join(", ") ? " <" + (k.emails || []).map((e) => e.email || e).join(", ") + ">" : ""));
  }
  await message.channel.send(lines.length ? cut(lines.join("\n")) : "No public SSH/GPG keys.");
}

const WMO = {
  0: "clear", 1: "mainly clear", 2: "partly cloudy", 3: "overcast", 45: "fog", 48: "rime fog",
  51: "light drizzle", 53: "drizzle", 55: "heavy drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  71: "light snow", 73: "snow", 75: "heavy snow", 80: "light showers", 81: "showers", 82: "violent showers",
  95: "thunderstorm", 96: "storm+hail", 99: "storm+heavy hail",
};

async function weather(message, city, date) {
  if (!city) {
    await message.channel.send("Usage: `ts weather <city> [YYYY-MM-DD]`");
    return;
  }
  let geo;
  try {
    const res = await fetch("https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(city) + "&count=1", {
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json();
    if (!j.results || !j.results.length) {
      await message.channel.send("City not found.");
      return;
    }
    geo = j.results[0];
  } catch {
    await message.channel.send("Geocoding failed.");
    return;
  }
  const place = geo.name + ", " + (geo.country || "");
  try {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const res = await fetch(
        "https://archive-api.open-meteo.com/v1/archive?latitude=" + geo.latitude + "&longitude=" + geo.longitude + "&start_date=" + date + "&end_date=" + date + "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode",
        { signal: AbortSignal.timeout(10000) }
      );
      const j = await res.json();
      const d = j.daily;
      await message.channel.send(
        place + " on " + date + ": " + (WMO[d.weathercode[0]] || d.weathercode[0]) + ", " + d.temperature_2m_min[0] + "…​" + d.temperature_2m_max[0] + "°C, rain " + d.precipitation_sum[0] + "mm"
      );
      return;
    }
    const res = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=" + geo.latitude + "&longitude=" + geo.longitude + "&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=3",
      { signal: AbortSignal.timeout(10000) }
    );
    const j = await res.json();
    const lines = [place + " 3-day:"];
    for (let i = 0; i < j.daily.time.length; i++) {
      lines.push(j.daily.time[i] + ": " + (WMO[j.daily.weathercode[i]] || j.daily.weathercode[i]) + " " + j.daily.temperature_2m_min[i] + "…" + j.daily.temperature_2m_max[i] + "°C");
    }
    await message.channel.send(lines.join("\n"));
  } catch {
    await message.channel.send("Weather lookup failed.");
  }
}

async function ipinfo(message, target) {
  if (!target) {
    await message.channel.send("Usage: `ts ip <ip or domain>`");
    return;
  }
  let ip = target;
  if (!/^[0-9a-fA-F:.]+$/.test(target) || target.includes("/")) {
    await message.channel.send("Usage: `ts ip <ip or domain>`");
    return;
  }
  if (/[a-zA-Z]/.test(target)) {
    try {
      const recs = await dns.resolve4(target);
      if (!recs.length) {
        await message.channel.send("Could not resolve " + target + ".");
        return;
      }
      ip = recs[0];
    } catch {
      await message.channel.send("Could not resolve " + target + ".");
      return;
    }
  }
  try {
    const res = await fetch("https://ipinfo.io/" + encodeURIComponent(ip) + "/json", {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "syndication-bot" },
    });
    const j = await res.json();
    if (j.error || j.bogon) {
      await message.channel.send("No info for " + target + ".");
      return;
    }
    const lines = [j.ip + (target !== j.ip ? " (" + target + ")" : "")];
    if (j.hostname) lines.push("hostname: " + j.hostname);
    if (j.city || j.country) lines.push([j.city, j.region, j.country].filter(Boolean).join(", ") + (j.loc ? " [" + j.loc + "]" : ""));
    if (j.org) lines.push("org: " + j.org);
    if (j.asn) lines.push("asn: " + j.asn.type + " " + (j.asn.name || ""));
    if (j.privacy) lines.push("vpn/proxy/hosting flags: " + Object.entries(j.privacy).filter(([, v]) => v).map(([k]) => k).join(", "));
    await message.channel.send(lines.join("\n"));
  } catch {
    await message.channel.send("IP lookup failed.");
  }
}

async function userscan(message, name) {
  if (!/^[A-Za-z0-9_.-]{2,39}$/.test(name)) {
    await message.channel.send("Usage: `ts userscan <username>` (2-39 chars)");
    return;
  }
  const entries = Object.entries(SITES);
  const status = await message.channel.send("Scanning sites for `" + name + "`…");
  let excluded = loadExcluded();
  if (!excluded.size) {
    try {
      await status.edit("Calibrating site rules (one-time, ~1 min)…");
    } catch {}
    excluded = await calibrate();
  }
  const usable = entries.filter(([site]) => !excluded.has(site));
  const found = await pool(usable, 25, async ([site, rule]) => {
    if (rule.r) {
      try {
        if (!new RegExp(rule.r).test(name)) return null;
      } catch {
        return null;
      }
    }
    try {
      const res = await fetch(rule.u.replace("{}", encodeURIComponent(name)), {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) syndication-bot", Accept: "text/html" },
      });
      if (res.status >= 200 && res.status < 300) return site + ": <" + rule.u.replace("{}", name) + ">";
      return null;
    } catch {
      return null;
    }
  });
  const hits = found.filter(Boolean);
  let body = "`" + name + "` on " + hits.length + "/" + usable.length + " sites";
  if (hits.length) {
    const list = hits.join("\n");
    body += ":\n" + (list.length > 1500 ? list.slice(0, 1500) + "\n…+" + (hits.length - list.slice(0, 1500).split("\n").length + 1) + " more" : list);
  }
  try {
    await status.edit(cut(body));
  } catch {
    await message.channel.send(cut(body));
  }
}

module.exports = async function osint(client, message) {
  const p = config.commandPrefix;
  const content = message.content || "";
  const lower = content.toLowerCase();
  const arg = (cmd) => content.slice(cmd.length).trim();
  if (lower.startsWith(p + "ghuser ")) {
    await ghuser(message, arg(p + "ghuser ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "ghemail ")) {
    await ghemail(message, arg(p + "ghemail ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "ghemails ")) {
    await ghemails(message, arg(p + "ghemails ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "ghkeys ")) {
    await ghkeys(message, arg(p + "ghkeys ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "weather ")) {
    const parts = arg(p + "weather ").split(/\s+/).filter(Boolean);
    const date = parts.length > 1 && /^\d{4}-\d{2}-\d{2}$/.test(parts[parts.length - 1]) ? parts.pop() : "";
    await weather(message, parts.join(" "), date);
    return true;
  }
  if (lower.startsWith(p + "ip ")) {
    await ipinfo(message, arg(p + "ip ").split(/\s+/)[0] || "");
    return true;
  }
  if (lower.startsWith(p + "userscan ")) {
    await userscan(message, arg(p + "userscan ").split(/\s+/)[0] || "");
    return true;
  }
  return false;
};
