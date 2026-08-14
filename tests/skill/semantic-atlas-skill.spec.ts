import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const skillDirectory = join(repositoryRoot, ".agents", "skills", "semantic-atlas");
const skillPath = join(skillDirectory, "SKILL.md");

describe("Semantic Atlas Skill", () => {
  it("publishes focused discovery metadata", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toMatch(/^---\nname: semantic-atlas\n/mu);
    expect(skill).toMatch(/^description: .+project understanding.+impact analysis.+$/mu);
    expect(skill).toMatch(/^compatibility: .+Node\.js 22\.12.+24.+semantic-atlas.+$/mu);
  });

  it("defines the complete agent lifecycle and every CLI primitive", () => {
    const skill = readFileSync(skillPath, "utf8");

    for (const heading of [
      "## First use",
      "## Recurring task",
      "## Interpret Atlas results",
      "## Bounded source fallback",
      "## After source changes",
      "## Learn verified knowledge",
      "## Responsibility boundary",
    ]) {
      expect(skill).toContain(heading);
    }

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
  });

  it("routes every non-authoritative result to safe agent behavior", () => {
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

    expect(skill).toContain("Source code remains authoritative");
    expect(skill).toContain("owner-linked unknown boundary");
    expect(skill).toContain("fresh, exact evidence");
    expect(skill).toContain("current snapshot ID");
  });

  it("serializes commands against the worktree-local Atlas store", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toContain("Run one Atlas CLI command at a time");
    expect(skill).toMatch(/wait for its complete\s+response/u);
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
