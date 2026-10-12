import { SLASH_COMMANDS } from "../worker.js";

const token = process.env.DISCORD_TOKEN || "";
const appId = process.env.DISCORD_APP_ID || "";
const guildId = process.argv[2] || process.env.DISCORD_GUILD_ID || "";

if (!token || !appId || !guildId) {
  console.log("usage: DISCORD_TOKEN=... DISCORD_APP_ID=... bun scripts/register-slash.mjs <guild-id>");
  process.exit(1);
}

const res = await fetch("https://discord.com/api/v10/applications/" + appId + "/guilds/" + guildId + "/commands", {
  method: "PUT",
  headers: { Authorization: "Bot " + token, "Content-Type": "application/json" },
  body: JSON.stringify(SLASH_COMMANDS),
});
console.log("status:", res.status);
const j = await res.json();
console.log("registered:", Array.isArray(j) ? j.map((c) => c.name).join(",") : JSON.stringify(j).slice(0, 300));
