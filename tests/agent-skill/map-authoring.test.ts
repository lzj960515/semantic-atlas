import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MapApplication } from "../../src/application/map-application.js";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const fixtureRoot = path.join(projectRoot, "tests/fixtures/map-authoring");

describe("business map authoring resources", () => {
  it("provides a complete authoring example that validates and projects a business domain", async () => {
    const reference = await readFile(
      path.join(
        projectRoot,
        ".agents/skills/semantic-atlas-maintenance/references/map-authoring.md",
      ),
      "utf8",
    );
    const example = /```yaml\n([\s\S]*?)\n```/u.exec(reference)?.[1];
    expect(example).toBeDefined();
    const repository = await mkdtemp(path.join(os.tmpdir(), "atlas-authoring-"));
    try {
      await mkdir(path.join(repository, "docs/business-map"), { recursive: true });
      await writeFile(path.join(repository, "docs/business-map/support.yaml"), example!);
      const application = new MapApplication();
      const result = await application.viewerProject(repository);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error.message);
      expect(result.viewerProject.views.map(({ id }) => id)).toEqual(["all", "support"]);
      expect(result.viewerProject.flows).toHaveLength(1);
      expect(result.viewerProject.views[1]?.nodes).toHaveLength(2);
    } finally {
      await rm(repository, { recursive: true, force: true });
    }
  });

  it("keeps fresh-Agent fixtures separate from their evaluation criteria", async () => {
    const suite = JSON.parse(await readFile(path.join(fixtureRoot, "evals.json"), "utf8")) as {
      readonly evals: readonly {
        readonly id: number;
        readonly fixture: string;
        readonly prompt: string;
        readonly expectations: readonly string[];
      }[];
    };
    expect(suite.evals.map(({ id }) => id)).toEqual([1, 2, 3, 4]);
    for (const evaluation of suite.evals) {
      const repository = path.join(fixtureRoot, evaluation.fixture);
      await expect(access(path.join(repository, "README.md"))).resolves.toBeUndefined();
      await expect(access(path.join(repository, "src"))).resolves.toBeUndefined();
      await expect(access(path.join(repository, "evals.json"))).rejects.toThrow();
      expect(evaluation.prompt).not.toMatch(/YAML|分文件|业务域|domain/u);
      expect(evaluation.expectations.length).toBeGreaterThan(0);
      const probe = await new MapApplication().validate(repository);
      if (evaluation.id === 3 || evaluation.id === 4) {
        expect(probe).toMatchObject({
          ok: true,
          data: { documentCount: 1, flowCount: evaluation.id === 3 ? 1 : 0 },
        });
        const projected = await new MapApplication().viewerProject(repository);
        expect(projected.ok).toBe(true);
        if (!projected.ok) throw new Error(projected.error.message);
        expect(projected.viewerProject.views.map(({ id }) => id)).toEqual([
          "all",
          evaluation.id === 3 ? "orders" : "assistant",
        ]);
      } else {
        await expect(access(path.join(repository, "docs/business-map"))).rejects.toThrow();
        expect(probe).toMatchObject({ ok: false, error: { code: "MAP_NOT_FOUND" } });
      }
    }
  });
});
