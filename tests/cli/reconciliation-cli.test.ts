import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ReviewObservationInput,
  TaskObservationInput,
} from "../../src/contracts/observation.js";
import { createCliRuntime, runCli } from "../../src/cli/run-cli.js";
import { RepositoryIdentityResolver } from "../../src/observations/repository-identity.js";

const sandboxes: string[] = [];
const fixtureRoot = fileURLToPath(new URL("../fixtures", import.meta.url));

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("semantic-atlas reconcile candidates", () => {
  it("returns a versioned deterministic read-only candidate report", async () => {
    const fixture = await createFixture();
    await fixture.runtime.observationApplication.recordTask(
      fixture.repositoryRoot,
      taskObservation(),
    );

    const first = await runCli([
      "reconcile",
      "candidates",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    const second = await runCli([
      "reconcile",
      "candidates",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);

    expect(first).toEqual(second);
    expect(first.exitCode).toBe(0);
    expect(JSON.parse(first.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: true,
      command: "reconcile candidates",
      data: {
        summary: {
          businessDomains: 1,
          candidateGroups: 1,
          candidateOccurrences: 1,
          duplicateGroups: 0,
        },
        domains: [{
          businessDomainId: "commerce",
          candidates: [{
            kind: "node",
            duplicate: false,
            origins: [{
              taskObservationId: "task-observation-reconcile-cli",
              disposition: "confirmed",
            }],
          }],
        }],
      },
    });
  });

  it("returns a repository error instead of an empty successful report", async () => {
    const fixture = await createFixture();
    const missingRepository = path.join(fixture.repositoryRoot, "missing");

    const result = await runCli([
      "reconcile",
      "candidates",
      "--repo",
      missingRepository,
    ], fixture.runtime);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: 1,
      ok: false,
      command: "reconcile candidates",
      error: { code: "REPOSITORY_INVALID" },
    });
  });

  it("reads immutable v1 evidence without promoting its unowned candidate", async () => {
    const fixture = await createFixture();
    const repository = (await new RepositoryIdentityResolver().resolve(
      fixture.repositoryRoot,
    )).identity;
    const legacyFixture = JSON.parse(await readFile(
      path.join(fixtureRoot, "observations/task-observation-v1.json"),
      "utf8",
    )) as Record<string, unknown>;
    const legacyObservation = {
      ...legacyFixture,
      repository,
    };
    const taskDirectory = path.join(
      fixture.userHome,
      ".semantic-atlas/observations/v1/repositories",
      repository.id,
      "tasks",
    );
    const observationPath = path.join(taskDirectory, "legacy-v1.json");
    const storedDocument = `${JSON.stringify(legacyObservation, null, 2)}\n`;
    await mkdir(taskDirectory, { recursive: true });
    await writeFile(observationPath, storedDocument, "utf8");
    await fixture.runtime.observationApplication.recordReview(
      fixture.repositoryRoot,
      legacyReviewObservation(),
    );

    const reconciliation = await runCli([
      "reconcile",
      "candidates",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);
    const insights = await runCli([
      "insights",
      "summary",
      "--repo",
      fixture.repositoryRoot,
    ], fixture.runtime);

    expect(reconciliation.exitCode).toBe(0);
    expect(JSON.parse(reconciliation.stdout)).toMatchObject({
      ok: true,
      data: {
        summary: {
          businessDomains: 0,
          candidateGroups: 0,
          candidateOccurrences: 0,
          duplicateGroups: 0,
        },
        domains: [],
      },
    });
    expect(insights.exitCode).toBe(0);
    expect(JSON.parse(insights.stdout)).toMatchObject({
      ok: true,
      data: {
        summary: {
          taskObservations: 1,
          approvedReviews: 1,
          recoveries: { missing: 1 },
        },
      },
    });
    expect(await readFile(observationPath, "utf8")).toBe(storedDocument);
  });
});

async function createFixture(): Promise<{
  readonly repositoryRoot: string;
  readonly userHome: string;
  readonly runtime: Awaited<ReturnType<typeof createCliRuntime>>;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-reconcile-cli-"));
  sandboxes.push(sandbox);
  const repositoryRoot = path.join(sandbox, "repository");
  const userHome = path.join(sandbox, "home");
  await mkdir(path.join(repositoryRoot, ".git"), { recursive: true });
  return {
    repositoryRoot,
    userHome,
    runtime: await createCliRuntime({ userHome }),
  };
}

function taskObservation(): TaskObservationInput {
  return {
    schemaVersion: 2,
    id: "task-observation-reconcile-cli",
    recordedAt: "2026-08-27T10:00:00.000Z",
    task: { taskId: "task-reconcile-cli", runId: "run-reconcile-cli" },
    map: {
      queries: [{ selector: "Refund eligibility", outcome: "concept_not_found" }],
      dispositions: [{
        status: "missing",
        summary: "The map is missing a durable refund eligibility operation.",
        evidence: [{ kind: "source", reference: "src/refunds.ts" }],
      }],
    },
    mapUpdateCandidates: [{
      businessDomainId: "commerce",
      kind: "node",
      disposition: "confirmed",
      summary: "Add refund eligibility as a durable Commerce operation.",
      evidence: [{ kind: "source", reference: "src/refunds.ts" }],
    }],
  };
}

function legacyReviewObservation(): ReviewObservationInput {
  return {
    schemaVersion: 1,
    id: "legacy-v1-review",
    recordedAt: "2026-08-26T11:00:00.000Z",
    taskObservationId: "legacy-v1",
    review: {
      taskId: "legacy-review-task",
      runId: "legacy-review-run",
      verdict: "approved",
      businessBoundary: "correct",
      upstreamCause: "not_applicable",
      impactCompleteness: "complete",
      requiredRework: false,
      mapCausedRegression: false,
    },
  };
}
