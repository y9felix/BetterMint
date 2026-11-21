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
assert.ok(css.includes("interpolate-size: allow-keywords"), "Root must enable keyword size interpolation for details animations");
assert.ok(css.includes("details.collapse-group::details-content"), "Missing details-content expand/collapse animation rule");
assert.ok(css.includes("grid-template-rows: 0fr"), "Sub-panels must use grid-template-rows animation for smooth expand/collapse");

const subPanelInnerMatch = css.match(/\.sub-panel-inner\s*\{([^}]+)\}/);
assert.ok(subPanelInnerMatch, "Missing .sub-panel-inner rule");
assert.ok(
  subPanelInnerMatch[1].includes("margin: -6px") && subPanelInnerMatch[1].includes("padding: 6px"),
  ".sub-panel-inner must bleed 6px on all sides so focus outlines are not clipped"
);

const collapseContentMatch = css.match(/\.collapse-content\s*\{([^}]+)\}/);
assert.ok(collapseContentMatch, "Missing .collapse-content rule");
assert.ok(
  collapseContentMatch[1].includes("padding: 10px 0 6px"),
  ".collapse-content must reserve bottom padding so focus outlines on the last control are not clipped"
);

console.log("Disclosure CSS tests passed.");
