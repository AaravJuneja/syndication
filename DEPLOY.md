# Deploy Syndication

Cloudflare serves `go.squeakyfiddlepro.me` and Discord slash commands. A local
Bun process handles `ts` commands. Both use Turso.

## Discord gateway

1. Run `bun install --frozen-lockfile`.
2. Copy `.env.example` to `.env`. Set `TOKEN`, `TURSO_URL`, `TURSO_AUTH_TOKEN`,
   and comma-separated `ALLOWED_USERS`. Run `chmod 600 .env`.
3. Enable Message Content Intent in Discord. For welcomes, also set
   `WELCOME_CHANNEL_ID` and enable Server Members Intent.

Run `RUN_MODE=gateway bun start` manually, or install the Linux user service:

```sh
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
install -D -m 0644 deploy/systemd/syndication-gateway.service "$unit_dir/syndication-gateway.service"
systemctl --user daemon-reload
systemctl --user enable --now syndication-gateway.service
```

Adjust the unit if your repo or Bun paths differ. With systemd linger enabled,
the service starts at boot. Prefix commands go offline when the host sleeps or
shuts down. Run one gateway per bot token.

```sh
journalctl --user -u syndication-gateway.service -n 30 --no-pager
systemctl --user restart syndication-gateway.service
```

## Cloudflare Worker

Install Node.js 22.12 or newer for Wrangler.

Use `https://go.squeakyfiddlepro.me/interactions` as Discord's interactions
endpoint. The deploy script reads `TURSO_URL`, `DOMAIN`, and `ALLOWED_USERS`
from `.env` and gets the signing public key from Discord. Set
`TURSO_AUTH_TOKEN` as a Worker secret if it is not already configured.

```sh
bun run wrangler login
bun run worker:deploy
bun run slash:register --global
```

Run `bun run db:init` for a new database. For local Worker testing, put test
bindings in `.dev.vars` and run `bun run worker:dev` (HTTPS on port 8787).

Verify `GET /health`, `/what` with `SGVsbG8=`, and `ts what SGVsbG8=`.
