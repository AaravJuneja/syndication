require("dotenv").config();

module.exports = {
  domain: (process.env.DOMAIN || "https://go.squeakyfiddlepro.me").replace(/\/$/, ""),
  port: process.env.PORT || 5000,
  tursoUrl: process.env.TURSO_URL || "file:./syndication.db",
  tursoToken: process.env.TURSO_AUTH_TOKEN || "",
  commandPrefix: (() => {
    const raw = process.env.COMMAND_PREFIX || "ts";
    return /[a-zA-Z0-9]$/.test(raw) ? raw + " " : raw;
  })(),
  wordlist: process.env.WORDLIST || "/usr/share/wordlists/rockyou.txt",
  dict: process.env.DICT || "/usr/share/dict/words",
  githubToken: process.env.GITHUB_TOKEN || "",
  appId: process.env.DISCORD_APP_ID || "0",
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || "",
  errorWebhook: process.env.WEBHOOK || "",
};
