const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

async function sendPaged(message, title, rows) {
  const pages = [];
  for (let i = 0; i < rows.length; i += 12) {
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor("#16e16e")
      .setFooter({ text: "Page " + (pages.length + 1) });
    rows.slice(i, i + 12).forEach((r) => {
      embed.addFields({ name: r.name, value: r.value });
    });
    pages.push(embed);
  }
  let current = 0;
  const getRow = () =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("pg_prev")
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current === 0),
      new ButtonBuilder()
        .setCustomId("pg_next")
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current === pages.length - 1)
    );
  const sent = await message.channel.send({ embeds: [pages[current]], components: [getRow()] });
  const collector = sent.createMessageComponentCollector({ time: 60000 });
  collector.on("collect", async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return interaction.reply({ content: "This menu is not for you.", ephemeral: true });
    }
    if (interaction.customId === "pg_prev" && current > 0) current--;
    if (interaction.customId === "pg_next" && current < pages.length - 1) current++;
    await interaction.update({ embeds: [pages[current]], components: [getRow()] });
  });
  collector.on("end", async () => {
    await sent.edit({ components: [] }).catch(() => {});
  });
}

module.exports = { sendPaged };
