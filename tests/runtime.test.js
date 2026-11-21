import { afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import { createClient } from "@libsql/client";
import { once } from "node:events";
import { createApp } from "../src/http.js";
import { INSERT_LINK, linkTarget, validNewSlug } from "../src/shortlinks.js";
import worker from "../worker.js";

const origin = "https://go.example.com";
const env = { ALLOWED_USERS: "100, 200", TURSO_URL: "libsql://db.example.com", TURSO_AUTH_TOKEN: "test-write-token", DOMAIN: origin, DISCORD_PUBLIC_KEY: "" };
const ctx = { waitUntil() {} };
const encode = new TextEncoder();
let privateKey;

beforeAll(async () => {
  const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
  privateKey = keys.privateKey;
  env.DISCORD_PUBLIC_KEY = Buffer.from(await crypto.subtle.exportKey("raw", keys.publicKey)).toString("hex");
});
afterEach(() => mock.restore());

async function interaction(payload, { timestamp = String(Math.floor(Date.now() / 1000)), tamper = false } = {}) {
  const body = JSON.stringify(payload);
  const sig = await crypto.subtle.sign("Ed25519", privateKey, encode.encode(timestamp + body));
  return new Request(origin + "/interactions", {
    method: "POST", body: tamper ? body + " " : body,
    headers: { "X-Signature-Ed25519": Buffer.from(sig).toString("hex"), "X-Signature-Timestamp": timestamp },
  });
}

const command = (name, user = "100", options = {}) => ({
  type: 2, application_id: "123", token: "test-interaction-token", member: { user: { id: user } },
  data: { name, options: Object.entries(options).map(([name, value]) => ({ name, value })) },
});
const tursoResult = (rows = [], affected_row_count = 0) => Response.json({
  results: [{ type: "ok", response: { type: "execute", result: { rows, affected_row_count } } }],
});
const asFetch = (fn) => Object.assign(fn, { preconnect: globalThis.fetch.preconnect });

describe("Worker", () => {
  it("answers a real Ed25519-signed Discord ping, but rejects tampering and stale requests", async () => {
    const valid = await worker.fetch(await interaction({ type: 1 }), env, ctx);
    expect(await valid.json()).toEqual({ type: 1 });
    const tampered = await worker.fetch(await interaction({ type: 1 }, { tamper: true }), env, ctx);
    expect(tampered.status).toBe(401);
    const stale = await worker.fetch(await interaction({ type: 1 }, { timestamp: "1700000000" }), env, ctx);
    expect(stale.status).toBe(401);
  });

  it("checks the allowlist before database work and disables mentions in replies", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    const denied = await worker.fetch(await interaction(command("link-remove", "400", { short: "one" })), env, ctx);
    expect(await denied.json()).toMatchObject({ type: 4, data: { flags: 64, content: "not on the allowlist" } });
    expect(fetchSpy).not.toHaveBeenCalled();
    const permitted = await worker.fetch(await interaction(command("baller-say", "200", { text: "@everyone" })), env, ctx);
    expect(await permitted.json()).toMatchObject({ data: { content: "@everyone", allowed_mentions: { parse: [] } } });
  });

  it("ranks and explains encoded text on both identifier command names", async () => {
    for (const name of ["what", "identify"]) {
      const response = await worker.fetch(await interaction(command(name, "100", { text: "SGVsbG8=" })), env, ctx);
      const { data } = await response.json();
      expect(data.content).toMatch(/1\. Base64/i);
      expect(data.content).toContain("Hello");
      expect(data.content).toContain("why:");
    }
  });

  it("discloses sampling for an input larger than the Worker analysis limit", async () => {
    const input = "The map is hidden under the wooden table. ".repeat(60);
    const response = await worker.fetch(await interaction(command("what", "100", { text: input })), env, ctx);
    const { data } = await response.json();
    expect(data.content).toMatch(/analyzed first \d+/);
    expect(data.content).toContain("Plain English");
  });

  it("reports the path through multiple decoding layers", async () => {
    const text = btoa("gur znc vf uvqqra haqre gur jbbqra gnoyr");
    const response = await worker.fetch(await interaction(command("auto", "100", { text })), env, ctx);
    const { data } = await response.json();
    expect(data.content).toContain("[base64 > rot13] the map is hidden under the wooden table");
  });

  it("defers a link write and reports whether the insert happened", async () => {
    let task;
    const calls = [];
    spyOn(globalThis, "fetch").mockImplementation(asFetch(async (input, init) => {
      const request = new Request(input, init);
      calls.push({ url: request.url, method: request.method, body: await request.json() });
      return request.url.startsWith("https://db.example.com/") ? tursoResult([], 0) : new Response(null, { status: 200 });
    }));
    const response = await worker.fetch(await interaction(command("link-add", "100", {
      name: "Example", short: "example", url: "https://example.com",
    })), env, { waitUntil(promise) { task = promise; } });
    expect(await response.json()).toEqual({ type: 5, data: { flags: 64 } });
    await task;
    expect(calls[0].body.requests[0].stmt).toMatchObject({ sql: INSERT_LINK, args: [{ value: "example" }, { value: "Example" }, { value: "https://example.com/" }, { value: expect.any(String) }] });
    expect(calls[1]).toMatchObject({ method: "PATCH", body: { content: "short already exists", allowed_mentions: { parse: [] } } });
  });

  it("distinguishes redirects, missing links and database failures", async () => {
    const fetchSpy = spyOn(globalThis, "fetch");
    fetchSpy.mockImplementationOnce(asFetch(async () => tursoResult([[{ type: "text", value: "https://example.com/target" }]])));
    fetchSpy.mockImplementationOnce(asFetch(async () => tursoResult()));
    fetchSpy.mockImplementationOnce(asFetch(async () => Response.json({ results: [{ type: "error" }] })));
    const hit = await worker.fetch(new Request(origin + "/hit"), env, ctx);
    expect(hit.status).toBe(302);
    expect(hit.headers.get("location")).toBe("https://example.com/target");
    expect((await worker.fetch(new Request(origin + "/missing"), env, ctx)).status).toBe(404);
    expect((await worker.fetch(new Request(origin + "/down"), env, ctx)).status).toBe(503);
    expect((await worker.fetch(new Request(origin + "/%xy"), env, ctx)).status).toBe(400);
    expect((await worker.fetch(new Request(origin + "/health"), env, ctx)).status).toBe(200);
  });
});

