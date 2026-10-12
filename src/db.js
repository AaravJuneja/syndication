const { createClient } = require("@libsql/client");
const config = require("./config");

const db = createClient({
  url: config.tursoUrl,
  authToken: config.tursoToken || undefined,
});

async function initDb() {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS links (backlink TEXT PRIMARY KEY, name TEXT NOT NULL, link TEXT NOT NULL, date TEXT NOT NULL)"
  );
  await db.execute(
    "CREATE TABLE IF NOT EXISTS ballers (cause TEXT PRIMARY KEY, effect TEXT NOT NULL)"
  );
}

module.exports = { db, initDb };
