# Deploy Syndication

Use your own Discord application, Turso database, and Cloudflare account.
The Worker serves slash commands and short links. The gateway handles `ts` commands

## Setup

1. Run `bun install --frozen-lockfile`
2. Copy `.env.example` to `.env`. Set `TOKEN` to your bot token,
   `TURSO_URL` to your database URL, `TURSO_AUTH_TOKEN` to its auth token,
   and `ALLOWED_USERS` to comma-separated Discord user IDs. Run `chmod 600 .env`
3. Run `bun run db:init` to initialize the database
4. Install the Discord application in your server with the `bot` and
   `applications.commands` scopes

## Discord gateway

Enable Message Content Intent in Discord. For welcome messages, also set
`WELCOME_CHANNEL_ID` and enable Server Members Intent

Run `RUN_MODE=gateway bun start`, or adjust `WorkingDirectory` and `ExecStart`
in `deploy/systemd/syndication-gateway.service` before installing it:

```sh
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
install -D -m 0644 deploy/systemd/syndication-gateway.service "$unit_dir/syndication-gateway.service"
systemctl --user daemon-reload
systemctl --user enable --now syndication-gateway.service
```

With systemd linger enabled, the service starts at boot. Run one gateway per bot token

```sh
journalctl --user -u syndication-gateway.service -n 30 --no-pager
systemctl --user restart syndication-gateway.service
```

## Cloudflare Worker

Install Node.js 22.12 or newer for Wrangler

1. In `wrangler.jsonc`, choose a Worker `name` and replace the route's `pattern`
   with a hostname you manage in Cloudflare. To use `workers.dev` instead,
   remove `routes` and set `workers_dev` to `true`
2. Set `DOMAIN` in `.env` to the resulting HTTPS URL, with no path. Setting
   `DOMAIN` does not change the route in `wrangler.jsonc`
3. Deploy the Worker and set the same Turso token as a Worker secret:

   ```sh
   bun run wrangler login
   bun run worker:deploy
   bun run wrangler secret put TURSO_AUTH_TOKEN
   ```

4. In the Discord Developer Portal, set the Interactions Endpoint URL to your
   `DOMAIN` followed by `/interactions`. Run `bun run slash:register --global`
   to replace the global commands for your Discord application

For local Worker testing, put test bindings in `.dev.vars` and run
`bun run worker:dev` (HTTPS on port 8787). To verify deployment, check `/health`
and try `/what` with `SGVsbG8=` in Discord
