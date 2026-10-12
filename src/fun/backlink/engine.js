const fs = require("node:fs");
const path = require("node:path");

const RULES = JSON.parse(fs.readFileSync(path.join(__dirname, "links.json"), "utf8"));

function normalizeHost(host) {
  return String(host || "").toLowerCase().replace(/^www\./, "");
}

function getServiceFamily(hostname) {
  const host = normalizeHost(hostname);
  if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
  if (host === "i.imgur.com" || host.endsWith("imgur.com")) return "imgur";
  if (host === "pin.it" || host.endsWith("pinterest.com")) return "pinterest";
  if (host === "redd.it" || host.endsWith("reddit.com")) return "reddit";
  if (host === "voca.ro" || host.endsWith("vocaroo.com")) return "vocaroo";
  if (host === "discord.gg" || host.endsWith("discord.com") || host.endsWith("discordapp.com")) return "discord";
  if (host.endsWith("docs.google.com") || host.endsWith("drive.google.com") || host === "forms.gle") return "google";
  if (host.endsWith("whatsapp.com")) return "whatsapp";
  if (host.endsWith("spotify.com")) return "spotify";
  if (host.endsWith("notion.so") || host.endsWith("notion.site")) return "notion";
  if (host.endsWith("tinyurl.com")) return "tinyurl";
  if (host.endsWith("bit.ly")) return "bitly";
  if (host.endsWith("goo.gl")) return "googl";
  if (host.endsWith("pastebin.com")) return "pastebin";
  if (host.endsWith("controlc.com")) return "controlc";
  if (host.endsWith("ctxt.io")) return "ctxt";
  if (host.endsWith("wheelofnames.com")) return "wheelofnames";
  if (host.endsWith("imgpile.com")) return "imgpile";
  if (host.endsWith("bin.rex.wf")) return "bin";
  if (host.endsWith("mediafire.com")) return "mediafire";
  if (host.endsWith("mega.nz")) return "mega";
  if (host.endsWith("gyazo.com")) return "gyazo";
  if (host.endsWith("dailymotion.com")) return "dailymotion";
  if (host.endsWith("vimeo.com")) return "vimeo";
  if (host.endsWith("facebook.com")) return "facebook";
  if (host.endsWith("prnt.sc")) return "lightshot";
  if (host.endsWith("dropbox.com")) return "dropbox";
  if (host.endsWith("clyp.it")) return "clyp";
  if (host.endsWith("instagram.com")) return "instagram";
  if (host.endsWith("imdb.com")) return "imdb";
  if (host.endsWith("isbnsearch.org")) return "isbn";
  if (host.endsWith(".onion")) return "onion";
  return null;
}

