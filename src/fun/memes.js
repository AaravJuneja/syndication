const path = require("node:path");
const config = require("../config");
const { db } = require("../db");
const { sendPaged } = require("./pager");
const { INSERT_TRIGGER } = require("../shortlinks");

const AUDIO_FILE = path.join(__dirname, "..", "..", "assets", "heehee.ogg");

async function send(client, channelId, content) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (channel) await channel.send(content);
  } catch {}
}

function quotedParts(text) {
  return text.split('"').slice(1).filter((_, i) => i % 2 === 0).map((s) => s.trim());
}

module.exports = async function memes(client, message) {
  const text = message.content || "";
  const lower = text.toLowerCase();
  const p = config.commandPrefix.toLowerCase();
  const isShow = lower === p + "show" || lower.startsWith(p + "show ");
  const isAdd = lower === p + "add" || lower.startsWith(p + "add ");
  const isRemove = lower === p + "remove" || lower.startsWith(p + "remove ");
  const isReset = lower === p + "reset" || lower.startsWith(p + "reset ");
  const isSay = lower === p + "say" || lower.startsWith(p + "say ");
  if ((isAdd || isRemove || isReset || isSay) && !config.allowedUsers.includes(message.author.id)) {
    await message.channel.send("Only a configured admin can manage triggers or speak as the bot.");
    return true;
  }

  if (isShow) {
    const all = await db.execute("SELECT cause, effect FROM ballers ORDER BY rowid");
    if (!all.rows.length) {
      await send(client, message.channelId, "no ballers found");
      return true;
    }
    await sendPaged(
      message,
      "Ballers",
      all.rows.map((b) => ({ name: b.cause, value: b.effect }))
    );
    return true;
  }

  if (lower === "hee hee") {
    await send(client, message.channelId, "*hee hee*");
    if (Math.random() < 0.05) {
      try {
        const channel = await client.channels.fetch(message.channelId);
        if (channel) await channel.send({ files: [AUDIO_FILE] });
      } catch {}
    }
    return true;
  }
  if (lower === "bhakas alert") {
    await send(client, message.channelId, "https://tenor.com/view/duck-twerk-gif-11813731934647759555");
    return true;
  }
  if (lower === "invalid opinion") {
    await send(client, message.channelId, "https://klipy.com/gifs/peter-griffin-dancing-2");
    return true;
  }
  if (lower === "popcorn") {
    await send(client, message.channelId, "https://tenor.com/view/he-so-smol-only-need-one-popcorn-plankton-he-so-small-gif-15019144217821414426");
    return true;
  }
  if (lower === config.commandPrefix + "sit man") {
    await send(client, message.channelId, "sit man");
    setTimeout(() => message.delete().catch(() => {}), 1000);
    return true;
  }

  if (isAdd) {
    const q = quotedParts(text);
    if (q.length !== 2 || q.some((part) => !part)) {
      await send(client, message.channelId, 'Usage: `ts add "trigger" "response"`');
      return true;
    }
    const result = await db.execute({ sql: INSERT_TRIGGER, args: q });
    await message.channel.send(result.rowsAffected ? "Trigger saved." : "That trigger already exists.");
    return true;
  }
  if (isRemove) {
    const q = quotedParts(text);
    if (!q.length) {
      await send(client, message.channelId, 'Usage: `ts remove "trigger"`');
      return true;
    }
    const result = await db.execute({ sql: "DELETE FROM ballers WHERE cause = ?", args: [q[0]] });
    await message.channel.send(result.rowsAffected ? "Trigger removed." : "Trigger not found.");
    return true;
  }
  if (isReset) {
    await db.execute("DELETE FROM ballers");
    await send(client, message.channelId, "All meme triggers wiped by " + message.author.username + ".");
    return true;
  }
  if (isSay) {
    const say = text.slice((config.commandPrefix + "say").length).trim();
    if (!say) await message.channel.send("Usage: `ts say <text>`");
    else await message.channel.send(say);
    return true;
  }

  const candidates = [text];
  const orig = message._originalContent;
  if (orig && orig !== text) candidates.push(orig);
  for (const cand of candidates) {
    const hit = await db
      .execute({ sql: "SELECT effect FROM ballers WHERE cause = ?", args: [cand] })
      .catch(() => ({ rows: [] }));
    if (hit.rows.length) {
      await send(client, message.channelId, hit.rows[0].effect);
      return true;
    }
  }
  return false;
};
