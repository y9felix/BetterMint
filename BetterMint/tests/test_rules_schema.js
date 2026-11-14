const assert = require("assert");
const fs = require("fs");
const path = require("path");

const extRoot = path.join(__dirname, "..");
const rulesPath = path.join(extRoot, "rules.json");
const manifestPath = path.join(extRoot, "manifest.json");

assert.ok(fs.existsSync(rulesPath), "rules.json must exist");
assert.ok(fs.existsSync(manifestPath), "manifest.json must exist");

const rules = JSON.parse(fs.readFileSync(rulesPath, "utf8"));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

assert.ok(Array.isArray(rules) && rules.length === 3, "rules.json must contain 3 rules");

const ruleResource = manifest.declarative_net_request?.rule_resources?.find((r) => r.path === "rules.json");
assert.ok(ruleResource && ruleResource.enabled === true, "rules.json must be registered and enabled in manifest");

const ids = new Set();
for (const rule of rules) {
  assert.strictEqual(typeof rule.id, "number");
  assert.ok(!ids.has(rule.id), "Rule IDs must be unique");
  ids.add(rule.id);
  assert.strictEqual(typeof rule.priority, "number");
  assert.strictEqual(rule.action?.type, "block");
  assert.strictEqual(typeof rule.condition?.urlFilter, "string");
  assert.ok(Array.isArray(rule.condition?.resourceTypes) && rule.condition.resourceTypes.length > 0);
}

function matchesUrlFilter(url, filter) {
  let pattern = filter;
  let startAnchor = false;
  if (pattern.startsWith("|")) {
    startAnchor = true;
    pattern = pattern.slice(1);
  }
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const regex = new RegExp((startAnchor ? "^" : "") + escaped);
  return regex.test(url);
}

function testMatch(url, resourceType) {
  return rules.filter((r) => {
    if (!r.condition.resourceTypes.includes(resourceType)) return false;
    return matchesUrlFilter(url, r.condition.urlFilter);
  }).map((r) => r.id);
}

assert.deepStrictEqual(
  testMatch("https://www.chess.com/service/fair-play/chesscom.fair_play.v2.FairPlayService/", "xmlhttprequest"),
  [1]
);
assert.deepStrictEqual(
  testMatch("https://www.chess.com/service/fair-play/chesscom.fair_play.v3.FairPlayService/Telemetry", "xmlhttprequest"),
  [1]
);
assert.deepStrictEqual(
  testMatch("https://www.chess.com/chesscom-artifacts/packages/@chesscom/play-client/124.5.1/play-monitor-browser-extensions.chunk.client.9f8e.js", "script"),
  [2, 3]
);
assert.deepStrictEqual(
  testMatch("https://www.chess.com/assets/play-monitor.js", "script"),
  [3]
);
assert.deepStrictEqual(
  testMatch("https://www.chess.com/play/online", "main_frame"),
  []
);
assert.deepStrictEqual(
  testMatch("https://external-domain.com/service/fair-play/data", "xmlhttprequest"),
  []
);

console.log("Rules schema and matching tests passed.");
