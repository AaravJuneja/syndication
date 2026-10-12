const { Events } = require("discord.js");
const config = require("../config");

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    console.log("New member has joined: " + member.user.tag);
    if (!config.welcomeChannelId) return;
    try {
      const channel = await member.guild.channels.fetch(config.welcomeChannelId);
      if (channel) await channel.send("Welcome <@" + member.id + "> *hee hee*");
    } catch (err) {
      console.error(err);
    }
  },
};
