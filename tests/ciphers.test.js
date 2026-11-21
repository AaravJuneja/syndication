import { describe, it, expect } from "bun:test";
const squares = require("../src/fun/squares.js");
const transpose = require("../src/fun/transpose.js");
const bases = require("../src/fun/bases.js");
const grids = require("../src/fun/grids.js");
const codecs = require("../src/fun/codecs.js");

const sent = [];
const channel = {
  send: async (c) => {
    sent.push(c);
    return { createMessageComponentCollector: () => ({ on() {} }), edit: async () => {} };
  },
};
const msg = (content) => ({
  content, channelId: "1", channel,
  author: { username: "t", id: "9" }, member: {}, delete: async () => {},
});
const lastText = () => sent.filter((x) => typeof x === "string").pop() || "";

describe("squares", () => {
  it("playfair wiki vector", async () => {
    await squares({}, msg("ts playfair encode k=playfairexample hide the gold in the tree stump"));
    expect(lastText()).toBe("BMODZBXDNABEKUDMUIXMMOUVIF");
  });
  it("playfair decode", async () => {
    await squares({}, msg("ts playfair decode k=playfairexample BMODZBXDNABEKUDMUIXMMOUVIF"));
    expect(lastText()).toContain("HIDETHEGOLD");
  });
  it("bifid vector", async () => {
    await squares({}, msg("ts bifid encode k=SECRET n=3 DCODE"));
    expect(lastText()).toBe("APIAI");
    await squares({}, msg("ts bifid decode k=SECRET n=3 APIAI"));
    expect(lastText()).toBe("DCODE");
  });
  it("trifid vector", async () => {
    await squares({}, msg("ts trifid encode n=5 SECRET"));
    expect(lastText()).toBe("SJLKZT");
    await squares({}, msg("ts trifid decode n=5 SJLKZT"));
    expect(lastText()).toBe("SECRET");
  });
  it("foursquare roundtrip", async () => {
    await squares({}, msg("ts foursquare encode keys=JOHN,GEORGE,PAUL,RINGO BEATLES"));
    const ct = lastText();
    expect(ct.length).toBe(8);
    await squares({}, msg("ts foursquare decode keys=JOHN,GEORGE,PAUL,RINGO " + ct));
    expect(lastText()).toBe("BEATLESX");
  });
  it("twosquare roundtrip", async () => {
    await squares({}, msg("ts twosquare encode keys=KEY,WORD DCODE"));
    const ct = lastText();
    await squares({}, msg("ts twosquare decode keys=KEY,WORD " + ct));
    expect(lastText()).toBe("DCODEX");
  });
});

