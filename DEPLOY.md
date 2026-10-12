# Hosting the bot on HeavenCloud (free tier)

Local box stays the fallback until this is live. Do both, then stop local.

## 1. Claim the slot

1. Join their Discord, claim a free server at control.heavencloud.in
   (715 MB RAM, no sleep, renew with 1 click every 7 days).
2. Pick the Bun egg if offered, else Node 20+.

## 2. Get the code on there

Option A (git): pull this repo in their file manager / console.
Option B (upload): zip everything EXCEPT `node_modules` and `.env`.

Then install deps in their console:

```sh
bun install
```

## 3. Environment variables (panel → Startup / Variables)

| Var | Value |
|---|---|
| `TOKEN` | Discord bot token (DM me, never commit it) |
| `TURSO_URL` | `libsql://syndication-juneja.aws-ap-south-1.turso.io` |
| `TURSO_AUTH_TOKEN` | DM me, never commit it |
| `PORT` | `5000` (unused for Discord, harmless) |
| `DOMAIN` | `https://go.squeakyfiddlepro.me` |
| `COMMAND_PREFIX` | `ts` |
| `WORDLIST` | leave empty (rockyou stays local-only) |
| `DICT` | leave empty (uses panel system dict if present) |
| `GITHUB_TOKEN` | optional classic PAT for 5000/hr GitHub quota |
| `WELCOME_CHANNEL_ID` | optional |
| `WEBHOOK` | optional |

## 4. Start command

```sh
bun src/index.js
```

## 5. Verify in Discord

- `ts help` → embed menu
- `ts doctor` → capability report; expect on panel:
  - runtime, discord ping, turso: ok
  - wordlist: missing (fine — `ts crack` needs WORDLIST, rockyou is 140MB)
  - ffmpeg/python3/cv2/exiftool/steghide: whatever panel has;
    missing ones degrade gracefully with honest messages

## 6. Cut over

Tell me when `ts doctor` is green on the panel — I stop the local
systemd service so two instances never fight over the gateway.

## Limits to know

- No backups on free tier: code is in git, data in Turso, nothing to lose.
- 7-day renewal click or it suspends (2-day grace, then deleted).
- No inbound ports needed: bot only makes outbound connections
  (Discord gateway, Turso, public HTTPS APIs). Short links run on the
  Cloudflare Worker, not here.
