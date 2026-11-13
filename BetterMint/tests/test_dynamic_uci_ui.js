const assert = require("assert");
const fs = require("fs");

const html = fs.readFileSync("BetterMint/html/options.html", "utf8");
assert.ok(html.includes('id="engine-options-details"'), "Missing engine-options-details details element");
assert.ok(html.includes('id="advanced-timing-details"'), "Missing advanced-timing-details details element");
assert.ok(!html.includes('id="option-advanced-timing"'), "Former toggle switch must be replaced by details summary");

const js = fs.readFileSync("BetterMint/js/options.js", "utf8");
assert.ok(js.includes("parseUciOptionLine"), "Missing parseUciOptionLine helper");
assert.ok(js.includes("renderDynamicUciOptions"), "Missing renderDynamicUciOptions helper");
console.log("Dynamic UCI UI tests passed.");
