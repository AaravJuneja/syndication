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
    try {
      if (await links(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await codecs(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await hunt(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await audio(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await solve(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await steg(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await osint(m.client, m)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      await memes(m.client, m);
    } catch (err) {
      console.error(err);
    }
  },
};
