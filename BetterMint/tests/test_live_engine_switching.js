const assert = require("assert");
const fs = require("fs");

const content = fs.readFileSync("BetterMint/js/Mint.js", "utf8");
assert.ok(content.includes("switchEngine"), "StockfishEngine must implement switchEngine");
assert.ok(content.includes("this.currentUrl"), "StockfishEngine must track currentUrl");
assert.ok(content.includes("this.engineUciOptions"), "StockfishEngine must track engineUciOptions");
assert.ok(!content.includes("setoption name option-depth"), "Must not emit extension settings keys as UCI options");

console.log("Live switching static checks passed.");
