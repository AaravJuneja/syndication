require("dotenv").config({ quiet: true });
const { once } = require("node:events");
const { Client, Events, GatewayIntentBits } = require("discord.js");
const config = require("./config");

async function start() {
  if (!["gateway", "links", "both"].includes(config.runMode)) {
    throw new Error("RUN_MODE must be gateway, links, or both", { cause: "config" });
  }
  const gateway = config.runMode !== "links";
  const http = config.runMode !== "gateway";
  if (gateway && !config.token) throw new Error("Set TOKEN to run the gateway", { cause: "config" });
  if (http && (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535)) {
    throw new Error("PORT must be a valid TCP port", { cause: "config" });
  }

  const { db, initDb } = require("./db");
  /** @type {import('node:http').Server | undefined} */
  let server;
  /** @type {Client | undefined} */
  let client;
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await Promise.allSettled([
      client?.destroy(),
      server?.listening ? new Promise((resolve) => server.close(resolve)) : undefined,
    ]);
    db.close();
  }
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, stop);

  try {
    await initDb();
    if (stopping) return;
    if (http) {
      const { createApp } = require("./http");
      server = createApp(db).listen(config.port, config.host);
      await once(server, "listening");
      const address = server.address();
      console.log("Short links live on port " + (typeof address === "object" ? address.port : config.port));
    }
    if (gateway && !stopping) {
      client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent,
          ...(config.welcomeChannelId ? [GatewayIntentBits.GuildMembers] : [])],
        allowedMentions: { parse: [], repliedUser: false },
      });
      client.once(Events.ClientReady, (c) => console.log("Ready! Logged in as " + c.user.tag));
      client.on(Events.Error, (error) => report("Discord gateway error", error));
      const run = (event) => (arg) => Promise.resolve().then(() => event.execute(arg))
        .catch((error) => report("Discord event failed", error));
      client.on(Events.MessageCreate, run(require("./events/MessageCreate")));
      client.on(Events.GuildMemberAdd, run(require("./events/GuildMemberAdd")));
      await client.login(config.token);
    }
  } catch (error) {
    const interrupted = stopping;
    await stop();
    if (!interrupted) throw error;
  }
}

async function report(label, error) {
  if (error?.cause === "config") console.error(error.message);
  else console.error(label + " (" + (error?.code || error?.name || "unknown") + ")");
  if (!config.errorWebhook) return;
  await fetch(config.errorWebhook, {
    method: "POST",
    body: JSON.stringify({ content: "syndication: " + label, allowed_mentions: { parse: [] } }),
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

start().catch(async (error) => {
  process.exitCode = 1;
  await report("Syndication failed to start; check the database, port, and Discord settings", error);
});
