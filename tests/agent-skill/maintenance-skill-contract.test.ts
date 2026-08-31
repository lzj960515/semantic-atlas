import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
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
const skillDirectory = path.join(
  projectRoot,
  ".agents/skills/semantic-atlas-maintenance",
);
const controlledRepository = path.join(
  projectRoot,
  "tests/fixtures/agent-skill/repository",
);

describe("bundled Semantic Atlas maintenance Skill", () => {
  it("is discoverable with one narrow maintenance identity", async () => {
    const skillDocument = await readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
    const metadataDocument = await readFile(
      path.join(skillDirectory, "agents/openai.yaml"),
      "utf8",
    );
    const frontmatter = parseFrontmatter(skillDocument);
    const metadata = parse(metadataDocument) as {
      readonly interface: { readonly default_prompt: string };
    };

    expect(frontmatter).toMatchObject({
      name: "semantic-atlas-maintenance",
    });
    expect(metadata.interface.default_prompt).toContain("$semantic-atlas-maintenance");
  });

  it("routes one domain from candidate evidence to a normal reviewed YAML change", async () => {
    const skillDocument = await readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
    const reference = await readFile(
      path.join(skillDirectory, "references/reconciliation.md"),
      "utf8",
    );

    expect(skillDocument).toContain("semantic-atlas reconcile candidates --repo");
    expect(skillDocument).toContain("one business domain");
    expect(skillDocument).toContain("current source");
    expect(skillDocument).toContain("tracked product documents");
    expect(skillDocument).toContain("confirmed");
    expect(skillDocument).toContain("contradicted");
    expect(skillDocument).toContain("unresolved");
    expect(skillDocument).toContain("one owning YAML");
    expect(skillDocument).toContain("semantic-atlas validate");
    expect(skillDocument).toContain("semantic-atlas render");
    expect(skillDocument).toContain("independent review");
    expect(skillDocument).toContain("Work Phase");
    expect(skillDocument).toContain("Review Phase");
    expect(skillDocument).toContain("Integration Phase");
    expect(skillDocument).toContain("semantic-atlas observe maintenance --stdin --repo");
    expect(skillDocument).toContain("Do not record a terminal maintenance observation");
    expect(skillDocument).toContain("mergedCommit");
    expect(skillDocument).toContain("idempotent");
    expect(reference).toContain("implementation-local");
    expect(reference).toContain("duplicate");
    expect(reference).toContain("Git diff");
    expect(reference).toContain("taskObservationId");
    expect(reference).toContain("candidateIndex");
    expect(reference).toContain("waitingForEvidenceOccurrences");
  });

  it("can bootstrap one evidence-supported domain when no map exists", async () => {
    const skillDocument = await readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
    const frontmatter = parseFrontmatter(skillDocument);

    expect(frontmatter.description).toContain(
      "with or without an existing business map",
    );
    expect(skillDocument).toContain(
      "When no map documents exist, create one initial business-domain YAML",
    );
    expect(skillDocument).toContain(
      "Limit the initial map to stable meaning supported by the selected candidates and current evidence.",
    );
    expect(skillDocument).toContain("MAP_NOT_FOUND");
  });

  it("covers drift, duplicate provenance, correction, and a clean discard", async () => {
    const suite = JSON.parse(await readFile(
      path.join(projectRoot, "tests/fixtures/reconciliation/cases.json"),
      "utf8",
    )) as ControlledSuite;

    expect(suite.schemaVersion).toBe(1);
    expect(suite.cases.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "stale-anchor-primary",
      "stale-anchor-duplicate",
      "contradicted-relation",
      "missing-durable-concept",
      "unresolved-business-meaning",
      "discarded-transient-observation",
    ]));
    expect(suite.cases.filter(({ expectedOutcome }) => expectedOutcome === "discarded"))
      .toHaveLength(1);
    for (const controlledCase of suite.cases) {
      for (const evidence of controlledCase.evidence) {
        await expect(access(path.join(controlledRepository, evidence.reference)))
          .resolves.toBeUndefined();
      }
    }
  });
});

function parseFrontmatter(document: string): Record<string, unknown> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(document);
  if (!match?.[1]) throw new Error("Skill frontmatter is missing");
  return parse(match[1]) as Record<string, unknown>;
}
