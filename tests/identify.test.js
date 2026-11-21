import { describe, it, expect } from "bun:test";

const fs = require("node:fs");
const path = require("node:path");
const { identify, formatIdentify, analyze } = require("../src/fun/identify.js");

const P = "It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity.";
const LONG = "Meet me at the old bridge after dark and bring the map, the gold and the lantern because the river road is closed tonight. ";

const shift = (s, n) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= "Z" ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26 + 26) % 26 + b);
});
const atbash = (s) => s.replace(/[a-z]/gi, (c) => {
  const b = c <= "Z" ? 65 : 97;
  return String.fromCharCode(b + 25 - (c.charCodeAt(0) - b));
});
const vigenere = (s, key) => {
  let i = 0;
  return s.replace(/[a-z]/gi, (c) => {
    const b = c <= "Z" ? 65 : 97;
    const k = key.charCodeAt(i++ % key.length) - 65;
    return String.fromCharCode(((c.charCodeAt(0) - b + k) % 26) + b);
  });
};
const beaufort = (s, key) => {
  let i = 0;
  return s.replace(/[a-z]/gi, (c) => {
    const x = c.toUpperCase().charCodeAt(0) - 65;
    const k = key.charCodeAt(i++ % key.length) - 65;
    return String.fromCharCode(65 + ((k - x + 26) % 26));
  });
};
const porta = (s, key) => {
  let i = 0;
  return s.toUpperCase().replace(/[A-Z]/g, (c) => {
    const p = c.charCodeAt(0) - 65;
    const g = Math.floor((key.charCodeAt(i++ % key.length) - 65) / 2);
    const out = p < 13 ? 13 + ((p + g) % 13) : (p - 13 - g + 13) % 13;
    return String.fromCharCode(65 + out);
  });
};
const railEncode = (s, r) => {
  const rows = Array.from({ length: r }, () => "");
  let i = 0;
  let d = 1;
  for (const c of s) {
    rows[i] += c;
    if (i === 0) d = 1;
    else if (i === r - 1) d = -1;
    i += d;
  }
  return rows.join("");
};
const substitute = (s) => s.toLowerCase().replace(/[a-z]/g, (c) => "qwertyuiopasdfghjklzxcvbnm"[c.charCodeAt(0) - 97]);
const xorshift = (n, seed) => {
  let x = seed >>> 0;
  let out = "";
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out += String.fromCharCode(65 + (x % 26));
  }
  return out;
};
const top = (text, opts) => identify(text, opts).candidates[0];
const byId = (text, id, opts) => identify(text, opts).candidates.find((c) => c.id === id);

describe("identify ranks with evidence", () => {
  const cases = [
    ["base64", Buffer.from(P).toString("base64")],
    ["hex", Buffer.from("hello world, this is hex").toString("hex")],
    ["binary", [...Buffer.from("hi there")].map((b) => b.toString(2).padStart(8, "0")).join(" ")],
    ["base32", "NBSWY3DPEB3W64TMMQ======"],
    ["morse", ".... . .-.. .-.. --- / .-- --- .-. .-.. -.."],
    ["bacon", "aabbb aabaa ababa ababa abbab"],
    ["a1z26", "8 5 12 12 15"],
    ["decimal", "72 101 108 108 111"],
    ["polybius", "23 15 31 31 34"],
    ["adfgvx", "AFDADFVXDDXF"],
    ["rot13", shift(P, 13)],
    ["caesar", shift(P, 3)],
    ["atbash", atbash(P)],
    ["railfence", railEncode(P.replace(/[^a-z]/gi, "").toUpperCase(), 3)],
    ["monoalphabetic", substitute(P)],
    ["url", "hello%20world%21"],
    ["brainfuck", "++++++++[>++++[>++>+++<<-]>.]"],
    ["plaintext", P],
  ];
  for (const [id, text] of cases) {
    it(id, () => {
      const c = top(text);
      expect(c.id).toBe(id);
      expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.score).toBeGreaterThanOrEqual(55);
    });
  }

  it("recovers a Vigenere key and names the variant caveat", () => {
    const c = top(vigenere(P, "LEMON"));
    expect(c.id).toBe("vigenere");
    expect(c.name).toContain("LEMON");
    expect(c.preview.toLowerCase()).toContain("it was the best of times");
    expect(c.caveats.join(" ")).toContain("variant Beaufort");
  });

  it("separates Beaufort from Vigenere by trial decryption", () => {
    const c = top(beaufort(P.replace(/[^a-z]/gi, ""), "KEY"));
    expect(c.id).toBe("beaufort");
    expect(c.name).toContain("KEY");
  });

  it("identifies JWTs without revealing their claims", () => {
    const tok = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const c = top(tok);
    expect(c.id).toBe("jwt");
    expect(c.preview).toBeUndefined();
    expect(c.evidence.join(" ")).toContain("HS256");
    expect(c.caveats.join(" ")).toContain("not verified");
  });

  it("keeps hash digests one-way", () => {
    const c = top("5d41402abc4b2a76b9719d911017c592");
    expect(c.id).toBe("hash");
    expect(c.name).toContain("MD5");
    expect(c.caveats.join(" ")).toContain("one-way");
  });

  it("finds single-byte XOR over hex", () => {
    const hex = Buffer.from(Buffer.from("hello there my good friend").map((b) => b ^ 0x42)).toString("hex");
    const c = top(hex);
    expect(c.id).toBe("xor1");
    expect(c.evidence.join(" ")).toContain("0x42");
  });
});

