const DB_HOST = "syndication-juneja.aws-ap-south-1.turso.io";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response("ok");
    }
    const slug = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
    if (!slug || slug.includes("/")) {
      return new Response("unknown short link", { status: 404 });
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
      if (rows.rows && rows.rows.length) {
        target = rows.rows[0][0];
      }
    } catch {}
    if (target) {
      return Response.redirect(target, 302);
    }
    return new Response("unknown short link", { status: 404 });
  },
};
