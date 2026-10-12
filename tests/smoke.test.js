import { describe, it, expect, beforeAll } from "bun:test";

process.env.TURSO_URL = "file:/tmp/syndication-test.db";

const { initDb } = require("../src/db.js");
const codecs = require("../src/fun/codecs.js");
const solve = require("../src/fun/solve.js");
const hunt = require("../src/fun/hunt.js");

const sent = [];
const channel = {
  send: async (c) => {
    sent.push(typeof c === "string" ? c : "[obj]");
    return { createMessageComponentCollector: () => ({ on() {} }), edit: async () => {} };
  },
};
const msg = (content) => ({
  content, channelId: "1", channel,
  author: { username: "t", id: "9" }, member: {}, delete: async () => {},
});
const lastText = () => sent.filter((x) => typeof x === "string").pop() || "";

beforeAll(async () => {
  await initDb();
});

describe("codecs", () => {
  it("base64 roundtrip", async () => {
    await codecs({}, msg("ts b64 encode hi"));
    expect(lastText()).toBe("aGk=");
    await codecs({}, msg("ts b64 decode aGk="));
    expect(lastText()).toBe("hi");
  });
  it("rot13", async () => {
    await codecs({}, msg("ts rot hello"));
    expect(lastText()).toBe("uryyb");
  });
  it("hash md5", async () => {
    await codecs({}, msg("ts hash md5 abc"));
    expect(lastText()).toBe("900150983cd24fb0d6963f7d28e17f72");
  });
  it("what identifies md5", async () => {
    await codecs({}, msg("ts what 5d41402abc4b2a76b9719d911017c592"));
    expect(lastText().toLowerCase()).toContain("md5");
  });
  it("auto finds base64", async () => {
    await codecs({}, msg("ts auto aGVsbG8gd29ybGQgdGhpcyBpcyBhIHRlc3Q="));
    expect(lastText()).toContain("hello world this is a test");
  });
  it("ignores other prefixes", async () => {
    expect(await codecs({}, msg("hello world"))).toBe(false);
  });
});

describe("solvers", () => {
  it("caesar brute", async () => {
    await codecs({}, msg("ts caesar abc"));
    expect(lastText()).toContain("1: bcd");
  });
  it("vigenere roundtrip", async () => {
    await codecs({}, msg("ts vig encode lemon attackatdawn"));
    expect(lastText()).toBe("lxfopvefrnhr");
  });
  it("affine brute finds hello", async () => {
    await solve({}, msg("ts affine rclla"));
    expect(lastText().toLowerCase()).toContain("hello");
  });
  it("factor small semiprime", async () => {
    await solve({}, msg("ts factor 8051"));
    expect(lastText()).toBe("8051 = 83 × 97");
  });
  it("wiener small-d", async () => {
    await solve({}, msg("ts wiener 7067 10807"));
    expect(lastText()).toContain("101");
  });
  it("fermat close primes", async () => {
    await solve({}, msg("ts fermat 10403"));
    expect(lastText()).toContain("101");
  });
  it("substitution top hits", async () => {
    await solve({}, msg("ts sub " + "gsv jfrxp yildm ulc".replace(/[a-z]/g, (c) => c)));
    expect(lastText().length).toBeGreaterThan(0);
  });
});

describe("hunt", () => {
  it("backlink finds youtube", async () => {
    await hunt({}, msg("ts backlink dQw4w9WgXcQ"));
    expect(lastText()).toContain("youtu.be/dQw4w9WgXcQ");
  });
  it("braille roundtrip", async () => {
    await hunt({}, msg("ts braille decode ⠓⠑⠇⠇⠕"));
    expect(lastText()).toBe("hello");
  });
  it("brainfuck hello world", async () => {
    await hunt({}, msg("ts bf ++++++++++[>+++++++>++++++++++>+++>+<<<<-]>++.>+.+++++++..+++.>++.<<+++++++++++++++.>.+++.------.--------.>+.>."));
    expect(lastText().trim()).toBe("Hello World!");
  });
  it("jwt none forge", async () => {
    await hunt({}, msg('ts jwt none {"user":"admin"}'));
    expect(lastText().split(".").length).toBe(3);
  });
});
