const config = require("../config");
const { db } = require("../db");
const { sendPaged } = require("./pager");

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
  if (!message.content.toLowerCase().startsWith(cmd.toLowerCase())) return false;

  const parts = message.content.slice(cmd.length).trim().split(/\s+/).filter(Boolean);
  const sub = (parts.shift() || "help").toLowerCase();

  if (sub === "help") {
    await message.channel.send(HELP);
    return true;
  }

  if (sub === "add") {
    const name = parts[0];
    const short = parts[1];
    const url = parts[2];
    if (!name || !short || !url) {
      await message.channel.send("Usage: `ts link add <name> <short> <url>`");
      return true;
    }
    const dup = await db
      .execute({ sql: "SELECT backlink FROM links WHERE backlink = ?", args: [short] })
      .catch(() => ({ rows: [] }));
    if (dup.rows.length) {
      await message.channel.send("Short link `" + short + "` already exists.");
      return true;
    }
    await db.execute({
      sql: "INSERT INTO links (backlink, name, link, date) VALUES (?, ?, ?, ?)",
      args: [short, name, url, new Date().toISOString()],
    });
    await message.channel.send("New short link from " + message.author.username + ":\nName: " + name + "\nShort: " + shortUrl(short) + "\nLink: <" + url + ">");
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
        .execute({ sql: "DELETE FROM links WHERE backlink = ?", args: [short] })
        .catch(() => ({ rowsAffected: 0 }));
      await message.channel.send(
        r.rowsAffected > 0 ? "Short link `" + short + "` removed." : "Short link `" + short + "` not found."
      );
    }
    return true;
  }

  if (sub === "edit") {
    const short = parts[0];
    const field = parts[1];
    const value = parts.slice(2).join(" ");
    if (!short || !["name", "link"].includes(field) || !value) {
      await message.channel.send("Usage: `ts link edit <short> <field> <new value>`\nFields: name, link");
      return true;
    }
    const r = await db
      .execute({ sql: "UPDATE links SET " + field + " = ? WHERE backlink = ?", args: [value, short] })
      .catch(() => ({ rowsAffected: 0 }));
    if (!r.rowsAffected) {
      await message.channel.send("Short link `" + short + "` not found.");
      return true;
    }
    await message.channel.send("Short link `" + short + "` updated: " + field + " is now `" + value + "`");
    return true;
  }

  if (sub === "show") {
    const all = await db.execute("SELECT name, backlink, link FROM links ORDER BY rowid").catch(() => ({ rows: [] }));
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
