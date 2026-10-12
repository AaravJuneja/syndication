const DB_HOST = "syndication-juneja.aws-ap-south-1.turso.io";
const APP_PUBLIC_KEY = "b5fe3f8cead4fcea076f4299a740fdb323889e3f0c36234f5df2c4d889ebbf18";

function hexToBytes(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function verifyDiscord(request, body) {
  const sig = request.headers.get("X-Signature-Ed25519");
  const ts = request.headers.get("X-Signature-Timestamp");
  if (!sig || !ts) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToBytes(APP_PUBLIC_KEY),
      { name: "NODE-ED25519", namedCurve: "NODE-ED25519" },
      false,
      ["verify"]
    );
    const msg = new TextEncoder().encode(ts + body);
    return await crypto.subtle.verify("NODE-ED25519", key, hexToBytes(sig), msg);
  } catch {
    return false;
  }
}

function slashReply(content) {
  return Response.json({ type: 4, data: { content: String(content).slice(0, 1900) } });
}

function opt(interaction, name) {
  const o = (interaction.data.options || []).find((x) => x.name === name);
  return o ? String(o.value) : "";
}

function caesar(s, n) {
  return s.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode((((c.charCodeAt(0) - base + n) % 26 + 26) % 26) + base);
  });
}

async function shaHex(algo, text) {
  const map = { sha1: "SHA-1", sha224: "SHA-224", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" };
  if (!map[algo]) return null;
  const digest = await crypto.subtle.digest(map[algo], new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const LANDING = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Syndication</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #000; color: #eee; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; padding: 24px; }
  h1 { font-size: clamp(40px, 8vw, 72px); letter-spacing: 2px; }
  h1 span { color: #16e16e; }
  p { color: #888; margin-top: 12px; }
  code { background: #111; border: 1px solid #16e16e; color: #16e16e; border-radius: 6px; padding: 8px 14px; display: inline-block; margin-top: 20px; }
</style>
</head>
<body>
<div>
<h1>syndi<span>cation</span></h1>
<p>short links for the trio &middot; powered by a discord bot</p>
<code>ts link add &lt;name&gt; &lt;short&gt; &lt;url&gt;</code>
</div>
</body>
</html>`;

export const SLASH_COMMANDS = [
  { name: "ping", description: "syndication check" },
  { name: "help", description: "syndication command menu" },
  { name: "b64", description: "base64 encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "hex", description: "hex encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "url", description: "url encode or decode", options: [{ name: "mode", description: "encode|decode", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "rot", description: "rotate letters", options: [{ name: "text", description: "text", type: 3, required: true }, { name: "n", description: "shift, default 13", type: 4, required: false }] },
  { name: "caesar", description: "all 25 caesar shifts", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "atbash", description: "atbash mirror", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "rev", description: "reverse text", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "upper", description: "uppercase", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "lower", description: "lowercase", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "len", description: "length in chars and bytes", options: [{ name: "text", description: "text", type: 3, required: true }] },
  { name: "hash", description: "sha hash", options: [{ name: "algo", description: "sha1|sha224|sha256|sha384|sha512", type: 3, required: true }, { name: "text", description: "text", type: 3, required: true }] },
  { name: "dec", description: "code points to text", options: [{ name: "codes", description: "72 105", type: 3, required: true }] },
  { name: "enc", description: "text to code points", options: [{ name: "text", description: "text", type: 3, required: true }] },
];

async function handleSlash(interaction) {
  const name = ((interaction.data || {}).name || "").toLowerCase();
  const get = (n) => opt(interaction, n);
  if (name === "ping") return slashReply("syndication is up");
  if (name === "help") {
    return slashReply(
      "**syndication slash kit**\n" +
      "`/b64 /hex /url` mode + text\n`/rot` text + n `/caesar` `/atbash` `/rev`\n" +
      "`/upper /lower /len` `/hash` algo + text `/dec /enc`\n" +
      "heavy lifting (`ts sub`, `ts xorcrack`, steg, osint scans) stays on `ts` prefix"
    );
  }
  if (name === "b64" || name === "hex" || name === "url") {
    const mode = get("mode").toLowerCase();
    const text = get("text");
    try {
      if (mode === "encode") {
        const out = name === "b64" ? btoa(unescape(encodeURIComponent(text)))
          : name === "hex" ? [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, "0")).join("")
          : encodeURIComponent(text);
        return slashReply(out);
      }
      const out = name === "b64" ? decodeURIComponent(escape(atob(text)))
        : name === "hex" ? new TextDecoder().decode(new Uint8Array(text.match(/../g).map((h) => parseInt(h, 16))))
        : decodeURIComponent(text);
      return slashReply(out);
    } catch {
      return slashReply("could not decode that");
    }
  }
  if (name === "rot") {
    const n = parseInt(get("n") || "13", 10);
    return slashReply(caesar(get("text"), isNaN(n) ? 13 : n));
  }
  if (name === "caesar") {
    const text = get("text").slice(0, 120);
    const lines = [];
    for (let n = 1; n < 26; n++) lines.push(n + ": " + caesar(text, n));
    return slashReply(lines.join("\n"));
  }
  if (name === "atbash") {
    return slashReply(get("text").replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
    }));
  }
  if (name === "rev") return slashReply([...get("text")].reverse().join(""));
  if (name === "upper") return slashReply(get("text").toUpperCase());
  if (name === "lower") return slashReply(get("text").toLowerCase());
  if (name === "len") {
    const t = get("text");
    return slashReply(t.length + " chars / " + new TextEncoder().encode(t).length + " bytes");
  }
  if (name === "hash") {
    const out = await shaHex(get("algo").toLowerCase(), get("text"));
    return slashReply(out === null ? "algo: sha1|sha224|sha256|sha384|sha512 (md5 stays on `ts hash`)" : out);
  }
  if (name === "dec") {
    try {
      const nums = get("codes").split(/[\s,]+/).filter(Boolean);
      return slashReply(String.fromCodePoint(...nums.map(Number)));
    } catch {
      return slashReply("usage: /dec codes:72 105");
    }
  }
  if (name === "enc") {
    return slashReply([...get("text")].map((c) => c.codePointAt(0)).join(" "));
  }
  return slashReply("unknown command — /help");
}

export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      const url = new URL(request.url);
      if (url.pathname === "/interactions") {
        const body = await request.text();
        if (!(await verifyDiscord(request, body))) {
          return new Response("bad signature", { status: 401 });
        }
        const interaction = JSON.parse(body);
        if (interaction.type === 1) {
          return Response.json({ type: 1 });
        }
        if (interaction.type === 2) {
          return handleSlash(interaction);
        }
        return new Response("unhandled", { status: 400 });
      }
    }
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    const slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
    if (!slug || slug.includes("/")) {
      return new Response(LANDING, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    let target = null;
    try {
      const res = await fetch("https://" + DB_HOST + "/v2/pipeline", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + env.TURSO_AUTH_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              type: "execute",
              stmt: {
                sql: "SELECT link FROM links WHERE backlink = ?",
                args: [{ type: "text", value: slug }],
              },
            },
          ],
        }),
      });
      const j = await res.json();
      const rows = (((j.results || [])[0] || {}).response || {}).result || {};
      const cell = rows.rows && rows.rows.length ? rows.rows[0][0] : null;
      if (cell) {
        target = typeof cell === "object" ? cell.value : cell;
      }
    } catch {}
    if (target) {
      return Response.redirect(target, 302);
    }
    return new Response("unknown short link", { status: 404 });
  },
};
