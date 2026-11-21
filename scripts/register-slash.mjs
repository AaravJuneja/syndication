import { SLASH_COMMANDS } from "../worker.js";
import { discordApp } from "./discord-app.mjs";

try {
  const [target = process.env.DISCORD_GUILD_ID, guildToClear] = process.argv.slice(2);
  const guild = target === "--clear" ? guildToClear : target;
  const global = target === "--global";
  if ((!global && !/^\d{17,20}$/.test(guild || "")) || (target !== "--clear" && guildToClear)) {
    throw new Error("Usage: bun run slash:register --global | <guild-id> | --clear <guild-id>");
  }
  const app = await discordApp();
  const scope = global ? "" : "/guilds/" + guild;
  const commands = target === "--clear" ? [] : SLASH_COMMANDS;
  const res = await fetch("https://discord.com/api/v10/applications/" + app.id + scope + "/commands", {
    method: "PUT",
    headers: app.headers,
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error("Discord rejected slash command registration (HTTP " + res.status + "): " + (error?.message || "no details"));
  }
  const registered = await res.json();
  if (!Array.isArray(registered) || registered.length !== commands.length) throw new Error("Discord returned an unexpected command list.");
  console.log(`Registered ${registered.length} ${global ? "global" : "guild"} commands.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Slash command registration failed.");
  process.exitCode = 1;
}
