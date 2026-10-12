const config = require("../config");
const { SLASH_COMMANDS } = require("../../worker.js");

async function registerGuild(guildId) {
  if (!process.env.TOKEN || !config.appId || !guildId) return false;
  try {
    const res = await fetch(
      "https://discord.com/api/v10/applications/" + config.appId + "/guilds/" + guildId + "/commands",
      {
        method: "PUT",
        headers: { Authorization: "Bot " + process.env.TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify(SLASH_COMMANDS),
        signal: AbortSignal.timeout(20000),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

module.exports = { registerGuild };
