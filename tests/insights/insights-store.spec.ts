import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { InsightsStore } from "../../src/insights/insights-store.js";

describe("InsightsStore", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it("summarizes passive command observations without storing command arguments", async () => {
    const store = await createStore();

    store.recordCommand({
      repositoryId: "a".repeat(64),
      command: "status",
      outcome: "ok",
      exitCode: 0,
      warningCodes: [],
      durationMs: 12,
      snapshotId: null,
    });
    store.recordCommand({
      repositoryId: "a".repeat(64),
      command: "map.search",
      outcome: "partial",
      exitCode: 0,
      warningCodes: ["BUSINESS_KNOWLEDGE_EMPTY"],
      durationMs: 8,
      snapshotId: "b".repeat(64),
    });

    expect(store.summary({ from: "1970-01-01T00:00:00.000Z", to: "2999-01-01T00:00:00.000Z" }))
      .toEqual({
        commands: {
          total: 2,
          outcomes: { ok: 1, partial: 1, error: 0 },
          byCommand: [
            { command: "map.search", count: 1 },
            { command: "status", count: 1 },
          ],
          warningCodes: [{ code: "BUSINESS_KNOWLEDGE_EMPTY", count: 1 }],
        },
        feedback: { total: 0, byCategory: [] },
      });
  });

  it("stores explicit feedback with nearby command evidence and supports triage", async () => {
    const store = await createStore();
    const repositoryId = "c".repeat(64);
    const event = store.recordCommand({
      repositoryId,
      command: "map.show",
      outcome: "ok",
      exitCode: 0,
      warningCodes: [],
      durationMs: 10,
      snapshotId: "d".repeat(64),
    });

    const report = store.recordFeedback({
      repositoryId,
      snapshotId: "d".repeat(64),
      kind: "problem",
      category: "misleading-result",
      impact: "slowed",
      observed: "The cited operation was unrelated after source confirmation.",
      expected: "The result should have identified only relevant evidence.",
      sourceConfirmed: true,
    });

    expect(report.contextEventIds).toEqual([event.id]);
    expect(store.listFeedback({ from: "1970-01-01T00:00:00.000Z", to: "2999-01-01T00:00:00.000Z" }))
      .toEqual([expect.objectContaining({ id: report.id, status: "new" })]);

    expect(store.updateFeedback({ id: report.id, status: "triaged", note: "Reproduce in a fixture." }))
      .toEqual(expect.objectContaining({ id: report.id, status: "triaged", note: "Reproduce in a fixture." }));
  });

  async function createStore(): Promise<InsightsStore> {
    const directory = await mkdtemp(join(tmpdir(), "semantic-atlas-insights-"));
    temporaryDirectories.push(directory);
    return new InsightsStore(join(directory, "insights.db"));
  }
});
