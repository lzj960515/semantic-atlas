import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TaskObservationInput } from "../../src/contracts/observation.js";
import { createCliRuntime, runCli } from "../../src/cli/run-cli.js";

const sandboxes: string[] = [];

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
});

async function createFixture(): Promise<{
  readonly repositoryRoot: string;
  readonly runtime: Awaited<ReturnType<typeof createCliRuntime>>;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-reconcile-cli-"));
  sandboxes.push(sandbox);
  const repositoryRoot = path.join(sandbox, "repository");
  await mkdir(path.join(repositoryRoot, ".git"), { recursive: true });
  return {
    repositoryRoot,
    runtime: await createCliRuntime({ userHome: path.join(sandbox, "home") }),
  };
}

function taskObservation(): TaskObservationInput {
  return {
    schemaVersion: 1,
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
