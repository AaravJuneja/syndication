const { Events } = require("discord.js");
const { registerGuild } = require("../fun/register");

module.exports = {
  name: Events.GuildCreate,
  async execute(guild) {
    console.log("Joined guild: " + guild.id);
    const ok = await registerGuild(guild.id);
    console.log(ok ? "Slash commands registered." : "Slash registration failed.");
  },
};
