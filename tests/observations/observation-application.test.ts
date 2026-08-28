import { afterEach, describe, expect, it } from "vitest";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  ReviewObservationInput,
  TaskObservationInput,
} from "../../src/contracts/observation.js";
import {
  ObservationApplication,
  ObservationInputError,
  TaskObservationNotFoundError,
} from "../../src/observations/observation-application.js";
import {
  ObservationConflictError,
  ObservationStorageError,
  ObservationStore,
} from "../../src/observations/observation-store.js";
import {
  RepositoryIdentityError,
  RepositoryIdentityResolver,
} from "../../src/observations/repository-identity.js";

const sandboxes: string[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe("accuracy observation boundary", () => {
  it("records complete task and independent review artifacts outside the repository", async () => {
    const fixture = await createFixture();
    const task = taskObservation();

    const recordedTask = await fixture.application.recordTask(
      fixture.repositoryRoot,
      task,
    );
    expect(recordedTask.outcome).toBe("recorded");
    expect(recordedTask.path.startsWith(fixture.userHome)).toBe(true);
    expect(recordedTask.path.startsWith(fixture.repositoryRoot)).toBe(false);

    const storedTaskDocument = await readFile(recordedTask.path, "utf8");
    expect(storedTaskDocument).not.toContain(fixture.repositoryRoot);
    expect(JSON.parse(storedTaskDocument)).toMatchObject({
      schemaVersion: 2,
      id: task.id,
      repository: {
        kind: "git",
        id: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
      task: task.task,
      map: task.map,
    });

    const review = reviewObservation(task.id);
    const recordedReview = await fixture.application.recordReview(
      fixture.repositoryRoot,
      review,
    );
    expect(recordedReview).toMatchObject({
      outcome: "recorded",
      kind: "review",
      id: review.id,
    });
    expect(JSON.parse(await readFile(recordedReview.path, "utf8"))).toMatchObject({
      taskObservationId: task.id,
      review: {
        verdict: "approved",
        businessBoundary: "correct",
        upstreamCause: "correct",
        impactCompleteness: "complete",
        requiredRework: false,
        mapCausedRegression: false,
      },
    });
  });

  it("rejects task self-scoring and missing review references before writing", async () => {
    const fixture = await createFixture();
    const selfScored = {
      ...taskObservation(),
      accuracy: { businessBoundary: "correct" },
    };

    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, selfScored),
    ).rejects.toBeInstanceOf(ObservationInputError);
    const absoluteEvidence = taskObservation();
    absoluteEvidence.map.dispositions[0]?.evidence.splice(0, 1, {
      kind: "source",
      reference: path.join(fixture.repositoryRoot, "src/orders.ts"),
    });
    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, absoluteEvidence),
    ).rejects.toBeInstanceOf(ObservationInputError);
    const unownedCandidate = taskObservation() as unknown as {
      mapUpdateCandidates: Array<Record<string, unknown>>;
    };
    delete unownedCandidate.mapUpdateCandidates[0]?.businessDomainId;
    delete unownedCandidate.mapUpdateCandidates[0]?.disposition;
    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, unownedCandidate),
    ).rejects.toBeInstanceOf(ObservationInputError);
    await expect(
      fixture.application.recordReview(
        fixture.repositoryRoot,
        reviewObservation("missing-task-observation"),
      ),
    ).rejects.toBeInstanceOf(TaskObservationNotFoundError);
    await expect(access(fixture.observationRoot)).rejects.toThrow();
  });

  it("makes exact replays idempotent and rejects changed content for the same ID", async () => {
    const fixture = await createFixture();
    const input = taskObservation();

    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, input),
    ).resolves.toMatchObject({ outcome: "recorded" });
    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, input),
    ).resolves.toMatchObject({ outcome: "idempotent" });
    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, {
        ...input,
        humanCorrection: {
          summary: "A person corrected the task scope.",
          dimensions: ["business_boundary"],
        },
      }),
    ).rejects.toBeInstanceOf(ObservationConflictError);
  });

  it("keeps task and review observations in one repository-wide ID namespace", async () => {
    const fixture = await createFixture();
    const task = taskObservation();
    await fixture.application.recordTask(fixture.repositoryRoot, task);

    await expect(
      fixture.application.recordReview(fixture.repositoryRoot, {
        ...reviewObservation(task.id),
        id: task.id,
      }),
    ).rejects.toBeInstanceOf(ObservationConflictError);
  });

  it("publishes concurrent observations as separate complete files", async () => {
    const fixture = await createFixture();
    const inputs = Array.from({ length: 24 }, (_, index) => taskObservation({
      id: `task-observation-${index}`,
      task: { taskId: `task-${index}`, runId: `run-${index}` },
    }));

    const results = await Promise.all(inputs.map((input) =>
      fixture.application.recordTask(fixture.repositoryRoot, input)
    ));
    expect(results.every(({ outcome }) => outcome === "recorded")).toBe(true);
    expect(new Set(results.map(({ path: resultPath }) => resultPath)).size).toBe(24);

    const taskDirectory = path.dirname(results[0]?.path ?? "");
    expect((await readdir(taskDirectory)).sort()).toEqual(
      inputs.map(({ id }) => `${id}.json`).sort(),
    );
    await Promise.all(results.map(async ({ path: resultPath }) => {
      const document = await readFile(resultPath, "utf8");
      expect(() => JSON.parse(document)).not.toThrow();
    }));
  });

  it("serializes concurrent replays without overwriting the winning content", async () => {
    const fixture = await createFixture();
    const input = taskObservation();

    const results = await Promise.all(Array.from({ length: 12 }, () =>
      fixture.application.recordTask(fixture.repositoryRoot, input)
    ));
    expect(results.filter(({ outcome }) => outcome === "recorded")).toHaveLength(1);
    expect(results.filter(({ outcome }) => outcome === "idempotent")).toHaveLength(11);
  });

  it("publishes complete claim metadata before exposing a live writer", async () => {
    let continuePublication: () => void = () => undefined;
    const publicationGate = new Promise<void>((resolve) => {
      continuePublication = resolve;
    });
    let markPublicationStarted: () => void = () => undefined;
    const publicationStarted = new Promise<void>((resolve) => {
      markPublicationStarted = resolve;
    });
    const fixture = await createFixture({
      rename: async (source, target) => {
        markPublicationStarted();
        await publicationGate;
        await rename(source, target);
      },
    });

    const firstWrite = fixture.application.recordTask(
      fixture.repositoryRoot,
      taskObservation(),
    );
    await publicationStarted;
    const claimPath = await observationClaimPath(fixture);
    try {
      expect((await lstat(claimPath)).isFile()).toBe(true);
      expect(JSON.parse(await readFile(claimPath, "utf8"))).toMatchObject({
        schemaVersion: 1,
        pid: process.pid,
        processInstanceId: expect.any(String),
        claimId: expect.any(String),
      });
    } finally {
      continuePublication();
    }
    await expect(firstWrite).resolves.toMatchObject({ outcome: "recorded" });

    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, taskObservation()),
    ).resolves.toMatchObject({ outcome: "idempotent" });
  });

  it("removes staging state when atomic publication fails", async () => {
    const fixture = await createFixture({
      rename: async () => {
        throw new Error("simulated atomic rename failure");
      },
    });

    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, taskObservation()),
    ).rejects.toBeInstanceOf(ObservationStorageError);

    const repositoryIdentity = await fixture.resolver.resolve(fixture.repositoryRoot);
    const taskDirectory = path.join(
      fixture.observationRoot,
      "repositories",
      repositoryIdentity.identity.id,
      "tasks",
    );
    expect(await readdir(taskDirectory)).toEqual([]);
  });

  it("does not reinterpret an obsolete claim directory", async () => {
    const fixture = await createFixture();
    const claimDirectory = await observationClaimPath(fixture);
    await mkdir(claimDirectory, { recursive: true });
    await writeFile(
      path.join(claimDirectory, "owner.json"),
      `${JSON.stringify({ pid: 999_999_999 })}\n`,
    );

    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, taskObservation()),
    ).rejects.toThrow("uses an unsupported claim format");
    await expect(access(claimDirectory)).resolves.toBeUndefined();
  });

  it("does not mistake a reused process ID for a live atomic claim", async () => {
    const fixture = await createFixture();
    const claimPath = await observationClaimPath(fixture);
    await mkdir(path.dirname(claimPath), { recursive: true });
    await writeFile(claimPath, `${JSON.stringify({
      schemaVersion: 1,
      pid: process.pid,
      processInstanceId: "previous-process-instance",
      claimId: "abandoned-claim",
    })}\n`);

    await expect(
      fixture.application.recordTask(fixture.repositoryRoot, taskObservation()),
    ).resolves.toMatchObject({ outcome: "recorded" });
    await expect(access(claimPath)).rejects.toThrow();
  });

  it("uses one private repository identity across Git worktrees", async () => {
    const fixture = await createFixture();
    const worktreeRoot = path.join(fixture.sandbox, "task-worktree");
    const worktreeGitDirectory = path.join(
      fixture.repositoryRoot,
      ".git",
      "worktrees",
      "task-worktree",
    );
    await mkdir(worktreeGitDirectory, { recursive: true });
    await mkdir(worktreeRoot);
    await writeFile(
      path.join(worktreeRoot, ".git"),
      `gitdir: ${worktreeGitDirectory}\n`,
    );
    await writeFile(path.join(worktreeGitDirectory, "commondir"), "../..\n");

    const mainIdentity = await fixture.resolver.resolve(fixture.repositoryRoot);
    const worktreeIdentity = await fixture.resolver.resolve(worktreeRoot);
    expect(worktreeIdentity.identity).toEqual(mainIdentity.identity);

    const recorded = await fixture.application.recordTask(
      worktreeRoot,
      taskObservation(),
    );
    expect(recorded.path).toContain(mainIdentity.identity.id);
  });

  it("reports malformed Git worktree metadata as an identity error", async () => {
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-identity-"));
    sandboxes.push(sandbox);
    const repositoryRoot = path.join(sandbox, "repository");
    await mkdir(repositoryRoot);
    await writeFile(path.join(repositoryRoot, ".git"), "gitdir: missing-directory\n");

    await expect(
      new RepositoryIdentityResolver().resolve(repositoryRoot),
    ).rejects.toBeInstanceOf(RepositoryIdentityError);
  });
});

