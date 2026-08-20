import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { SkillInstaller } from "../../src/setup/skill-installer.js";

describe("SkillInstaller", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it("installs, migrates, verifies, and updates the bundled Semantic Atlas Skill", async () => {
    const source = await temporaryDirectory("semantic-atlas-skill-source-");
    const userHome = await temporaryDirectory("semantic-atlas-skill-home-");
    await createSkill(source, "first version");
    const legacy = join(userHome, ".codex", "skills", "semantic-atlas");
    await createSkill(legacy, "legacy version");

    const first = await new SkillInstaller({
      sourceDirectory: source,
      userHome,
      version: "0.2.0",
    }).install();
    const target = join(userHome, ".agents", "skills", "semantic-atlas");

    expect(first).toEqual({
      outcome: "installed",
      targetDirectory: target,
      removedLegacyDirectories: [legacy],
    });
    expect(await readFile(join(target, "SKILL.md"), "utf8")).toContain("first version");
    await expect(readFile(join(legacy, "SKILL.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(
      join(target, ".semantic-atlas-managed.json"),
      "utf8",
    ))).toMatchObject({ version: "0.2.0", fingerprint: expect.any(String) });

    await expect(new SkillInstaller({
      sourceDirectory: source,
      userHome,
      version: "0.2.0",
    }).install()).resolves.toMatchObject({ outcome: "current" });

    await createSkill(source, "second version");
    const updated = await new SkillInstaller({
      sourceDirectory: source,
      userHome,
      version: "0.2.1",
    }).install();
    expect(updated.outcome).toBe("updated");
    expect(await readFile(join(target, "SKILL.md"), "utf8")).toContain("second version");
    expect(JSON.parse(await readFile(
      join(target, ".semantic-atlas-managed.json"),
      "utf8",
    ))).toMatchObject({ version: "0.2.1" });
  });

  it("rejects unrelated directories before changing either installation location", async () => {
    const source = await temporaryDirectory("semantic-atlas-skill-source-");
    const userHome = await temporaryDirectory("semantic-atlas-skill-home-");
    await createSkill(source, "bundled version");
    const legacy = join(userHome, ".codex", "skills", "semantic-atlas");
    await mkdir(legacy, { recursive: true });
    await writeFile(
      join(legacy, "SKILL.md"),
      "---\nname: another-skill\ndescription: local content\n---\n",
      "utf8",
    );
    const target = join(userHome, ".agents", "skills", "semantic-atlas");

    await expect(new SkillInstaller({
      sourceDirectory: source,
      userHome,
      version: "0.2.0",
    }).install()).rejects.toThrow(legacy);
    await expect(readFile(join(target, "SKILL.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(legacy, "SKILL.md"), "utf8")).toContain("another-skill");
  });

  async function temporaryDirectory(prefix: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), prefix));
    temporaryDirectories.push(directory);
    return directory;
  }
});

async function createSkill(directory: string, description: string): Promise<void> {
  await mkdir(join(directory, "references"), { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    `---\nname: semantic-atlas\ndescription: ${description}\n---\n`,
    "utf8",
  );
  await writeFile(join(directory, "references", "guide.md"), `${description}\n`, "utf8");
}
