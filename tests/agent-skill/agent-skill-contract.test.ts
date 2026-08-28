import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { runCli } from "../../src/cli/run-cli.js";

interface EvaluationCase {
  readonly id: string;
  readonly task: string;
  readonly selector: string;
  readonly mapExpectation:
    | {
        readonly outcome: "context";
        readonly selectedId: string;
        readonly anchorValues?: readonly string[];
        readonly absentAnchorPaths?: readonly string[];
        readonly relations?: readonly ExpectedRelation[];
      }
    | { readonly outcome: "error"; readonly code: string };
  readonly requiredEvidence: readonly string[];
  readonly oracle: {
    readonly conclusion: string;
    readonly mapObservation?: string;
  };
}

interface ExpectedRelation {
  readonly direction: "incoming" | "outgoing";
  readonly type: string;
  readonly from: string;
  readonly to: string;
}

interface ContextEnvelopeView {
  readonly data: {
    readonly selected: {
      readonly anchors: readonly { readonly value: string }[];
    };
    readonly incoming: readonly RelationView[];
    readonly outgoing: readonly RelationView[];
  };
}

interface RelationView {
  readonly type: string;
  readonly from: { readonly id: string };
  readonly to: { readonly id: string };
}

interface EvaluationSuite {
  readonly schemaVersion: 1;
  readonly cases: readonly EvaluationCase[];
}

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillDirectory = path.join(projectRoot, ".agents/skills/semantic-atlas");
const fixtureRepository = path.join(
  projectRoot,
  "tests/fixtures/agent-skill/repository",
);

