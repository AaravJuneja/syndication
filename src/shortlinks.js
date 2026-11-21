const SLUG_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED = new Set(["health", "interactions"]);
const LOOKUP_LINK = "SELECT link FROM links WHERE backlink = ?";
const INSERT_LINK = "INSERT INTO links (backlink, name, link, date) VALUES (?, ?, ?, ?) ON CONFLICT(backlink) DO NOTHING";
const INSERT_TRIGGER = "INSERT INTO ballers (cause, effect) VALUES (?, ?) ON CONFLICT(cause) DO NOTHING";

function validNewSlug(slug) {
  return typeof slug === "string" && SLUG_PATTERN.test(slug) && !RESERVED.has(slug.toLowerCase());
}

function linkTarget(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    return url.username || url.password ? null : url.href;
  } catch {
    return null;
  }
}

module.exports = { LOOKUP_LINK, INSERT_LINK, INSERT_TRIGGER, validNewSlug, linkTarget };
