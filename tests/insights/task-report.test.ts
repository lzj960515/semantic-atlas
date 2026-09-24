import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { reviewAssessmentSchema } from "../../src/contracts/observation.js";
import { InsightService } from "../../src/insights/insight-service.js";
import { ObservationApplication } from "../../src/observations/observation-application.js";
import { ObservationStore } from "../../src/observations/observation-store.js";
import { RepositoryIdentityResolver } from "../../src/observations/repository-identity.js";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(
    sandboxes.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("real-use task report", () => {
  it("accepts both review versions through the public assessment schema", () => {
    const legacy = review("legacy-review", "task", "approved", "2026-09-01T11:00:00.000Z");
    const current = review("current-review", "task", "approved", "2026-09-01T11:00:00.000Z", true);

    expect(reviewAssessmentSchema.safeParse(legacy.review).success).toBe(true);
    expect(reviewAssessmentSchema.safeParse(current.review).success).toBe(true);
  });

  it("keeps map use and review outcomes attached to the same run across task retries", async () => {
    const fixture = await createFixture();
    await fixture.application.recordTask(
      fixture.repositoryRoot,
      task("first", "map_not_found", "2026-09-01T10:00:00.000Z"),
    );
    await fixture.application.recordReview(
      fixture.repositoryRoot,
      review("first-review", "first", "changes_requested", "2026-09-01T11:00:00.000Z"),
    );
    await fixture.application.recordTask(
      fixture.repositoryRoot,
      task("second", "context", "2026-09-02T10:00:00.000Z"),
    );
    await fixture.application.recordReview(
      fixture.repositoryRoot,
      review("second-review", "second", "approved", "2026-09-02T11:00:00.000Z", true),
    );

    const report = await fixture.insights.reportTasks(
      fixture.repositoryRoot,
      "1w",
      new Date("2026-09-03T12:00:00.000Z"),
    );

    expect(report.summary).toEqual({
      tasks: 1,
      tasksWithContext: 1,
      tasksWithReviewedContext: 1,
      tasksWithAssessedContext: 1,
      tasksWithReview: 1,
      tasksWithRework: 1,
      tasksWithConfirmedLead: 1,
      tasksWithMapRegression: 0,
      tasksWithHumanCorrection: 0,
    });
    expect(report.tasks).toEqual([
      {
        taskId: "engineering-task",
        runs: [
          {
            observationId: "first",
            runId: "first",
            recordedAt: "2026-09-01T10:00:00.000Z",
            queries: [{ selector: "Orders", outcome: "map_not_found" }],
            dispositions: [],
            humanCorrections: [],
            reviews: [
              {
                observationId: "first-review",
                recordedAt: "2026-09-01T11:00:00.000Z",
                verdict: "changes_requested",
                requiredRework: true,
                mapCausedRegression: false,
              },
            ],
          },
          {
            observationId: "second",
            runId: "second",
            recordedAt: "2026-09-02T10:00:00.000Z",
            queries: [
              { selector: "Orders", outcome: "context", selectedConceptIds: ["commerce.orders"] },
            ],
            dispositions: [],
            humanCorrections: [],
            reviews: [
              {
                observationId: "second-review",
                recordedAt: "2026-09-02T11:00:00.000Z",
                verdict: "approved",
                requiredRework: false,
                mapCausedRegression: false,
                mapContribution: {
                  status: "confirmed_lead",
                  summary:
                    "The map led to the order owner before source search; source confirmed the owner.",
                  evidence: [{ kind: "source", reference: "src/orders.ts" }],
                },
              },
            ],
          },
        ],
      },
    ]);
  });

  it("reads legacy reviews and leaves map contribution unassessed", async () => {
    const fixture = await createFixture();
    await fixture.application.recordTask(fixture.repositoryRoot, {
      ...task("legacy", "context", "2026-09-01T10:00:00.000Z"),
      humanCorrection: {
        summary: "The user clarified the task scope.",
        dimensions: ["business_boundary"],
      },
    });
    await fixture.application.recordReview(
      fixture.repositoryRoot,
      review("legacy-review", "legacy", "approved", "2026-09-01T11:00:00.000Z"),
    );

    const report = await fixture.insights.reportTasks(fixture.repositoryRoot);

    expect(report.summary.tasksWithConfirmedLead).toBe(0);
    expect(report.summary.tasksWithAssessedContext).toBe(0);
    expect(report.summary.tasksWithHumanCorrection).toBe(1);
    expect(report.tasks[0]?.runs[0]?.humanCorrections).toEqual([
      {
        observationId: "legacy",
        summary: "The user clarified the task scope.",
        dimensions: ["business_boundary"],
      },
    ]);
    expect(report.tasks[0]?.runs[0]?.reviews[0]).not.toHaveProperty("mapContribution");
  });

  it("rejects a confirmed map lead when the linked run did not obtain context", async () => {
    const fixture = await createFixture();
    await fixture.application.recordTask(
      fixture.repositoryRoot,
      task("mapless", "map_not_found", "2026-09-01T10:00:00.000Z"),
    );

    await expect(
      fixture.application.recordReview(
        fixture.repositoryRoot,
        review("invalid-lead", "mapless", "approved", "2026-09-01T11:00:00.000Z", true),
      ),
    ).rejects.toMatchObject({ name: "ObservationInputError" });
  });
});

async function createFixture() {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-task-report-"));
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

function task(id: string, outcome: "context" | "map_not_found", recordedAt: string) {
  return {
    schemaVersion: 2,
    id,
    recordedAt,
    task: { taskId: "engineering-task", runId: id },
    map: {
      queries: [
        outcome === "context"
          ? { selector: "Orders", outcome, selectedConceptIds: ["commerce.orders"] }
          : { selector: "Orders", outcome },
      ],
      dispositions: [],
    },
    mapUpdateCandidates: [],
  };
}

function review(
  id: string,
  taskObservationId: string,
  verdict: "approved" | "changes_requested",
  recordedAt: string,
  withContribution = false,
) {
  const assessment = {
    taskId: "review-task",
    runId: id,
    verdict,
    businessBoundary: verdict === "approved" ? "correct" : "incorrect",
    upstreamCause: "not_assessed",
    impactCompleteness: verdict === "approved" ? "complete" : "incomplete",
    requiredRework: verdict === "changes_requested",
    mapCausedRegression: false,
    ...(withContribution
      ? {
          mapContribution: {
            status: "confirmed_lead",
            summary:
              "The map led to the order owner before source search; source confirmed the owner.",
            evidence: [{ kind: "source", reference: "src/orders.ts" }],
          },
        }
      : {}),
  };
  return {
    schemaVersion: withContribution ? 2 : 1,
    id,
    recordedAt,
    taskObservationId,
    review: assessment,
  };
}
