import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ReviewObservationInput,
  TaskObservationInput,
} from "../../src/contracts/observation.js";
import { InsightService } from "../../src/insights/insight-service.js";
import { ObservationApplication } from "../../src/observations/observation-application.js";
import { ObservationStore } from "../../src/observations/observation-store.js";
import { RepositoryIdentityResolver } from "../../src/observations/repository-identity.js";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("InsightService", () => {
  it("derives independent accuracy, rework, correction, regression, and recovery counts", async () => {
    const fixture = await createFixture();
    await fixture.application.recordTask(
      fixture.repositoryRoot,
      taskObservation("stale-task", "2026-08-26T10:00:00.000Z", ["stale"]),
    );
    await fixture.application.recordReview(
      fixture.repositoryRoot,
      reviewObservation("stale-review", "stale-task", "approved"),
    );
    await fixture.application.recordTask(
      fixture.repositoryRoot,
      taskObservation("failed-task", "2026-08-26T11:00:00.000Z", [
        "missing",
        "contradicted",
      ], true),
    );
    await fixture.application.recordReview(
      fixture.repositoryRoot,
      reviewObservation("failed-review", "failed-task", "changes_requested"),
    );

    const result = await fixture.insights.summarize(
      fixture.repositoryRoot,
      undefined,
      new Date("2026-08-27T12:00:00.000Z"),
    );

    expect(result.summary).toEqual({
      taskObservations: 2,
      reviewObservations: 2,
      approvedReviews: 1,
      businessBoundary: { correct: 1, incorrect: 1, notAssessed: 0 },
      upstreamCause: { correct: 1, incorrect: 1, notApplicable: 0, notAssessed: 0 },
      impactCompleteness: { complete: 1, incomplete: 1, notAssessed: 0 },
      requiredRework: 1,
      mapCausedRegressions: 1,
      humanCorrections: 1,
      recoveries: { stale: 1, missing: 0, contradicted: 0 },
    });
  });

  it("filters observations by a bounded duration while retaining referenced task evidence", async () => {
    const fixture = await createFixture();
    await fixture.application.recordTask(
      fixture.repositoryRoot,
      taskObservation("older-task", "2026-08-20T10:00:00.000Z", ["missing"]),
    );
    await fixture.application.recordReview(
      fixture.repositoryRoot,
      reviewObservation(
        "recent-review",
        "older-task",
        "approved",
        "2026-08-27T10:00:00.000Z",
      ),
    );

    const result = await fixture.insights.summarize(
      fixture.repositoryRoot,
      "24h",
      new Date("2026-08-27T12:00:00.000Z"),
    );

    expect(result.period).toEqual({
      duration: "24h",
      since: "2026-08-26T12:00:00.000Z",
    });
    expect(result.summary.taskObservations).toBe(0);
    expect(result.summary.reviewObservations).toBe(1);
    expect(result.summary.recoveries.missing).toBe(1);
  });
});

async function createFixture(): Promise<{
  readonly repositoryRoot: string;
  readonly application: ObservationApplication;
  readonly insights: InsightService;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-insights-"));
  sandboxes.push(sandbox);
  const repositoryRoot = path.join(sandbox, "repository");
  await mkdir(path.join(repositoryRoot, ".git"), { recursive: true });
  const resolver = new RepositoryIdentityResolver();
  const store = new ObservationStore({ userHome: path.join(sandbox, "home") });
  return {
    repositoryRoot,
    application: new ObservationApplication(resolver, store),
    insights: new InsightService(resolver, store),
  };
}

function taskObservation(
  id: string,
  recordedAt: string,
  dispositions: readonly ("missing" | "stale" | "contradicted")[],
  corrected = false,
): TaskObservationInput {
  return {
    schemaVersion: 1,
    id,
    recordedAt,
    task: { taskId: `${id}-task`, runId: `${id}-run` },
    map: {
      queries: [{ selector: "Orders", outcome: "map_not_found" }],
      dispositions: dispositions.map((status) => ({
        status,
        summary: `${status} map evidence was resolved from current source.`,
        evidence: [{ kind: "source", reference: "src/orders.ts" }],
      })),
    },
    mapUpdateCandidates: [],
    ...(corrected
      ? {
          humanCorrection: {
            summary: "A person corrected the business boundary.",
            dimensions: ["business_boundary" as const],
          },
        }
      : {}),
  };
}

function reviewObservation(
  id: string,
  taskObservationId: string,
  verdict: "approved" | "changes_requested",
  recordedAt = "2026-08-27T09:00:00.000Z",
): ReviewObservationInput {
  return {
    schemaVersion: 1,
    id,
    recordedAt,
    taskObservationId,
    review: verdict === "approved"
      ? {
          taskId: `${id}-task`,
          runId: `${id}-run`,
          verdict,
          businessBoundary: "correct",
          upstreamCause: "correct",
          impactCompleteness: "complete",
          requiredRework: false,
          mapCausedRegression: false,
        }
      : {
          taskId: `${id}-task`,
          runId: `${id}-run`,
          verdict,
          businessBoundary: "incorrect",
          upstreamCause: "incorrect",
          impactCompleteness: "incomplete",
          requiredRework: true,
          mapCausedRegression: true,
        },
  };
}
