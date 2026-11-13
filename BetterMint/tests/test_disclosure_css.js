const assert = require("assert");
const fs = require("fs");

const css = fs.readFileSync("BetterMint/css/options.css", "utf8");
assert.ok(css.includes(".collapse-group"), "Missing .collapse-group selector");
assert.ok(css.includes(".collapse-summary"), "Missing .collapse-summary selector");
assert.ok(css.includes("transform: rotate"), "Missing chevron rotation rule");
console.log("Disclosure CSS tests passed.");
