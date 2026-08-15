import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const skillDirectory = join(repositoryRoot, ".agents", "skills", "semantic-atlas");
const skillPath = join(skillDirectory, "SKILL.md");

describe("Semantic Atlas Skill", () => {
  it("activates for business behavior work and bounds neighboring tasks", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toMatch(/^---\nname: semantic-atlas\n/mu);
    const description = skill.match(/^description: (.+)$/mu)?.[1] ?? "";
    for (const trigger of [
      "feature implementation",
      "bug fixing",
      "debugging",
      "refactoring",
      "behavior-changing review",
      "business-flow tracing",
      "invariant and test discovery",
      "dependency or impact analysis",
    ]) {
      expect(description).toContain(trigger);
    }
    for (const negativeControl of [
      "Git-only release work",
      "mechanical formatting",
      "unrelated documentation",
      "unsupported repositories",
    ]) {
      expect(description).toContain(negativeControl);
    }
    expect(skill).toMatch(/^compatibility: .+Node\.js 22\.12.+24.+semantic-atlas.+$/mu);
  });

  it("defines one required loop without an always-loaded first-use procedure", () => {
    const skill = readFileSync(skillPath, "utf8");

    for (const heading of [
      "## Required business-understanding loop",
      "## Query before broad source discovery",
      "## After source changes",
      "## Knowledge-capture decision",
      "## Conditional references",
      "## Responsibility boundary",
    ]) {
      expect(skill).toContain(heading);
    }
    expect(skill).not.toContain("## First use");

    for (const command of [
      "semantic-atlas status",
      "semantic-atlas index",
      "semantic-atlas map roots",
      "semantic-atlas map search",
      "semantic-atlas map children",
      "semantic-atlas map show",
      "semantic-atlas changes",
      "semantic-atlas learn --stdin",
    ]) {
      expect(skill).toContain(command);
    }

    expect(skill).toContain("exact target Git worktree");
    expect(skill).toContain("Run one Atlas CLI command at a time");
    expect(skill).toMatch(/status[\s\S]+before broad source/iu);
    expect(skill).toContain("confirm decisive behavior in authoritative source");
  });

  it("loads state-specific procedures only after observing their trigger", () => {
    const skill = readFileSync(skillPath, "utf8");

    for (const state of [
      "missing",
      "stale",
      "hypothesis",
      "unknown",
      "unsupported",
      "insufficient",
      "partial",
    ]) {
      expect(skill).toContain(`\`${state}\``);
    }

    expect(skill).toContain("references/snapshot-bootstrap.md");
    expect(skill).toContain("references/result-routing.md");
    expect(skill).toContain("references/graph-patch.md");
    expect(skill).toMatch(/Read \[snapshot bootstrap\].+only/iu);
    expect(skill).toMatch(/Read \[result routing\].+only/iu);
    expect(skill).toMatch(/Read \[GraphPatch authoring\].+only/iu);
    expect(skill).toContain("Source code remains authoritative");
    expect(skill).toContain("owner-linked unknown boundary");
    expect(skill).toContain("relevant structural nodes but no relevant business");
  });

  it("keeps GraphPatch structural links on declaration targets", () => {
    const graphPatch = readFileSync(
      join(skillDirectory, "references", "graph-patch.md"),
      "utf8",
    );

    expect(graphPatch).toContain("`Symbol` or `Test` declaration");
    expect(graphPatch).toMatch(/A `File` or\s+`Module` is navigation context/u);
    expect(graphPatch).toContain('"op": "upsert"');
    expect(graphPatch).toContain('"domain": "business"');
    expect(graphPatch).toContain('"domain": "structural"');
  });

  it("serializes commands against the worktree-local Atlas store", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toContain("Run one Atlas CLI command at a time");
    expect(skill).toMatch(/wait for its complete\s+response/u);
  });

  it("requires durable verified discoveries to become reusable knowledge", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toContain("Before completing every supported task");
    for (const kind of [
      "Capability",
      "Scenario",
      "Operation",
      "Invariant",
      "Interface",
      "Data",
    ]) {
      expect(skill).toContain(`\`${kind}\``);
    }
    expect(skill).toContain("every new durable, verified");
    expect(skill).toContain("semantic-atlas learn --stdin");
    expect(skill).toMatch(/semantic-atlas map show[\s\S]+reusable/iu);
    expect(skill).toContain("transient or unverified observations");
  });

  it("keeps engineering work and repository facts outside the Skill", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toContain("natural-language reasoning");
    expect(skill).toContain("source editing, tests, Git operations, and review");
    expect(skill).toContain("Atlas data");
    expect(skill).not.toContain("Pietra");
  });

  it("keeps all local references valid", () => {
    const skill = readFileSync(skillPath, "utf8");
    const links = [...skill.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)]
      .map((match) => match[1]!)
      .filter((target) => !target.includes("://") && !target.startsWith("#"));

    expect(links.length).toBeGreaterThan(0);
    for (const target of links) {
      expect(() => readFileSync(resolve(dirname(skillPath), target), "utf8")).not.toThrow();
    }
  });
});
