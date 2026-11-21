const ALPHABETS = {
  24: "ABCDEFGHIKLMNOPQRSTUWXYZ",
  26: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
};

const MERGE24 = { J: "I", V: "U" };

function variantOf(opts) {
  return opts && Number(opts.variant) === 26 ? 26 : 24;
}

function groupFor(index) {
  return index.toString(2).padStart(5, "0").replace(/0/g, "a").replace(/1/g, "b");
}

function baconEncode(text, opts) {
  const variant = variantOf(opts);
  const alpha = ALPHABETS[variant];
  const words = [];
  for (const word of String(text).trim().split(/\s+/)) {
    if (!word) continue;
    const groups = [];
    for (const raw of word.toUpperCase()) {
      const c = variant === 24 && MERGE24[raw] ? MERGE24[raw] : raw;
      const idx = alpha.indexOf(c);
      if (idx < 0) return null;
      groups.push(groupFor(idx));
    }
    words.push(groups.join(" "));
  }
  return words.join(" / ");
}

function baconDecode(text, opts) {
  const variant = variantOf(opts);
  const alpha = ALPHABETS[variant];
  const out = [];
  let sawGroup = false;
  for (const chunk of String(text).split("/")) {
    const bits = chunk.toLowerCase().replace(/[^ab01]/g, "").replace(/0/g, "a").replace(/1/g, "b");
    if (!bits) continue;
    if (bits.length % 5 !== 0) return null;
    let word = "";
    for (let i = 0; i < bits.length; i += 5) {
      const v = parseInt(bits.slice(i, i + 5).replace(/a/g, "0").replace(/b/g, "1"), 2);
      word += v < alpha.length ? alpha[v].toLowerCase() : "?";
    }
    out.push(word);
    sawGroup = true;
  }
  return sawGroup ? out.join(" ") : null;
}

module.exports = { baconEncode, baconDecode, BACON_ALPHABETS: ALPHABETS };