describe("identify does not overclaim", () => {
  it("random letters are not called Vigenere or Beaufort", () => {
    const r = identify(xorshift(600, 12345));
    for (const c of r.candidates) {
      expect(["vigenere", "beaufort", "caesar", "rot13", "affine", "plaintext"]).not.toContain(c.id);
      expect(c.score).toBeLessThan(63);
    }
  });

  it("periodic but unconfirmed text is only a signature", () => {
    const c = byId(porta(P, "PORTAKEY"), "polyalphabetic");
    expect(c).toBeDefined();
    expect(c.score).toBeLessThanOrEqual(62);
    expect(c.caveats.join(" ")).toContain("not a confirmation");
  });

  it("caps short inputs and says why", () => {
    const c = top("Uryyb Jbeyq");
    expect(c.id).toBe("rot13");
    expect(c.score).toBeLessThanOrEqual(65);
    expect(c.caveats.join(" ")).toContain("short input");
  });

  it("returns nothing confident for tiny input", () => {
    expect(identify("hi").candidates.filter((c) => c.score >= 30)).toEqual([]);
    expect(formatIdentify(identify("hi"))).toContain("No confident match");
  });

  it("all-one-letter text is not a cipher", () => {
    const r = identify("a".repeat(5000));
    expect(r.candidates.filter((c) => c.score >= 30)).toEqual([]);
  });
});

describe("identify long input and sampling", () => {
  it("analyzes a bounded prefix and says so", () => {
    const text = Buffer.from(LONG.repeat(80)).toString("base64");
    const r = identify(text, { mode: "fast" });
    expect(r.stats.length).toBe(text.length);
    expect(r.stats.analyzed).toBe(1200);
    const c = r.candidates[0];
    expect(c.id).toBe("base64");
    expect(c.score).toBeLessThanOrEqual(90);
    expect(c.caveats.join(" ")).toContain("only the first 1200 of " + text.length);
    expect(formatIdentify(r)).toContain("analyzed first 1200 of " + text.length);
  });

  it("drops confidence when the unseen tail changes alphabet", () => {
    const head = Buffer.from(LONG.repeat(60)).toString("base64");
    const r = identify(head + " ~~~ !!! @@@ ###", { mode: "fast" });
    const c = r.candidates.find((x) => x.id === "base64");
    expect(c.caveats.join(" ")).toContain("later text adds characters");
    expect(c.score).toBeLessThanOrEqual(65);
  });

  it("says when read checks used only a sample", () => {
    const c = top(shift(LONG.repeat(6), 7));
    expect(c.id).toBe("caesar");
    expect(c.evidence.join(" ")).toContain("read-checked on the first 400 chars");
  });

  it("stats on a sampled run never report more than was analyzed", () => {
    const text = LONG.repeat(200);
    const st = analyze(text, { mode: "fast" });
    expect(st.analyzed).toBe(1200);
    expect(st.fitSample).toBe(240);
    expect(st.letters).toBeLessThanOrEqual(1200);
  });

  it("stays bounded on very large input", () => {
    const text = shift(LONG, 5).repeat(1000);
    identify(text);
    const t0 = performance.now();
    const r = identify(text);
    const ms = performance.now() - t0;
    expect(r.stats.analyzed).toBe(4000);
    expect(r.candidates[0].id).toBe("caesar");
    expect(ms).toBeLessThan(250);
  });

  it("fast mode keeps classical detection on a long ciphertext", () => {
    const text = vigenere(LONG.repeat(25), "LANTERN");
    const r = identify(text, { mode: "fast" });
    expect(r.candidates[0].id).toBe("vigenere");
    expect(r.candidates[0].name).toContain("LANTERN");
  });

  it("formatted output stays under the Discord limit", () => {
    const out = formatIdentify(identify(substitute(LONG.repeat(30))));
    expect(out.length).toBeLessThanOrEqual(1800);
  });
});

describe("shared helpers stay Web-compatible", () => {
  for (const file of ["identify.js", "bacon.js", "layers.js"]) {
    it(file, () => {
      const src = fs.readFileSync(path.join(__dirname, "..", "src", "fun", file), "utf8");
      expect(src).not.toMatch(/\bBuffer\b|require\("node:|require\("(fs|crypto|path|os|zlib)"\)|process\./);
      const requires = [...src.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
      for (const r of requires) expect(r.startsWith("./")).toBe(true);
    });
  }
});
