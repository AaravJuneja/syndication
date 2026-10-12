const { EmbedBuilder } = require("discord.js");

function wrapChannel(channel) {
  const send = channel.send.bind(channel);
  return new Proxy(channel, {
    get(t, prop) {
      if (prop === "send") {
        return (content) => {
          if (typeof content === "string" && content.length > 200 && !/([`*_~])/.test(content)) {
            const body = content.length > 3900 ? content.slice(0, 3900) + "…" : content;
            const embed = new EmbedBuilder()
              .setColor("#16e16e")
              .setDescription("```\n" + body + "\n```")
              .setFooter({ text: "syndication" });
            return send({ embeds: [embed] });
          }
          return send(content);
        };
      }
      const v = t[prop];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

function glow(message) {
  const channel = wrapChannel(message.channel);
  return new Proxy(message, {
    get(t, prop) {
      if (prop === "channel") return channel;
      const v = t[prop];
      return typeof v === "function" ? v.bind(t) : v;
    },
  });
}

module.exports = { glow };
