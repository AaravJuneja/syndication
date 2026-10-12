const { Events } = require("discord.js");
const { glow } = require("../fun/glow");
const memes = require("../fun/memes");
const links = require("../fun/links");
const codecs = require("../fun/codecs");
const hunt = require("../fun/hunt");
const audio = require("../fun/audio");
const solve = require("../fun/solve");
const steg = require("../fun/steg");
const osint = require("../fun/osint");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author?.bot || !message.guild) return;
    const m = glow(message);
    const runs = [
      () => links(m.client, m),
      () => codecs(m.client, m),
      () => hunt(m.client, m),
      () => audio(m.client, m),
      () => solve(m.client, m),
      () => steg(m.client, m),
      () => osint(m.client, m),
    ];
    for (const run of runs) {
      try {
        if (await run()) return;
      } catch (err) {
        console.error(err);
      }
    }
    try {
      if (await memes(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    const prefix = require("../config").commandPrefix;
    if (message.content.toLowerCase().startsWith(prefix.toLowerCase())) {
      try {
        await m.channel.send("unknown command — try `ts help`");
      } catch {}
    }
  },
};
