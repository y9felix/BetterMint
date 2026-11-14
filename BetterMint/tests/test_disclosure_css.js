const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "../css/options.css"), "utf8");

assert.ok(css.includes("details.collapse-group"), "Missing details.collapse-group styling");
assert.ok(css.includes("details.collapse-group > summary.collapse-summary"), "Missing custom summary styling");
assert.ok(css.includes("details.collapse-group > summary.collapse-summary::-webkit-details-marker"), "Missing webkit marker reset");
assert.ok(css.includes("details.collapse-group[open] > summary.collapse-summary::after"), "Missing open state chevron styling");
assert.ok(css.includes(".collapse-content"), "Missing .collapse-content container styling");

const openRuleMatch = css.match(/details\.collapse-group\[open\]\s*>\s*summary\.collapse-summary::after\s*\{([^}]+)\}/);
assert.ok(openRuleMatch, "Open chevron rule not found");
assert.ok(openRuleMatch[1].includes("transform"), "Open chevron rule must specify transform");

console.log("Disclosure CSS tests passed.");
