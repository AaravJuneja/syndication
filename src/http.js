const express = require("express");
const { LOOKUP_LINK, linkTarget } = require("./shortlinks");

function createApp(db) {
  const app = express();
  app.disable("x-powered-by");
  app.get("/health", (_req, res) => res.type("text").send("ok"));
  app.get("/", (_req, res) => res.type("text").send("syndication"));
  app.all(["/interactions", "/health", "/"], (_req, res) => res.sendStatus(405));
  app.get("/:slug", async (req, res) => {
    const slug = req.params.slug;
    if (slug.includes("/")) return res.sendStatus(404);
    try {
      const { rows } = await db.execute({ sql: LOOKUP_LINK, args: [slug] });
      const target = linkTarget(rows[0]?.link);
      return target ? res.redirect(302, target) : res.sendStatus(404);
    } catch {
      return res.status(503).type("text").send("short-link database unavailable");
    }
  });
  app.use((_req, res) => res.sendStatus(404));
  /** @type {import('express').ErrorRequestHandler} */
  const onError = (error, _req, res, _next) => res.sendStatus(error.status === 400 ? 400 : 500);
  app.use(onError);
  return app;
}

module.exports = { createApp };
