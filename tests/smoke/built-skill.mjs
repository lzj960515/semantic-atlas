import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";

const fixtureRepository = path.resolve("tests/fixtures/agent-skill/repository");
const builtCli = path.resolve("dist/cli/bin.js");
const searchResult = runCli("search", "Order confirmation");
assert.equal(searchResult.status, 0, searchResult.stderr || searchResult.stdout);
const searchEnvelope = JSON.parse(searchResult.stdout);
assert.equal(searchEnvelope.schemaVersion, 1);
assert.equal(searchEnvelope.ok, true);
assert.equal(searchEnvelope.command, "search");
assert.equal(searchEnvelope.data.results[0].id, "engagement.notifications.send-order-confirmation");
assert.equal(searchEnvelope.data.results[0].rank, 1);
assert.equal(typeof searchEnvelope.data.results[0].score, "number");

const contextResult = query(searchEnvelope.data.results[0].id);
assert.equal(contextResult.status, 0, contextResult.stderr || contextResult.stdout);
const contextEnvelope = JSON.parse(contextResult.stdout);
assert.equal(contextEnvelope.schemaVersion, 1);
assert.equal(contextEnvelope.ok, true);
assert.equal(contextEnvelope.command, "context");
assert.equal(contextEnvelope.data.selected.id, "engagement.notifications.send-order-confirmation");

const missingResult = query("Refund eligibility");
assert.equal(missingResult.status, 1, missingResult.stderr || missingResult.stdout);
const missingEnvelope = JSON.parse(missingResult.stdout);
assert.equal(missingEnvelope.schemaVersion, 1);
assert.equal(missingEnvelope.ok, false);
assert.equal(missingEnvelope.command, "context");
assert.equal(missingEnvelope.error.code, "CONCEPT_NOT_FOUND");

function query(selector) {
  return runCli("context", selector);
}

function runCli(command, selector) {
  return spawnSync(process.execPath, [builtCli, command, selector, "--repo", fixtureRepository], {
    encoding: "utf8",
  });
}
