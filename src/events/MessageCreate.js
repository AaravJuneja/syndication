const { Events, EmbedBuilder } = require("discord.js");

const reactEmbed = new EmbedBuilder()
  .setColor("#16e16e")
  .setTitle("Training Grounds Event Roles")
  .setDescription(
    `WebD - 🖥️
    AppD -  📱
    A/V Editing -  🎞️
    2D Design  - 🎨
    UI Design - 🟦
    Cryptic Hunt - 🔒
    Group Discussion (GD)  - 🎙️
    Programming - ⌨️
    Crossword - 🧩
    Gaming - 🎮
    3D - 3️⃣
    Quiz - 🧠
    Photography - 📷
    Capture the flag (CTF) - ⛳
    Cubing - 🧊`
  );

module.exports = {
  name: Events.MessageCreate,
  execute(msg) {
    if (msg.content.startsWith("!rolemsg")) {
      channel = msg.content.split("!rolemsg")[1];
      c_id = channel.substring(3, channel.length - 1);
      client.guilds.cache
        .get("0")
        .client.channels.cache.get(c_id)
        .send({ embeds: [reactEmbed] })
        .then((msg) => {
          for (var i in roleIds) {
            msg.react(i);
          }
          embed_id = msg.id.toString();
        });
    }
  },
};