interface FixtureOptions {
  readonly rename?: (source: string, target: string) => Promise<void>;
}

async function observationClaimPath(fixture: {
  readonly observationRoot: string;
  readonly repositoryRoot: string;
  readonly resolver: RepositoryIdentityResolver;
}): Promise<string> {
  const repositoryIdentity = await fixture.resolver.resolve(fixture.repositoryRoot);
  return path.join(
    fixture.observationRoot,
    "repositories",
    repositoryIdentity.identity.id,
    ".claims",
    "task-observation-1.lock",
  );
}

async function createFixture(options: FixtureOptions = {}): Promise<{
  readonly sandbox: string;
  readonly userHome: string;
  readonly repositoryRoot: string;
  readonly observationRoot: string;
  readonly resolver: RepositoryIdentityResolver;
  readonly application: ObservationApplication;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-observation-"));
  sandboxes.push(sandbox);
  const userHome = path.join(sandbox, "home");
  const repositoryRoot = path.join(sandbox, "repository");
  const observationRoot = path.join(
    userHome,
    ".semantic-atlas",
    "observations",
    "v1",
  );
  await mkdir(path.join(repositoryRoot, ".git"), { recursive: true });
  const resolver = new RepositoryIdentityResolver();
  const store = new ObservationStore(
    { userHome },
    options.rename ? { rename: options.rename } : undefined,
  );
  const application = new ObservationApplication(resolver, store);
  return {
    sandbox,
    userHome,
    repositoryRoot,
    observationRoot,
    resolver,
    application,
  };
}

