module.exports = {
  domain: (process.env.DOMAIN || "https://go.squeakyfiddlepro.me").replace(/\/$/, ""),
  port: Number(process.env.PORT || 5000),
  host: process.env.HOST || "0.0.0.0",
  token: process.env.TOKEN || process.env.DISCORD_TOKEN || "",
  runMode: process.env.RUN_MODE || ((process.env.TOKEN || process.env.DISCORD_TOKEN) ? "both" : "links"),
  tursoUrl: process.env.TURSO_URL || "file:./syndication.db",
  tursoToken: process.env.TURSO_AUTH_TOKEN || "",
  commandPrefix: (() => {
    const raw = (process.env.COMMAND_PREFIX || "ts").toLowerCase();
    return /[a-zA-Z0-9]$/.test(raw) ? raw + " " : raw;
  })(),
  wordlist: process.env.WORDLIST || "/usr/share/wordlists/rockyou.txt",
  dict: process.env.DICT || "/usr/share/dict/words",
  githubToken: process.env.GITHUB_TOKEN || "",
  allowedUsers: (process.env.ALLOWED_USERS || "").split(",").map((s) => s.trim()).filter(Boolean),
  welcomeChannelId: process.env.WELCOME_CHANNEL_ID || "",
  errorWebhook: process.env.WEBHOOK || "",
};
