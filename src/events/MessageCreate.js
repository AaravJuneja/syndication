const { Events } = require("discord.js");
const { glow } = require("../fun/glow");
const memes = require("../fun/memes");
const links = require("../fun/links");
const codecs = require("../fun/codecs");
const hunt = require("../fun/hunt");
const audio = require("../fun/audio");
const solve = require("../fun/solve");
const squares = require("../fun/squares");
const transpose = require("../fun/transpose");
const bases = require("../fun/bases");
const grids = require("../fun/grids");
const steg = require("../fun/steg");
const osint = require("../fun/osint");
const agent = require("../fun/agent");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (message.author?.bot) return;
    const config = require("../config");
    if (config.allowedUsers.length && !config.allowedUsers.includes(message.author.id)) return;
    try {
      const raw = message.content || "";
      const low = raw.toLowerCase();
      message._originalContent = raw;
      if (low === "baller") {
        message.content = config.commandPrefix.trim();
      } else if (low.startsWith("baller ")) {
        message.content = config.commandPrefix + raw.slice(7).trimStart();
      }
    } catch {}
    const m = glow(message);
    const runs = [
      () => links(m.client, m),
      () => codecs(m.client, m),
      () => hunt(m.client, m),
      () => audio(m.client, m),
      () => solve(m.client, m),
      () => squares(m.client, m),
      () => transpose(m.client, m),
      () => bases(m.client, m),
      () => grids(m.client, m),
      () => steg(m.client, m),
      () => osint(m.client, m),
      () => agent(m.client, m),
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
        await m.channel.send("unknown command - try `ts help`");
      } catch {}
    }
  },
};
