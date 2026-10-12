const MORSE = {
  a: ".-", b: "-...", c: "-.-.", d: "-..", e: ".", f: "..-.", g: "--.", h: "....",
  i: "..", j: ".---", k: "-.-", l: ".-..", m: "--", n: "-.", o: "---", p: ".--.",
  q: "--.-", r: ".-.", s: "...", t: "-", u: "..-", v: "...-", w: ".--", x: "-..-",
  y: "-.--", z: "--..", 0: "-----", 1: ".----", 2: "..---", 3: "...--", 4: "....-",
  5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", ".": ".-.-.-",
  ",": "--..--", "?": "..--..", "/": "-..-.", "=": "-...-",
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));

function morseEncode(s) {
  return s.toLowerCase().split("").map((c) => (c === " " ? "/" : MORSE[c] || "?")).join(" ");
}

function morseDecode(s) {
  return s.trim().split(/\s+/).map((w) => (w === "/" ? " " : MORSE_REV[w] || "?")).join("").replace(/ {2,}/g, " ");
}

module.exports = { morseEncode, morseDecode };