function tryParseInputUrl(input) {
  const trimmed = String(input || "").trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const looksLikeUrl = hasScheme || /[./?#]/.test(trimmed);
  if (!looksLikeUrl) return null;
  try {
    return new URL(hasScheme ? trimmed : "https://" + trimmed);
  } catch {
    return null;
  }
}

function getRuleFamily(urlTemplate) {
  if (typeof urlTemplate !== "string") return null;
  if (urlTemplate.includes(".onion")) return "onion";
  try {
    return getServiceFamily(new URL(urlTemplate.replace("$URL", "sample-token")).hostname);
  } catch {
    return null;
  }
}

function splitInputIntoTargets(rawInput) {
  const text = String(rawInput || "").trim();
  if (!text) return [];
  const targets = new Set([text]);
  for (const line of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) targets.add(line);
  for (const u of text.match(/(?:https?:\/\/|www\.)[^\s<>"'`)\]}]+/gi) || []) targets.add(u);
  if (targets.size === 1) {
    const tokens = text.split(/[,\s;|]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length <= 8) {
      for (const token of tokens) if (token.length >= 4) targets.add(token);
    }
  }
  return Array.from(targets);
}

function addCandidate(candidates, value) {
  if (typeof value !== "string") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  candidates.add(trimmed);
  try {
    const decoded = decodeURIComponent(trimmed);
    if (decoded) candidates.add(decoded);
  } catch {}
}

function addTokenVariants(candidates, token) {
  addCandidate(candidates, token);
  const cleaned = token.replace(/^[/?#&=]+|[/?#&=]+$/g, "");
  if (cleaned !== token) addCandidate(candidates, cleaned);
  const noExt = cleaned.replace(/\.[a-z0-9]{2,5}$/i, "");
  if (noExt !== cleaned) addCandidate(candidates, noExt);
  const noHyphen = cleaned.replace(/-/g, "");
  if (noHyphen !== cleaned) addCandidate(candidates, noHyphen);
}

function extractCandidates(input, parsedUrl) {
  const candidates = new Set();
  addTokenVariants(candidates, input);
  if (!parsedUrl) return Array.from(candidates);
  const host = normalizeHost(parsedUrl.hostname);
  addCandidate(candidates, host);
  const segs = parsedUrl.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  addTokenVariants(candidates, segs.join("/"));
  for (const segment of segs) addTokenVariants(candidates, segment);
  if (segs.length >= 2) addTokenVariants(candidates, segs[segs.length - 2] + "/" + segs[segs.length - 1]);
  parsedUrl.searchParams.forEach((value) => addTokenVariants(candidates, value));
  if (parsedUrl.hash) {
    addTokenVariants(candidates, parsedUrl.hash.slice(1));
    addTokenVariants(candidates, "#" + parsedUrl.hash.slice(1));
  }
  if (host === "youtu.be" && segs[0]) addTokenVariants(candidates, segs[0]);
  if (host.includes("youtube.com")) {
    addTokenVariants(candidates, parsedUrl.searchParams.get("v") || "");
    addTokenVariants(candidates, parsedUrl.searchParams.get("list") || "");
  }
  if (host.includes("spotify.com") && segs[1]) addTokenVariants(candidates, segs[1]);
  if (host.includes("whatsapp.com")) addTokenVariants(candidates, parsedUrl.searchParams.get("code") || "");
  if (host.includes("google.com") || host === "forms.gle") {
    const d = segs.lastIndexOf("d");
    if (d !== -1 && segs[d + 1]) addTokenVariants(candidates, segs[d + 1]);
    const f = segs.lastIndexOf("folders");
    if (f !== -1 && segs[f + 1]) addTokenVariants(candidates, segs[f + 1]);
    addTokenVariants(candidates, parsedUrl.searchParams.get("id") || "");
  }
  if (host === "mega.nz" && parsedUrl.hash) {
    const hash = parsedUrl.hash.slice(1);
    addTokenVariants(candidates, hash);
    addTokenVariants(candidates, "#" + hash);
    if (segs.length >= 2 && (segs[0] === "file" || segs[0] === "folder")) {
      const joined = segs[1] + "!" + hash;
      addTokenVariants(candidates, joined);
      if (segs[0] === "folder") {
        addTokenVariants(candidates, "F!" + joined);
        addTokenVariants(candidates, "#F!" + joined);
      } else {
        addTokenVariants(candidates, "#" + joined);
        addTokenVariants(candidates, "#!" + joined);
      }
    }
  }
  if ((host.includes("notion.so") || host.endsWith("notion.site")) && segs.length > 0) {
    const m = segs[segs.length - 1].match(/([a-f0-9]{32})$/i);
    if (m) addTokenVariants(candidates, m[1].toLowerCase());
  }
  return Array.from(candidates);
}

function getCandidateVariants(candidate) {
  const variants = [candidate];
  const lower = candidate.toLowerCase();
  const upper = candidate.toUpperCase();
  if (lower !== candidate) variants.push(lower);
  if (upper !== candidate && upper !== lower) variants.push(upper);
  return variants;
}

function computeMatchScore(context, ruleFamily, matchedValue) {
  let score = 5;
  const inputLower = context.inputValue.toLowerCase();
  const candidateLower = matchedValue.toLowerCase();
  if (inputLower === candidateLower) score += 35;
  else if (inputLower.includes(candidateLower)) score += 24;
  else if (candidateLower.includes(inputLower) && inputLower.length >= 6) score += 12;
  if (context.parsedUrl) score += 4;
  if (context.inputFamily && ruleFamily) score += context.inputFamily === ruleFamily ? 45 : -28;
  else score += 8;
  if (matchedValue.length >= 24) score += 16;
  else if (matchedValue.length >= 12) score += 10;
  else if (matchedValue.length >= 8) score += 6;
  else if (matchedValue.length >= 5) score += 3;
  if (/^tt\d{7,10}$/i.test(matchedValue)) score += 10;
  if (/^[a-z2-7]{56}$/i.test(matchedValue)) score += 10;
  if (/^(PL|UU|LL|FL|RD|WL|OLAK5uy_)/i.test(matchedValue)) score += 12;
  if (/[!/]/.test(matchedValue)) score += 6;
  if (/^[A-Za-z0-9_-]{20,}$/.test(matchedValue)) score += 6;
  return Math.max(1, Math.min(99, score));
}

function findMatches(rawInput, maxResults) {
  const targets = splitInputIntoTargets(rawInput);
  const matchMap = new Map();
  for (const rule of RULES) {
    let regex;
    try {
      regex = new RegExp(rule.regex);
    } catch {
      continue;
    }
    const ruleFamily = getRuleFamily(rule.url);
    for (const inputValue of targets) {
      const parsedUrl = tryParseInputUrl(inputValue);
      const context = {
        inputValue,
        parsedUrl,
        inputFamily: parsedUrl ? getServiceFamily(parsedUrl.hostname) : null,
      };
      for (const candidate of extractCandidates(inputValue, parsedUrl)) {
        const matchedValue = getCandidateVariants(candidate).find((v) => regex.test(v));
        if (!matchedValue) continue;
        const builtUrl = String(rule.url || "").replace("$URL", matchedValue).trim();
        const key = rule.type + "::" + builtUrl;
        const score = computeMatchScore(context, ruleFamily, matchedValue);
        const existing = matchMap.get(key);
        if (!existing || score > existing.score) {
          matchMap.set(key, {
            name: rule.type,
            url: builtUrl,
            matched: matchedValue,
            score,
            confidence: score >= 72 ? "high" : score >= 38 ? "medium" : "low",
          });
        }
      }
    }
  }
  return Array.from(matchMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults || 500);
}

module.exports = { findMatches, getServiceFamily, tryParseInputUrl };
