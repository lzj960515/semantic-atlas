import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const skillDirectory = join(repositoryRoot, ".agents", "skills", "semantic-atlas-insights");
const skillPath = join(skillDirectory, "SKILL.md");

describe("Semantic Atlas Insights Skill", () => {
  it("keeps product maintenance separate from normal business-understanding work", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toMatch(/^---\nname: semantic-atlas-insights\n/mu);
    expect(skill).toContain("daily operational review");
    expect(skill).toContain("routine development work");
    expect(skill).toContain("source confirmation");
  });

  it("defines a bounded daily review and durable triage workflow", () => {
    const skill = readFileSync(skillPath, "utf8");

    expect(skill).toContain("semantic-atlas insights summary --period yesterday");
    expect(skill).toContain("semantic-atlas insights feedback --period yesterday --status new");
    expect(skill).toContain("semantic-atlas insights feedback update");
    for (const status of ["triaged", "resolved", "dismissed"]) {
      expect(skill).toContain(`\`${status}\``);
    }
    expect(skill).toContain("command arguments");
    expect(skill).toContain("prompts");
    expect(skill).not.toMatch(/(?:\/Users\/|apps\/)/u);
  });
});