describe("transpose", () => {
  it("columnar dcode vector", async () => {
    await transpose({}, msg("ts columnar encode k=COL pad COLUMNS"));
    expect(lastText()).toBe("CUSLNXOMX");
    await transpose({}, msg("ts columnar decode k=COL pad CUSLNXOMX"));
    expect(lastText()).toBe("COLUMNSXX");
  });
  it("columnar ragged roundtrip", async () => {
    await transpose({}, msg("ts columnar encode k=CODE HELLOWORLD"));
    const ct = lastText();
    await transpose({}, msg("ts columnar decode k=CODE " + ct));
    expect(lastText()).toBe("HELLOWORLD");
  });
  it("scytale vector", async () => {
    await transpose({}, msg("ts scytale encode n=3 DCODE"));
    expect(lastText()).toBe("DDCEO_");
    await transpose({}, msg("ts scytale decode n=3 DDCEO_"));
    expect(lastText()).toBe("DCODE");
  });
  it("route vector", async () => {
    await transpose({}, msg("ts route encode w=4 pad=. DCODEROUTE"));
    expect(lastText()).toBe("DETERCOO..UD");
    await transpose({}, msg("ts route decode w=4 pad=. DETERCOO..UD"));
    expect(lastText()).toBe("DCODEROUTE");
  });
  it("adfgvx vectors", async () => {
    await transpose({}, msg("ts adfgvx encode BERLIN"));
    expect(lastText()).toBe("ADAVFXDXDFFD");
    await transpose({}, msg("ts adfgvx encode k=CODE BERLIN"));
    expect(lastText()).toBe("AFDADFVXDDXF");
    await transpose({}, msg("ts adfgvx decode k=CODE AFDADFVXDDXF"));
    expect(lastText()).toBe("BERLIN");
  });
  it("adfgx vectors", async () => {
    await transpose({}, msg("ts adfgx encode BERLIN"));
    expect(lastText()).toBe("ADAXGDFADGFF");
    await transpose({}, msg("ts adfgx encode k=CODE BERLIN"));
    expect(lastText()).toBe("AGDAFFXAFDDG");
    await transpose({}, msg("ts adfgx decode k=CODE AGDAFFXAFDDG"));
    expect(lastText()).toBe("BERLIN");
  });
  it("gronsfeld vectors", async () => {
    await transpose({}, msg("ts gronsfeld encode k=1234 GRONSFELD"));
    expect(lastText()).toBe("HTRRTHHPE");
    await transpose({}, msg("ts gronsfeld decode k=123 EEREG"));
    expect(lastText()).toBe("DCODE");
  });
  it("autokey vector", async () => {
    await transpose({}, msg("ts autokey encode k=SECRET AUTOCLAVE"));
    expect(lastText()).toBe("SYVFGEAPX");
    await transpose({}, msg("ts autokey decode k=SECRET SYVFGEAPX"));
    expect(lastText()).toBe("AUTOCLAVE");
  });
  it("beaufort vectors", async () => {
    await transpose({}, msg("ts beaufort encode k=KEY DCODE"));
    expect(lastText()).toBe("HCKHA");
    await transpose({}, msg("ts beaufort decode k=KEY HCKHA"));
    expect(lastText()).toBe("DCODE");
    await transpose({}, msg("ts beaufort encode k=KEY german DCODE"));
    expect(lastText()).toBe("TYQTA");
    await transpose({}, msg("ts beaufort decode k=KEY german TYQTA"));
    expect(lastText()).toBe("DCODE");
  });
  it("porta vector", async () => {
    await transpose({}, msg("ts porta encode k=PORTA DCODE"));
    expect(lastText()).toBe("WVBUR");
    await transpose({}, msg("ts porta decode k=PORTA WVBUR"));
    expect(lastText()).toBe("DCODE");
  });
});

describe("bases", () => {
  it("base58 vector", async () => {
    await bases({}, msg("ts b58 encode Hello World!"));
    expect(lastText()).toBe("2NEpo7TZRRrLZSi2U");
    await bases({}, msg("ts b58 decode 2NEpo7TZRRrLZSi2U"));
    expect(lastText()).toBe("Hello World!");
  });
  it("base62 vector", async () => {
    await bases({}, msg("ts b62 encode dCode"));
    expect(lastText()).toBe("7a35dQr");
    await bases({}, msg("ts b62 decode R0Ow"));
    expect(lastText()).toBe("b62");
  });
  it("ascii85 vectors", async () => {
    await bases({}, msg('ts a85 encode Hello World!'));
    expect(lastText()).toBe('87cURD]i,"Ebo80');
    await bases({}, msg("ts a85 decode 9jqo^"));
    expect(lastText()).toBe("Man ");
    await bases({}, msg("ts a85 decode 87cURD]i,\"Ebo80"));
    expect(lastText()).toBe("Hello World!");
  });
  it("base91 vectors", async () => {
    await bases({}, msg("ts b91 encode test"));
    expect(lastText()).toBe("fPNKd");
    await bases({}, msg("ts b91 encode dCode"));
    expect(lastText()).toBe("xJ,Jc,A");
    await bases({}, msg("ts b91 decode >OwJh>Io0Tv!8PE"));
    expect(lastText()).toBe("Hello World!");
  });
  it("base100 roundtrip", async () => {
    await bases({}, msg("ts b100 encode A"));
    expect(lastText()).toBe("🐸");
    await bases({}, msg("ts b100 decode 🐸"));
    expect(lastText()).toBe("A");
  });
  it("uu vector", async () => {
    await bases({}, msg("ts uu encode Cat"));
    expect(lastText()).toBe("#0V%T");
    await bases({}, msg("ts uu decode #0V%T"));
    expect(lastText()).toBe("Cat");
  });
  it("xx vector", async () => {
    await bases({}, msg("ts xx encode Cat"));
    expect(lastText()).toBe("1Eq3o");
    await bases({}, msg("ts xx decode 1Eq3o"));
    expect(lastText()).toBe("Cat");
  });
  it("qp vectors", async () => {
    await bases({}, msg("ts qp encode ="));
    expect(lastText()).toBe("=3D");
    await bases({}, msg("ts qp decode =C3=A9"));
    expect(lastText()).toBe("é");
  });
});