describe("business-understanding Agent Skill", () => {
  it("has one discoverable identity in both the repository and package", async () => {
    const skillDocument = await readFile(
      path.join(skillDirectory, "SKILL.md"),
      "utf8",
    );
    const metadataDocument = await readFile(
      path.join(skillDirectory, "agents/openai.yaml"),
      "utf8",
    );
    const packageDocument = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { readonly files: readonly string[] };
    const frontmatter = parseFrontmatter(skillDocument);
    const metadata = parse(metadataDocument) as {
      readonly interface: { readonly default_prompt: string };
    };

    expect(frontmatter).toMatchObject({
      name: "semantic-atlas",
    });
    expect(metadata.interface.default_prompt).toContain("$semantic-atlas");
    expect(packageDocument.files).toContain(".agents");
  });

  it("defines advisory evidence routing for every bounded map outcome", async () => {
    const skillDocument = await readFile(
      path.join(skillDirectory, "SKILL.md"),
      "utf8",
    );

    expect(skillDocument).toContain("CONCEPT_NOT_FOUND");
    expect(skillDocument).toContain("CONCEPT_AMBIGUOUS");
    expect(skillDocument).toContain("MAP_NOT_FOUND");
    expect(skillDocument).toContain("investigation leads");
    expect(skillDocument).toContain("map-update candidate");
  });

  it("activates from business-changing work with or without an existing map", async () => {
    const skillDocument = await readFile(
      path.join(skillDirectory, "SKILL.md"),
      "utf8",
    );
    const metadataDocument = await readFile(
      path.join(skillDirectory, "agents/openai.yaml"),
      "utf8",
    );
    const frontmatter = parseFrontmatter(skillDocument);
    const metadata = parse(metadataDocument) as {
      readonly interface: { readonly default_prompt: string };
    };

    expect(frontmatter.description).toContain("business-changing engineering tasks");
    expect(frontmatter.description).toContain("with or without an existing business map");
    expect(frontmatter.description).not.toContain(
      "Use in repositories with docs/business-map files",
    );
    expect(metadata.interface.default_prompt).toContain(
      "with or without an existing business map",
    );
    expect(skillDocument).toContain(
      "When the map is absent, build the smallest source-supported business model needed for the task.",
    );
    expect(skillDocument).toContain('"outcome": "map_not_found"');
  });

  it("makes a post-task maintenance decision without forcing a map edit", async () => {
    const skillDocument = await readFile(
      path.join(skillDirectory, "SKILL.md"),
      "utf8",
    );

    expect(skillDocument).toContain("maintenance disposition");
    expect(skillDocument).toContain("candidate");
    expect(skillDocument).toContain("already_represented");
    expect(skillDocument).toContain("implementation_local");
    expect(skillDocument).toContain("unresolved");
    expect(skillDocument).toContain("A no-change disposition is a complete result");
    expect(skillDocument).toContain("semantic-atlas-maintenance");
    expect(skillDocument).toContain(
      "Keep canonical map editing in a separate maintenance change after stable reviewed source is available.",
    );
  });

  it("records task evidence without moving accuracy authority into the task Agent", async () => {
    const skillDocument = await readFile(
      path.join(skillDirectory, "SKILL.md"),
      "utf8",
    );
    const observationReference = await readFile(
      path.join(skillDirectory, "references/observations.md"),
      "utf8",
    );

    expect(skillDocument).toContain("references/observations.md");
    expect(skillDocument).toContain("semantic-atlas observe task --stdin");
    expect(skillDocument).toContain("semantic-atlas observe review --stdin");
    expect(skillDocument).toContain(
      "For independent review, record one review observation",
    );
    expect(skillDocument).toContain("engineering result remains unchanged");
    expect(skillDocument).toContain("Independent review owns accuracy judgments");
    expect(observationReference).toContain('"schemaVersion": 1');
    expect(observationReference).toContain('"schemaVersion": 2');
    expect(observationReference).toContain('"mapUpdateCandidates"');
    expect(observationReference).toContain('"businessDomainId"');
    expect(observationReference).toContain('"disposition"');
    expect(observationReference).toContain("semantic-atlas observe review --stdin");
    expect(observationReference).not.toContain("Pietra");
  });

  it("keeps every controlled case queryable and grounded in current evidence", async () => {
    const suite = await readEvaluationSuite();

    expect(suite.schemaVersion).toBe(1);
    expect(suite.cases.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "upstream-root-cause",
      "downstream-consumer",
      "missing-map-knowledge",
      "ambiguous-term",
      "missing-anchor",
      "stale-anchor",
      "contradicted-relation",
    ]));

    for (const evaluationCase of suite.cases) {
      expect(evaluationCase.task.trim()).not.toBe("");
      expect(evaluationCase.oracle.conclusion.trim()).not.toBe("");

      for (const evidencePath of evaluationCase.requiredEvidence) {
        await access(path.join(fixtureRepository, evidencePath));
      }

      const result = await runCli([
        "context",
        evaluationCase.selector,
        "--repo",
        fixtureRepository,
      ]);
      const envelope = JSON.parse(result.stdout) as Record<string, unknown>;

      if (evaluationCase.mapExpectation.outcome === "context") {
        expect(result.exitCode, evaluationCase.id).toBe(0);
        expect(envelope, evaluationCase.id).toMatchObject({
          ok: true,
          data: {
            selected: { id: evaluationCase.mapExpectation.selectedId },
          },
        });
        await assertExpectedContext(
          envelope as unknown as ContextEnvelopeView,
          evaluationCase.mapExpectation,
          evaluationCase.id,
        );
      } else {
        expect(result.exitCode, evaluationCase.id).toBe(1);
        expect(envelope, evaluationCase.id).toMatchObject({
          ok: false,
          error: { code: evaluationCase.mapExpectation.code },
        });
      }
    }
  });
});

async function readEvaluationSuite(): Promise<EvaluationSuite> {
  const casesPath = path.join(
    projectRoot,
    "tests/fixtures/agent-skill/cases.json",
  );
  return JSON.parse(await readFile(casesPath, "utf8")) as EvaluationSuite;
}

async function assertExpectedContext(
  envelope: ContextEnvelopeView,
  expectation: Extract<
    EvaluationCase["mapExpectation"],
    { readonly outcome: "context" }
  >,
  caseId: string,
): Promise<void> {
  if (expectation.anchorValues) {
    expect(
      envelope.data.selected.anchors.map(({ value }) => value),
      caseId,
    ).toEqual(expectation.anchorValues);
  }

  for (const relation of expectation.relations ?? []) {
    expect(envelope.data[relation.direction], caseId).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: relation.type,
          from: expect.objectContaining({ id: relation.from }),
          to: expect.objectContaining({ id: relation.to }),
        }),
      ]),
    );
  }

  for (const anchorPath of expectation.absentAnchorPaths ?? []) {
    await expect(access(path.join(fixtureRepository, anchorPath)), caseId)
      .rejects.toThrow();
  }
}

function parseFrontmatter(document: string): Record<string, unknown> {
  const match = /^---\n([\s\S]+?)\n---\n/.exec(document);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "") as Record<string, unknown>;
}
