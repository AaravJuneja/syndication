const DB_HOST = "syndication-juneja.aws-ap-south-1.turso.io";

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

export default {
  async fetch(request, env) {
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
