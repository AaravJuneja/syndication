# Syndication

A Discord toolkit and [short-link service](https://go.squeakyfiddlepro.me) for
a small CTF team.

## Identify unknown text

Use `/what` or `ts what <text>` for ranked guesses with evidence. For example,
`SGVsbG8=` matches Base64 and decodes to `Hello`. Use `/auto` or `ts auto` to
try decoding multiple layers.

## Other commands

- `/help` or `ts help` lists commands, including text encoders and ciphers.
- `/link-add`, `/link-edit`, `/link-remove`, and `/link-show` have `ts link`
  equivalents. Short links are public.
- `/baller-add` or `ts add "trigger" "response"` teaches an exact-match reply.

See [DEPLOY.md](DEPLOY.md) for setup.