describe("grids", () => {
  it("polybius vector", async () => {
    await grids({}, msg("ts polybius encode DCODE"));
    expect(lastText()).toBe("14 13 34 14 15");
    await grids({}, msg("ts polybius decode k=DCODE 351332542114"));
    expect(lastText()).toBe("POLYBE");
  });
  it("polybius column-first coordinates", async () => {
    await grids({}, msg("ts polybius encode colrow DCODE"));
    expect(lastText()).toBe("41 31 43 41 51");
    await grids({}, msg("ts polybius decode colrow 41 31 43 41 51"));
    expect(lastText()).toBe("DCODE");
  });
  it("pigpen roundtrip", async () => {
    await grids({}, msg("ts pigpen encode DCODE"));
    expect(lastText()).toBe("├└┤·├□");
    await grids({}, msg("ts pigpen decode ├└┤·├□"));
    expect(lastText()).toBe("DCODE");
  });
  it("keyboard shift", async () => {
    await grids({}, msg("ts kb right DCODE"));
    expect(lastText()).toBe("FVPFR");
    await grids({}, msg("ts kb left FVPFR"));
    expect(lastText()).toBe("DCODE");
  });
  it("rc4 vectors", async () => {
    await grids({}, msg("ts rc4 encode k=Key Plaintext"));
    expect(lastText()).toBe("BBF316E8D940AF0AD3");
    await grids({}, msg("ts rc4 decode k=Key BBF316E8D940AF0AD3"));
    expect(lastText()).toBe("Plaintext");
    await grids({}, msg("ts rc4 decode k=RC4 2B7FDAB61D"));
    expect(lastText()).toBe("dCode");
  });
  it("hill vector", async () => {
    await grids({}, msg("ts hill encode k=3,3,2,5 HELP"));
    expect(lastText()).toBe("HIAT");
    await grids({}, msg("ts hill decode k=3,3,2,5 HIAT"));
    expect(lastText()).toBe("HELP");
    await grids({}, msg("ts hill encode k=2,4,6,8 HELP"));
    expect(lastText()).toContain("not invertible");
  });
  it("deadfish vectors", async () => {
    await grids({}, msg("ts deadfish run iiiso"));
    expect(lastText()).toBe("9");
    await grids({}, msg("ts deadfish run iissso"));
    expect(lastText()).toBe("0");
    await grids({}, msg("ts deadfish run diissisdo"));
    expect(lastText()).toBe("288");
    await grids({}, msg("ts deadfish encode Hi"));
    const prog = lastText();
    await grids({}, msg("ts deadfish run " + prog));
    expect(lastText()).toBe("72 105");
  });
  it("cow hello", async () => {
    await grids({}, msg("ts cow run " + "MoO ".repeat(72) + "Moo"));
    expect(lastText()).toBe("H");
  });
  it("whitespace roundtrip", async () => {
    await grids({}, msg("ts ws encode H"));
    expect(lastText()).toBe("SSSTSSTSSSLTLSSLLL");
    await grids({}, msg("ts ws decode SSSTSSTSSSLTLSSLLL"));
    expect(lastText()).toBe("H");
  });
  it("decodes an actual Whitespace program", async () => {
    const source = "SSSTSSTSSSLTLSSLLL".replace(/S/g, " ").replace(/T/g, "\t").replace(/L/g, "\n");
    await grids({}, msg("ts ws decode " + source));
    expect(lastText()).toBe("H");
  });
});

describe("integration", () => {
  it("help lists new families", async () => {
    const before = sent.length;
    await codecs({}, msg("ts help"));
    const embed = sent.slice(before).find((x) => typeof x === "object" && x.embeds);
    expect(JSON.stringify(embed)).toContain("Squares");
  });
  it("what spots adfgvx", async () => {
    await codecs({}, msg("ts what AFDADFVXDDXF"));
    expect(lastText()).toContain("ADFGVX");
  });
});
