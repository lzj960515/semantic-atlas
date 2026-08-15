import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildFreshAgentInstructions,
  installCandidateSkill,
} from "../../scripts/evaluation/candidate-skill.js";

const executeFile = promisify(execFile);
const skillRoot = resolve(".agents/skills/semantic-atlas");

describe("Fresh Agent candidate Skill delivery", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it("keeps the candidate Skill body out of the task prompt", () => {
    const instructions = buildFreshAgentInstructions("Trace the invoice flow.");

    expect(instructions).toContain("Trace the invoice flow.");
    expect(instructions).not.toContain("available-semantic-atlas-skill");
    expect(instructions).not.toContain("# Semantic Atlas");
    expect(instructions).not.toMatch(/\bSkill\b/u);
    expect(instructions).toContain(
      "Treat the current working directory as the resolved exact fixture root",
    );
  });

  it("installs a discoverable repository Skill without changing visible Git state", async () => {
    const repository = await mkdtemp(join(tmpdir(), "atlas-candidate-skill-"));
    directories.push(repository);
    await writeFile(join(repository, "README.md"), "# Fixture\n");
    await git(repository, "init", "--quiet", "--initial-branch=main");
    await git(repository, "config", "user.name", "Semantic Atlas Tests");
    await git(repository, "config", "user.email", "tests@semantic-atlas.invalid");
    await git(repository, "add", "README.md");
    await git(repository, "commit", "--quiet", "-m", "test: initialize fixture");

    const installedPath = await installCandidateSkill(skillRoot, repository);

    expect(installedPath).toBe(join(repository, ".agents/skills/semantic-atlas/SKILL.md"));
    expect(await readFile(installedPath, "utf8")).toContain("name: semantic-atlas");
    expect(await git(repository, "status", "--short", "--untracked-files=all")).toBe("");
    expect(await git(repository, "check-ignore", ".agents/skills/semantic-atlas/SKILL.md"))
      .toContain(".agents/skills/semantic-atlas/SKILL.md");
  });
});

async function git(repository: string, ...arguments_: string[]): Promise<string> {
  const result = await executeFile("git", arguments_, { cwd: repository, encoding: "utf8" });
  return result.stdout;
}