function taskObservation(
  overrides: Partial<TaskObservationInput> = {},
): TaskObservationInput {
  return {
    schemaVersion: 2,
    id: "task-observation-1",
    recordedAt: "2026-08-27T03:00:00.000Z",
    task: {
      taskId: "task-1",
      runId: "run-1",
    },
    map: {
      queries: [{
        selector: "Checkout",
        outcome: "context",
        selectedConceptIds: ["commerce.orders.place-order"],
      }],
      dispositions: [{
        status: "stale",
        summary: "The checkout anchor moved while its business meaning stayed stable.",
        evidence: [{
          kind: "source",
          reference: "src/checkout/place-order.ts",
        }],
      }],
    },
    mapUpdateCandidates: [{
      businessDomainId: "commerce",
      kind: "anchor",
      disposition: "confirmed",
      summary: "Replace the stale checkout source anchor.",
      evidence: [{
        kind: "source",
        reference: "src/checkout/place-order.ts",
      }],
    }],
    ...overrides,
  };
}

function reviewObservation(taskObservationId: string): ReviewObservationInput {
  return {
    schemaVersion: 1,
    id: "review-observation-1",
    recordedAt: "2026-08-27T03:30:00.000Z",
    taskObservationId,
    review: {
      taskId: "review-task-1",
      runId: "review-run-1",
      verdict: "approved",
      businessBoundary: "correct",
      upstreamCause: "correct",
      impactCompleteness: "complete",
      requiredRework: false,
      mapCausedRegression: false,
    },
  };
}
