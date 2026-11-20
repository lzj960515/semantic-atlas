import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface ControlledCase {
  readonly id: string;
  readonly evidence: readonly { readonly reference: string }[];
  readonly expectedOutcome: "candidate" | "discarded";
}

interface ControlledSuite {
  readonly schemaVersion: 1;
  readonly cases: readonly ControlledCase[];
}

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillDirectory = path.join(projectRoot, ".agents/skills/semantic-atlas");
const controlledRepository = path.join(projectRoot, "tests/fixtures/agent-skill/repository");

describe("unified Skill references", () => {
  it("keeps all local reference links inside the unified Skill usable", async () => {
    const referenceNames = [
      "boundary-design.md",
      "map-authoring.md",
      "diagram-design.md",
      "observations.md",
      "reconciliation.md",
    ];
    for (const referenceName of referenceNames) {
      const document = await readFile(
        path.join(skillDirectory, "references", referenceName),
        "utf8",
      );
      for (const match of document.matchAll(/\]\(([^)]+)\)/gu)) {
        const target = match[1]!.split("#")[0]!;
        if (!target || target.includes("://")) continue;
        await access(path.resolve(skillDirectory, "references", target));
      }
    }
  });

  it("covers drift, duplicate provenance, correction, and a clean discard", async () => {
    const suite = JSON.parse(
      await readFile(path.join(projectRoot, "tests/fixtures/reconciliation/cases.json"), "utf8"),
    ) as ControlledSuite;

    expect(suite.schemaVersion).toBe(1);
    expect(suite.cases.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "stale-anchor-primary",
        "stale-anchor-duplicate",
        "contradicted-relation",
        "missing-durable-concept",
        "unresolved-business-meaning",
        "discarded-transient-observation",
      ]),
    );
    expect(
      suite.cases.filter(({ expectedOutcome }) => expectedOutcome === "discarded"),
    ).toHaveLength(1);
    for (const controlledCase of suite.cases) {
      for (const evidence of controlledCase.evidence) {
        await expect(
          access(path.join(controlledRepository, evidence.reference)),
        ).resolves.toBeUndefined();
      }
    }
  });
});
