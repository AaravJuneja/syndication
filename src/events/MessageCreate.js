const { Events } = require("discord.js");
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
    try {
      if (await links(message.client, message)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await codecs(message.client, message)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await hunt(message.client, message)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await audio(message.client, message)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await solve(message.client, message)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await steg(message.client, message)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      if (await osint(message.client, message)) return;
    } catch (err) {
      console.error(err);
    }
    try {
      await memes(message.client, message);
    } catch (err) {
      console.error(err);
    }
  },
};
