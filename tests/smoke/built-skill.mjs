import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const fixtureRepository = path.resolve("tests/fixtures/agent-skill/repository");
const contextResult = query("Order confirmation");
assert.equal(contextResult.status, 0, contextResult.stderr || contextResult.stdout);
const contextEnvelope = JSON.parse(contextResult.stdout);
assert.equal(contextEnvelope.schemaVersion, 1);
assert.equal(contextEnvelope.ok, true);
assert.equal(contextEnvelope.command, "context");
assert.equal(
  contextEnvelope.data.selected.id,
  "engagement.notifications.send-order-confirmation",
);

const missingResult = query("Refund eligibility");
assert.equal(missingResult.status, 1, missingResult.stderr || missingResult.stdout);
const missingEnvelope = JSON.parse(missingResult.stdout);
assert.equal(missingEnvelope.schemaVersion, 1);
assert.equal(missingEnvelope.ok, false);
assert.equal(missingEnvelope.command, "context");
assert.equal(missingEnvelope.error.code, "CONCEPT_NOT_FOUND");

function query(selector) {
  return spawnSync(
    process.execPath,
    [
      ".agents/skills/semantic-atlas/scripts/query-context.mjs",
      selector,
      "--repo",
      fixtureRepository,
    ],
    { encoding: "utf8" },
  );
}
