const config = require("../config");
const { db } = require("../db");
const { sendPaged } = require("./pager");
const { INSERT_LINK, validNewSlug, linkTarget } = require("../shortlinks");

function shortUrl(short) {
  return config.domain + "/" + short;
}

const HELP =
  "**Link Commands**\n" +
  "`ts link add <name> <short> <url>` - Add a new short link\n" +
  "`ts link remove <short>[,<short2>...]` - Remove short link(s)\n" +
  "`ts link edit <short> <field> <new value>` - Edit a link (fields: name, link)\n" +
  "`ts link show` - Show all short links\n" +
  "`ts link help` - Show this help message";

module.exports = async function links(client, message) {
  const cmd = config.commandPrefix + "link";
  const lower = message.content.toLowerCase();
  if (lower !== cmd.toLowerCase() && !lower.startsWith(cmd.toLowerCase() + " ")) return false;

  const parts = message.content.slice(cmd.length).trim().split(/\s+/).filter(Boolean);
  const sub = (parts.shift() || "help").toLowerCase();

  if (sub === "help") {
    await message.channel.send(HELP);
    return true;
  }
  if (["add", "edit", "remove"].includes(sub) && !config.allowedUsers.includes(message.author.id)) {
    await message.channel.send("Only a configured admin can change short links.");
    return true;
  }

  if (sub === "add") {
    const name = parts[0];
    const short = parts[1];
    if (!name || !short || !parts[2] || parts.length !== 3) {
      await message.channel.send("Usage: `ts link add <name> <short> <url>`");
      return true;
    }
    if (!validNewSlug(short)) {
      await message.channel.send("Use 1 to 64 letters, digits, hyphens, or underscores. `health` and `interactions` are reserved.");
      return true;
    }
    const url = linkTarget(parts[2]);
    if (!url) {
      await message.channel.send("Use a full HTTP(S) destination URL without credentials.");
      return true;
    }
    const result = await db.execute({ sql: INSERT_LINK, args: [short, name, url, new Date().toISOString()] });
    if (!result.rowsAffected) {
      await message.channel.send("Short link `" + short + "` already exists.");
      return true;
    }
    await message.channel.send("New short link: " + shortUrl(short));
    return true;
  }

  if (sub === "remove") {
    const shorts = (parts.join(" ") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!shorts.length) {
      await message.channel.send("Usage: `ts link remove <short>[,<short2>...]`");
      return true;
    }
    for (const short of shorts) {
      const r = await db
        .execute({ sql: "DELETE FROM links WHERE backlink = ?", args: [short] });
      await message.channel.send(
        r.rowsAffected > 0 ? "Short link `" + short + "` removed." : "Short link `" + short + "` not found."
      );
    }
    return true;
  }

  if (sub === "edit") {
    const short = parts[0];
    const field = parts[1];
    const input = parts.slice(2).join(" ");
    if (!short || !["name", "link"].includes(field) || !input) {
      await message.channel.send("Usage: `ts link edit <short> <field> <new value>`\nFields: name, link");
      return true;
    }
    const value = field === "link" ? linkTarget(input) : input;
    if (!value) {
      await message.channel.send("Use a full HTTP(S) destination URL without credentials.");
      return true;
    }
    const r = await db.execute({ sql: "UPDATE links SET " + field + " = ? WHERE backlink = ?", args: [value, short] });
    if (!r.rowsAffected) {
      await message.channel.send("Short link `" + short + "` not found.");
      return true;
    }
    await message.channel.send("Short link `" + short + "` updated: " + field + " is now `" + value + "`");
    return true;
  }

  if (sub === "show") {
    const all = await db.execute("SELECT name, backlink, link FROM links ORDER BY rowid");
    if (!all.rows.length) {
      await message.channel.send("No short links yet.");
      return true;
    }
    await sendPaged(
      message,
      "Short Links",
      all.rows.map((l) => ({ name: l.name + " - " + l.backlink, value: "<" + l.link + ">" }))
    );
    return true;
  }

  await message.channel.send(HELP);
  return true;
};
