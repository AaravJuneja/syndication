import { discordApp } from "./discord-app.mjs";

try {
  const dryRun = process.argv.includes("--dry-run");
  const args = ["bun", "run", "wrangler", "deploy"];
  if (dryRun) {
    args.push("--dry-run");
  } else {
    const turso = process.env.TURSO_URL || "";
    const domain = (process.env.DOMAIN || "https://go.squeakyfiddlepro.me").replace(/\/$/, "");
    const admins = (process.env.ALLOWED_USERS || "").split(",").map((id) => id.trim()).filter(Boolean);
    const url = new URL(turso.replace(/^libsql:\/\//, "https://"));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("Set TURSO_URL to the remote libsql:// or https:// database URL, without credentials.");
    }
    if (!admins.length || admins.some((id) => !/^\d{17,20}$/.test(id))) {
      throw new Error("Set ALLOWED_USERS to comma-separated Discord admin IDs.");
    }
    const app = await discordApp();
    if (app.endpoint && app.endpoint !== domain + "/interactions") {
      throw new Error("Discord's interaction endpoint does not match DOMAIN.");
    }
    for (const [name, value] of Object.entries({ TURSO_URL: turso, DOMAIN: domain, ALLOWED_USERS: admins.join(","), DISCORD_PUBLIC_KEY: app.publicKey })) {
      args.push("--var", `${name}:${value}`);
    }
  }
  const deploy = Bun.spawn(args, { stdio: ["inherit", "inherit", "inherit"] });
  process.exitCode = await deploy.exited;
} catch (error) {
  console.error(error instanceof Error && error.code !== "ERR_INVALID_URL" ? error.message : "Set TURSO_URL to the deployed remote database URL.");
  process.exitCode = 1;
}
