import { SLASH_COMMANDS } from "../worker.js";

const token = process.env.DISCORD_TOKEN || "";
const appId = process.env.DISCORD_APP_ID || "";
const target = process.argv[2] || process.env.DISCORD_GUILD_ID || "";

if (!token || !appId || !target) {
  console.log("usage:");
  console.log("  guild:  bun scripts/register-slash.mjs <guild-id>");
  console.log("  global: bun scripts/register-slash.mjs --global   (works in DMs, ~1h to appear)");
  console.log("  clear:  bun scripts/register-slash.mjs --clear <guild-id>");
  process.exit(1);
}

if (target === "--clear" || process.argv[3] === "--clear") {
  const gid = target === "--clear" ? process.argv[3] : process.argv[2];
  const res = await fetch("https://discord.com/api/v10/applications/" + appId + "/guilds/" + gid + "/commands", {
    method: "PUT",
    headers: { Authorization: "Bot " + token, "Content-Type": "application/json" },
    body: "[]",
  });
  console.log("cleared guild commands:", res.status);
  process.exit(0);
}

const url = target === "--global"
  ? "https://discord.com/api/v10/applications/" + appId + "/commands"
  : "https://discord.com/api/v10/applications/" + appId + "/guilds/" + target + "/commands";

const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: "Bot " + token, "Content-Type": "application/json" },
  body: JSON.stringify(SLASH_COMMANDS),
});
console.log("status:", res.status);
const j = await res.json();
console.log("registered:", Array.isArray(j) ? j.length + " commands" : JSON.stringify(j).slice(0, 300));
