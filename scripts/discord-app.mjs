import dotenv from "dotenv";

dotenv.config({ quiet: true });

export async function discordApp() {
  const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
  if (!token) throw new Error("Set TOKEN (or DISCORD_TOKEN) in .env.");
  const headers = { Authorization: "Bot " + token, "Content-Type": "application/json" };
  const response = await fetch("https://discord.com/api/v10/oauth2/applications/@me", { headers, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Discord could not identify the bot (HTTP " + response.status + ").");
  const { id, verify_key, interactions_endpoint_url } = await response.json();
  if (!/^\d{17,20}$/.test(id) || !/^[\da-f]{64}$/i.test(verify_key)) throw new Error("Discord returned an invalid application identity.");
  if (process.env.DISCORD_APP_ID && process.env.DISCORD_APP_ID !== id) throw new Error("DISCORD_APP_ID does not match TOKEN.");
  return { id, publicKey: verify_key, endpoint: interactions_endpoint_url, headers };
}
