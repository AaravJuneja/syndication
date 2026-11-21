import { describe, it, expect } from "bun:test";

const { baconEncode, baconDecode } = require("../src/fun/bacon.js");
const { solveLayers, LAYER_LIMITS } = require("../src/fun/layers.js");
const solve = require("../src/fun/solve.js");
const codecs = require("../src/fun/codecs.js");
const bases = require("../src/fun/bases.js");

const sent = [];
const msg = (content) => ({ content, channel: { send: async (c) => sent.push(c) } });
const lastText = () => sent.filter((x) => typeof x === "string").pop() || "";
const rot13 = (s) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= "Z" ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
});

describe("bacon", () => {
  it("uses the standard 24 letter table", () => {
    expect(baconEncode("a")).toBe("aaaaa");
    expect(baconEncode("i")).toBe("abaaa");
    expect(baconEncode("j")).toBe("abaaa");
    expect(baconEncode("u")).toBe("baabb");
    expect(baconEncode("v")).toBe("baabb");
    expect(baconEncode("w")).toBe("babaa");
    expect(baconEncode("z")).toBe("babbb");
  });

  it("round trips every letter with I=J and U=V merged", () => {
    const enc = baconEncode("the quick brown fox jumps over the lazy dog");
    expect(baconDecode(enc)).toBe("the quick brown fox iumps ouer the lazy dog");
  });

  it("supports the 26 letter table", () => {
    expect(baconEncode("z", { variant: 26 })).toBe("bbaab");
    expect(baconDecode("bbaab", { variant: 26 })).toBe("z");
    expect(baconDecode(baconEncode("jive", { variant: 26 }), { variant: 26 })).toBe("jive");
  });

  it("accepts 0/1 and rejects ragged groups", () => {
    expect(baconDecode("00000 00001")).toBe("ab");
    expect(baconDecode("aaaa")).toBeNull();
    expect(baconEncode("hi!")).toBeNull();
  });

  it("is wired into ts bacon", async () => {
    await solve({}, msg("ts bacon encode z"));
    expect(lastText()).toBe("babbb");
    await solve({}, msg("ts bacon decode babbb"));
    expect(lastText()).toBe("z");
    await solve({}, msg("ts bacon decode v=26 bbaab"));
    expect(lastText()).toBe("z");
    await solve({}, msg("ts bacon encode hi you"));
    expect(lastText()).toBe("aabbb abaaa / babba abbab baabb");
    await solve({}, msg("ts bacon aabbb abaaa / babba abbab baabb"));
    expect(lastText()).toBe("hi you");
  });
});

describe("layered auto", () => {
  const P = "meet me at the old bridge after dark";

  it("peels base64 then rot13", () => {
    const r = solveLayers(rot13(Buffer.from(P).toString("base64")));
    expect(r.results[0].path).toEqual(["rot13", "base64"]);
    expect(r.results[0].text).toBe(P);
  });

  it("peels four layers", () => {
    const text = Buffer.from(rot13(Buffer.from(Buffer.from(P).toString("base64")).toString("hex"))).toString("base64");
    const r = solveLayers(text);
    expect(r.results[0].path).toEqual(["base64", "rot13", "hex", "base64"]);
    expect(r.results[0].text).toBe(P);
  });

  it("stops on a plain crib", () => {
    const r = solveLayers(Buffer.from(rot13("flag{layers_are_fun}")).toString("base64"), { crib: "flag{" });
    expect(r.stats.stoppedBy).toBe("crib found");
    expect(r.results[0].text).toBe("flag{layers_are_fun}");
  });

  it("respects depth and search limits", () => {
    const text = Buffer.from(rot13(Buffer.from(P).toString("base64"))).toString("hex");
    expect(solveLayers(text, { depth: 1 }).results.every((x) => x.path.length <= 1)).toBe(true);
    const r = solveLayers("qwpoeiruty zmxncbv alskdjfhg", { maxExpansions: 20, maxStates: 50 });
    expect(r.stats.expanded).toBeLessThanOrEqual(20);
    expect(r.stats.generated).toBeLessThanOrEqual(50);
    const big = solveLayers("x".repeat(LAYER_LIMITS.maxInput + 50));
    expect(big.stats.truncated).toBe(true);
  });

  it("ts auto shows the path and the search bounds", async () => {
    await codecs({}, msg("ts auto " + rot13(Buffer.from(P).toString("base64"))));
    expect(lastText()).toContain("[rot13 > base64]");
    expect(lastText()).toContain(P);
    expect(lastText()).toContain("searched");
    await codecs({}, msg("ts auto zzzz qqqq"));
    expect(lastText()).toContain("Nothing readable");
  });

  it("preserves multiline UUencoded input with options", async () => {
    const plaintext = P + " and bring the map with you";
    await bases({}, msg("ts uu encode " + plaintext));
    const encoded = lastText();
    expect(encoded).toContain("\n");
    await codecs({}, msg("ts auto depth=2 begin 644 puzzle.txt\n" + encoded + "\nend crib=bridge"));
    expect(lastText()).toContain("[uu]");
    expect(lastText()).toContain(plaintext);
  });

  it("ts what and ts identify share the engine", async () => {
    await codecs({}, msg("ts identify " + Buffer.from(P).toString("base64")));
    expect(lastText()).toContain("Base64");
    expect(lastText()).toContain("not probabilities");
    await codecs({}, msg("ts what someone@example.com"));
    expect(lastText()).toContain("email address");
  });
});
