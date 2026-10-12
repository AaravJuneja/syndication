# syndication

Link shortener + meme bot for **squeakyfiddlepro.me**, built for a small
CTF team server.

## What it does

Short links (served from your domain):

- `GET /<short>` looks up the Turso `links` table and 302-redirects.
- Unknown slugs redirect to the domain homepage.
- `GET /health` returns `ok` for uptime checks.

Discord (every command starts with `ts `):

- `ts link add <name> <short> <url>` — create a short link.
- `ts link remove <short>[,<short2>...]` — delete short link(s).
- `ts link edit <short> <field> <new value>` — edit `name` or `link`.
- `ts link show` — paged embed of every short link.
- `ts link help` — usage.
- `baller add "trigger" "response"` — teach an auto-reply.
- `baller remove "trigger"` / `baller reset` — delete them.
- `baller say <text>` — speak through the bot, trigger message deleted.
- `baller show` — paged embed of every trigger.
- Any exact trigger message gets its response posted.
- `hee hee` — replies `*hee hee*` (5% chance of the audio clip).
- `bhakas alert`, `invalid opinion`, `popcorn`, `ts sit man` — one-liners, everyone can use them.
- Join welcome ping (only if `WELCOME_CHANNEL_ID` is set).
- Uncaught exceptions are posted to `WEBHOOK` when set.

No roles, no channel gates: every command works for everyone, anywhere.

Solver kit (all offline):

- `ts b64`, `ts hex`, `ts url`, `ts bin`, `ts morse`, `ts b32`, `ts html`, `ts uni` (encode|decode)
- `ts rot [n]`, `ts rot47`, `ts caesar` (all shifts), `ts atbash`, `ts rev`
- `ts vig encode|decode <key>`, `ts rail` (all rails), `ts dec`, `ts enc`
- `ts freq`, `ts ic`, `ts hashid`, `ts jwt`, `ts decon`, `ts auto [crib=]`, `ts what`
- `ts hash ...`, `ts crack`, `ts upper/lower/len`, `ts get`, `ts forensics`, `ts qr`
- `ts backlink <id|url>` (52-rule service identifier, shortener resolution)
- `ts dtmf`, `ts amorse`, `ts spectro` (audio files via URL, ffmpeg + python)
- `ts zw` (zero-width steg), `ts braille`, `ts tap`, `ts anagram`, `ts phone`, `ts bf`
- `ts web <url>` (headers, robots.txt, comments, JS), `ts user <name>` (20 sites)
- `ts jwt none {json}`, `ts jwt crack <token>` (wordlist HMAC brute)
- `ts sub`, `ts vigcrack`, `ts affine`, `ts bacon`, `ts a1z26`, `ts ook`, `ts b36`
- `ts factor`, `ts rsa`, `ts xorcrack` (Pollard Rho + HMAC-style scoring)
- `ts wiener`, `ts hastad`, `ts fermat`, `ts factordb`, `ts xordrag`, `ts saml`
- `ts png` (chunks + hidden text), `ts lsb` (PNG/BMP), `ts carve` (mini-binwalk)
- `ts negate`, `ts flop`, `ts solar` (ImageMagick steg inspection)
- `ts ghuser`, `ts ghemail`, `ts ghemails`, `ts ghkeys` (GitHub OSINT)
- `ts weather`, `ts ip`, `ts userscan` (327-site Sherlock-engine scan)

## Setup

1. Create an application at <https://discord.com/developers/applications>,
   add a bot, enable the **Server Members Intent** and **Message Content
   Intent**, and invite it with `bot` + `applications.commands` scopes.
2. Copy `.env.example` to `.env` and fill it in.
3. Run it:

```sh
bun install
bun start
```

Point your domain at the host running this on `PORT` (default 5000) and
every `https://go.squeakyfiddlepro.me/<short>` resolves.
