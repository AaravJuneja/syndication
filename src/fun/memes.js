const path = require("node:path");
const config = require("../config");
const { db } = require("../db");
const { sendPaged } = require("./pager");

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

  if (lower.includes("baller show")) {
    const all = await db.execute("SELECT cause, effect FROM ballers ORDER BY rowid").catch(() => ({ rows: [] }));
    if (!all.rows.length) {
      await send(client, message.channelId, "no ballers found");
      return;
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

  if (lower.includes("baller add")) {
    const q = quotedParts(text);
    if (q.length < 2) {
      await send(client, message.channelId, 'Usage: `baller add "trigger" "response"`');
      return;
    }
    const dup = await db
      .execute({ sql: "SELECT cause FROM ballers WHERE cause = ?", args: [q[0]] })
      .catch(() => ({ rows: [] }));
    if (!dup.rows.length) {
      await db
        .execute({ sql: "INSERT INTO ballers (cause, effect) VALUES (?, ?)", args: [q[0], q[1]] })
        .catch(() => {});
    }
    const sent = await message.channel.send(q[0] + "\n" + q[1]).catch(() => null);
    if (sent) setTimeout(() => sent.delete().catch(() => {}), 1000);
    return true;
  }
  if (lower.includes("baller remove")) {
    const q = quotedParts(text);
    if (!q.length) {
      await send(client, message.channelId, 'Usage: `baller remove "trigger"`');
      return;
    }
    await db.execute({ sql: "DELETE FROM ballers WHERE cause = ?", args: [q[0]] }).catch(() => {});
    await send(client, message.channelId, '"' + q[0] + '" has been slayed by ' + message.author.username + ".");
    return true;
  }
  if (lower.includes("baller reset")) {
    await db.execute("DELETE FROM ballers").catch(() => {});
    await send(client, message.channelId, "All meme triggers wiped by " + message.author.username + ".");
    return true;
  }
  if (lower.includes("baller say")) {
    const say = text.slice(lower.indexOf("say") + 3).trim();
    if (say) await send(client, message.channelId, say);
    await message.delete().catch(() => {});
    return true;
  }

  const hit = await db
    .execute({ sql: "SELECT effect FROM ballers WHERE cause = ?", args: [text] })
    .catch(() => ({ rows: [] }));
  if (hit.rows.length) {
    await send(client, message.channelId, hit.rows[0].effect);
    return true;
  }
  return false;
};
