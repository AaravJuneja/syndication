const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits } = require("discord.js");
const dotenv = require("dotenv");
dotenv.config();
const config = require("./config");
const { db, initDb } = require("./db");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", (c) => {
  console.log("Ready! Logged in as " + c.user.tag);
});

const eventsPath = path.join(__dirname, "events");
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith(".js"));
for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  client.on(event.name, (...args) => event.execute(...args));
}

const express = require("express");
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/health", (req, res) => {
  res.send("ok");
});

app.get("/:slug", async (req, res) => {
  const found = await db
    .execute({ sql: "SELECT link FROM links WHERE backlink = ?", args: [req.params.slug] })
    .catch(() => ({ rows: [] }));
  if (found.rows.length) return res.redirect(found.rows[0].link);
  return res.redirect(config.domain);
});

initDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log("Short links live on port " + config.port);
    });
  })
  .catch((err) => console.log(err));

process.on("uncaughtException", (err) => {
  console.log("Caught exception: " + err);
  if (config.errorWebhook && typeof fetch === "function") {
    fetch(config.errorWebhook, {
      method: "post",
      body: JSON.stringify({ content: "syndication: " + (err.message || err) }),
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  }
});

if (process.env.TOKEN) {
  client.login(process.env.TOKEN);
} else {
  console.log("TOKEN not set, serving links only");
}
