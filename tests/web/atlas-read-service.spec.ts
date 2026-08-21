import { afterEach, describe, expect, it } from "vitest";

import { GraphStore } from "../../src/graph/graph-store.js";
import { BusinessKnowledgeService } from "../../src/knowledge/business-knowledge-service.js";
import { inspectGitRepository } from "../../src/repository/repository-inspector.js";
import { createRepositorySnapshot } from "../../src/snapshots/repository-snapshot.js";
import { AtlasDatabase } from "../../src/storage/atlas-database.js";
import { CodeGraphStructuralBackend } from "../../src/structural-backend/codegraph-backend.js";
import { AtlasReadService } from "../../src/web/application/atlas-read-service.js";
import { WorldModelService } from "../../src/world/world-model-service.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("AtlasReadService", () => {
  const fixtures: GitFixture[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  });

  it("serves status, maps, business search, and node details from one current primary world", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    const publication = await new WorldModelService(repository).build();
    const snapshot = await createRepositorySnapshot(repository);
    const structural = new CodeGraphStructuralBackend(repository);
    const value = (await structural.search({ query: "value", limit: 10 }))
      .find(({ node }) => node.name === "value")?.node;
    const source = snapshot.files.find(({ path }) => path === "src/example.ts")?.worktree;
    if (value === undefined || source === null || source === undefined) {
      throw new Error("Expected indexed fixture evidence");
    }
    using graph = new GraphStore(repository);
    await new BusinessKnowledgeService(repository, graph).learn({
      schemaVersion: 1,
      baseSnapshotId: publication.snapshotId,
      nodeOperations: [{
        op: "upsert",
        node: {
          key: "fixture/read-value",
          kind: "Operation",
          label: "Read fixture value",
          summary: "Returns the fixture value.",
          aliases: ["value reader"],
          certainty: "exact",
          evidence: [{
            symbolId: value.reference.id,
            file: value.path,
            range: value.range,
            contentHash: source.contentHash,
          }],
        },
      }],
      relationOperations: [],
    });

    const service = new AtlasReadService();
    const project = (await service.listProjects()).find(({ id }) => id === repository.repositoryId);
    if (project === undefined) throw new Error("Expected fixture project");

    await expect(service.getStatus(project.id)).resolves.toMatchObject({
      project: { id: project.id, branch: "main", freshness: "current" },
      backend: { completeness: "complete" },
    });
    await expect(service.getMap(project.id)).resolves.toMatchObject({
      focus: null,
      regions: [{ node: { key: "fixture/read-value", kind: "Operation" } }],
    });
    await expect(service.searchBusiness(project.id, "value reader", 10)).resolves.toMatchObject({
      query: "value reader",
      limit: 10,
      results: [{ node: { key: "fixture/read-value" } }],
    });
    await expect(service.getBusinessNode(project.id, "fixture/read-value")).resolves.toMatchObject({
      node: { key: "fixture/read-value", certainty: "exact", validity: "valid" },
      relations: [],
    });
  }, 60_000);

  it("does not resolve unknown repository IDs", async () => {
    await expect(new AtlasReadService().getMap("a".repeat(64))).rejects.toMatchObject({
      code: "PROJECT_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("serves the latest published primary map after newer source changes", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    await new WorldModelService(repository).build();

    await fixture.write("src/unindexed.ts", "export const newerSource = true;\n");
    const service = new AtlasReadService();
    const project = (await service.listProjects()).find(({ id }) => id === repository.repositoryId);
    if (project === undefined) throw new Error("Expected fixture project");

    expect(project).toMatchObject({ branch: "main", freshness: "stale", status: "current" });
    await expect(service.getMap(project.id)).resolves.toMatchObject({ focus: null });
  }, 60_000);

  it("opens repository Atlas storage in enforced read-only mode", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const repository = await inspectGitRepository(fixture.directory);
    using writable = new GraphStore(repository);
    writable.close();

    using readonly = new AtlasDatabase(repository, { access: "read-only" });
    expect(() => readonly.connection.prepare(`
      UPDATE atlas_repositories
      SET updated_at = updated_at
      WHERE repository_id = ?
    `).run(repository.repositoryId)).toThrow(/readonly/iu);
  });
});