describe("Node short links", () => {
  it("resolves existing slugs and reports missing and unavailable links separately", async () => {
    const db = createClient({ url: "file::memory:" });
    await db.execute("CREATE TABLE links (backlink TEXT PRIMARY KEY, name TEXT, link TEXT, date TEXT)");
    await db.execute({ sql: INSERT_LINK, args: ["example", "Example", "https://example.com", "2026-01-01"] });
    const server = createApp(db).listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
      const base = "http://127.0.0.1:" + address.port;
      const hit = await fetch(base + "/example", { redirect: "manual" });
      expect(hit.status).toBe(302);
      expect(hit.headers.get("location")).toBe("https://example.com/");
      expect((await fetch(base + "/missing", { redirect: "manual" })).status).toBe(404);
      db.close();
      expect((await fetch(base + "/example", { redirect: "manual" })).status).toBe(503);
      expect(await (await fetch(base + "/health")).text()).toBe("ok");
    } finally {
      db.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("validates new slugs and redirects without requiring a migration of old names", () => {
    expect(validNewSlug("a-slug_1")).toBe(true);
    expect(validNewSlug("a/b")).toBe(false);
    expect(validNewSlug("INTERACTIONS")).toBe(false);
    expect(validNewSlug("health")).toBe(false);
    expect(linkTarget("https://example.com/a")).toBe("https://example.com/a");
    expect(linkTarget("https://user@example.com/a")).toBeNull();
    expect(linkTarget("/local")).toBeNull();
  });
});
