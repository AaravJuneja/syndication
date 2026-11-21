# AGENTS.md

Syndication is a Discord bot and a URL shortener. It has two runtimes: a Bun process for Discord gateway events and a Cloudflare Worker for slash commands and public redirects. They share Turso, not a process

## Runtime map

- `src/index.js` starts the Bun process. `RUN_MODE=gateway` starts Discord, `links` starts the Express server, and `both` starts both. `src/config.js` reads local settings and `src/db.js` opens the database before either service starts
- `src/events/MessageCreate.js` filters messages, checks the prefix allowlist when configured, maps `baller` to the configured prefix, and calls `src/fun/` handlers in order. The first handler that returns `true` wins. `memes.js` runs after the command handlers for exact-match replies. `src/events/GuildMemberAdd.js` handles optional welcome messages
- `worker.js` is the Cloudflare entry point. It serves the landing page, `/health`, public short links, and `POST /interactions`. The latter verifies Discord's Ed25519 signature over the timestamp and raw body, answers pings, then checks `ALLOWED_USERS` before dispatching commands. Database commands defer the reply and finish through `ctx.waitUntil`
- `src/http.js` is the Express fallback for redirects and health checks. It does not handle Discord interactions

## Commands and shared code

- Prefix commands live in `src/fun/`. Add commands to the handler for that feature and update `ts help` in `src/fun/codecs.js` when needed. Handlers take `(client, message)` and return `false` if they did not handle the message
- Slash commands are declared in `SLASH_COMMANDS` and implemented in `handleSlash`, both in `worker.js`. Change both when adding a command or changing its options. `scripts/register-slash.mjs` imports the manifest and replaces the commands in the selected guild or global scope
- `src/fun/identify.js` ranks likely encodings and ciphers from text. `src/fun/layers.js` tries bounded sequences of decoders for `auto`. `src/fun/bacon.js` holds the shared Bacon codec. The Worker runs identification in `fast` mode and uses a smaller layered-search budget than the gateway. Keep shared helpers offline and compatible with Web APIs, without filesystem or subprocess dependencies
- `codecs.js` handles common text transforms and analysis. `bases.js`, `squares.js`, `transpose.js`, and `grids.js` hold related cipher families. `solve.js` holds solvers, including ones that use the local `DICT`. `hunt.js`, `audio.js`, `steg.js`, and `osint.js` handle file analysis, audio, steganography, and lookups. Optional host tools such as `ffmpeg`, `exiftool`, and `zbarimg` belong on the gateway side, not in shared code
- `src/fun/backlink/` contains the backlink matcher and its catalog. `src/fun/osint/` contains the site definitions used by username lookups

## Storage

- `src/db.js:initDb` owns the `links` and `ballers` tables. The Bun process uses `@libsql/client` and can use a local SQLite file. The Worker calls Turso's HTTP pipeline and requires a remote database. Use the same remote database when running both runtimes together
- `src/shortlinks.js` holds shared SQL, slug rules, and destination validation. `src/fun/links.js` and `src/fun/memes.js` manage links and triggers from the gateway. Their slash equivalents are in `worker.js`. Redirects are public, while commands that manage links or triggers go through the bot allowlist

## Checks

```sh
bun install --frozen-lockfile
bun --no-env-file test
bun --no-env-file run check
bun --no-env-file run worker:deploy --dry-run
```

`check` runs TypeScript with `checkJs` and emits nothing. `tests/runtime.test.js` signs Discord requests locally, mocks Turso for the Worker, and exercises the Express app with SQLite. Cipher ranking and layered decoding have separate regression tests in `tests/identify.test.js` and `tests/bacon-layers.test.js`. Tests do not need production credentials

## Deployment

Pushing to GitHub does not deploy either runtime. The Bun process reads `.env`; the Worker reads Cloudflare bindings and uses `.dev.vars` for local development. `wrangler.jsonc` defines the Worker route; setting `DOMAIN` does not change it. `scripts/deploy-worker.mjs` loads deployment settings and `scripts/discord-app.mjs` gets the signing public key from the configured Discord app. Deploying handler code and registering a changed slash manifest are separate steps. The gateway uses `deploy/systemd/syndication-gateway.service` and needs a restart to load new code

See [DEPLOY.md](DEPLOY.md) for setup. Use placeholders in examples and keep live tokens and `.env` out of Git. Do not deploy, restart the gateway, or register live commands as part of a local check

## Conventions

Use Bun and keep `bun.lock` in sync with dependency changes. Keep Markdown direct and use full stops between sentences, not at the end of a paragraph or list item. Use Conventional Commits
