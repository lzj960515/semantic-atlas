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
        readonly flowIds?: readonly string[];
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
    readonly relations: readonly RelationView[];
    readonly flows: readonly { readonly id: string }[];
  };
}

interface RelationView {
  readonly type: string;
  readonly from: string;
  readonly to: string;
}

interface EvaluationSuite {
  readonly schemaVersion: 1;
  readonly cases: readonly EvaluationCase[];
}

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const skillDirectory = path.join(projectRoot, ".agents/skills/semantic-atlas");
const fixtureRepository = path.join(projectRoot, "tests/fixtures/agent-skill/repository");

describe("unified business Agent Skill", () => {
  it("exposes one identity for business investigation and flow authoring", async () => {
    const skillDocument = await readFile(path.join(skillDirectory, "SKILL.md"), "utf8");
    const metadata = parse(
      await readFile(path.join(skillDirectory, "agents/openai.yaml"), "utf8"),
    ) as {
      readonly interface: { readonly default_prompt: string };
    };
    const frontmatter = parseFrontmatter(skillDocument);
    expect(frontmatter).toMatchObject({ name: "semantic-atlas" });
    expect(frontmatter.description).toMatch(/理解.*绘制.*维护/u);
    expect(metadata.interface.default_prompt).toContain("$semantic-atlas");
    expect(skillDocument).not.toContain("semantic-atlas-maintenance");
    await expect(
      access(path.join(projectRoot, ".agents/skills/semantic-atlas-maintenance")),
    ).rejects.toThrow();

    const references = [...skillDocument.matchAll(/\]\((references\/[^)#]+)(?:#[^)]*)?\)/gu)].map(
      (match) => match[1]!,
    );
    expect(new Set(references)).toEqual(
      new Set([
        "references/boundary-design.md",
        "references/diagram-design.md",
        "references/map-authoring.md",
        "references/observations.md",
        "references/reconciliation.md",
      ]),
    );
    for (const reference of references) await access(path.join(skillDirectory, reference));
  });

  it("keeps every controlled case queryable and grounded in current evidence", async () => {
    const suite = await readEvaluationSuite();

    expect(suite.schemaVersion).toBe(1);
    expect(suite.cases.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "upstream-root-cause",
        "downstream-consumer",
        "missing-map-knowledge",
        "ambiguous-term",
        "missing-anchor",
        "stale-anchor",
        "contradicted-relation",
      ]),
    );

    for (const evaluationCase of suite.cases) {
      expect(evaluationCase.task.trim()).not.toBe("");
      expect(evaluationCase.oracle.conclusion.trim()).not.toBe("");

      for (const evidencePath of evaluationCase.requiredEvidence) {
        await access(path.join(fixtureRepository, evidencePath));
      }

      const searchResult = await runCli([
        "search",
        evaluationCase.selector,
        "--repo",
        fixtureRepository,
      ]);
      const searchEnvelope = JSON.parse(searchResult.stdout) as {
        readonly data: { readonly results: readonly { readonly id: string }[] };
      };

      if (evaluationCase.mapExpectation.outcome === "context") {
        expect(searchResult.exitCode, evaluationCase.id).toBe(0);
        expect(searchEnvelope.data.results[0], evaluationCase.id).toMatchObject({
          id: evaluationCase.mapExpectation.selectedId,
        });

        const contextResult = await runCli([
          "context",
          evaluationCase.mapExpectation.selectedId,
          "--repo",
          fixtureRepository,
        ]);
        const contextEnvelope = JSON.parse(contextResult.stdout) as Record<string, unknown>;
        expect(contextResult.exitCode, evaluationCase.id).toBe(0);
        expect(contextEnvelope, evaluationCase.id).toMatchObject({
          ok: true,
          data: {
            selected: { id: evaluationCase.mapExpectation.selectedId },
          },
        });
        await assertExpectedContext(
          contextEnvelope as unknown as ContextEnvelopeView,
          evaluationCase.mapExpectation,
          evaluationCase.id,
        );
      } else if (evaluationCase.mapExpectation.code === "CONCEPT_NOT_FOUND") {
        expect(searchResult.exitCode, evaluationCase.id).toBe(0);
        expect(searchEnvelope.data.results, evaluationCase.id).toEqual([]);
      } else {
        expect(searchResult.exitCode, evaluationCase.id).toBe(0);
        expect(searchEnvelope.data.results.length, evaluationCase.id).toBeGreaterThan(1);
      }
    }
  });
});

async function readEvaluationSuite(): Promise<EvaluationSuite> {
  const casesPath = path.join(projectRoot, "tests/fixtures/agent-skill/cases.json");
  return JSON.parse(await readFile(casesPath, "utf8")) as EvaluationSuite;
}

async function assertExpectedContext(
  envelope: ContextEnvelopeView,
  expectation: Extract<EvaluationCase["mapExpectation"], { readonly outcome: "context" }>,
  caseId: string,
): Promise<void> {
  if (expectation.anchorValues) {
    expect(
      envelope.data.selected.anchors.map(({ value }) => value),
      caseId,
    ).toEqual(expectation.anchorValues);
  }

  for (const relation of expectation.relations ?? []) {
    expect(envelope.data.relations, caseId).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: relation.type,
          from: relation.from,
          to: relation.to,
        }),
      ]),
    );
  }

  if (expectation.flowIds) {
    expect(
      envelope.data.flows.map(({ id }) => id),
      caseId,
    ).toEqual(expectation.flowIds);
  }

  for (const anchorPath of expectation.absentAnchorPaths ?? []) {
    await expect(access(path.join(fixtureRepository, anchorPath)), caseId).rejects.toThrow();
  }
}

function parseFrontmatter(document: string): Record<string, unknown> {
  const match = /^---\n([\s\S]+?)\n---\n/.exec(document);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "") as Record<string, unknown>;
}
