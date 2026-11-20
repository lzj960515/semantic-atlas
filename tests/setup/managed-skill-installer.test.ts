import { afterEach, describe, expect, it } from "vitest";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ManagedSkillConflictError,
  ManagedSkillInstaller,
  ManagedSkillsInstaller,
} from "../../src/setup/managed-skill-installer.js";

const sandboxes: string[] = [];
const packageIdentity = {
  name: "semantic-atlas-next",
  version: "0.0.0",
} as const;

afterEach(async () => {
  await Promise.all(
    sandboxes.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("ManagedSkillInstaller", () => {
  it("installs one shared Skill and removes obsolete workflows from agent discovery", async () => {
    const fixture = await createBundleFixture();
    const legacyDirectory = path.join(
      fixture.userHome,
      ".agents/skills/semantic-atlas-maintenance",
    );
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(
      path.join(legacyDirectory, "SKILL.md"),
      skillDocumentForName("old workflow", "semantic-atlas-maintenance"),
    );
    const oldClaudeSkill = path.join(fixture.userHome, ".claude/skills/semantic-atlas");
    await mkdir(oldClaudeSkill, { recursive: true });
    await writeFile(path.join(oldClaudeSkill, "SKILL.md"), skillDocument("old reader"));
    const renamedCopy = path.join(fixture.userHome, ".agents/skills/archived-atlas-copy");
    await mkdir(renamedCopy, { recursive: true });
    await writeFile(path.join(renamedCopy, "SKILL.md"), skillDocument("renamed old reader"));
    const unrelated = path.join(fixture.userHome, ".codex/skills/project-notes");
    await mkdir(unrelated, { recursive: true });
    await writeFile(path.join(unrelated, "keep.txt"), "personal notes\n");
    const installer = new ManagedSkillsInstaller({
      packageIdentity,
      sourceRoot: fixture.sourceRoot,
      userHome: fixture.userHome,
    });

    const installed = await installer.install();
    expect(installed.skills).toMatchObject([
      {
        outcome: "installed",
        identity: { skillName: "semantic-atlas", packageVersion: "0.0.0" },
      },
    ]);
    expect(installed.skills).toHaveLength(1);
    await expect(access(legacyDirectory)).rejects.toThrow();
    await expect(access(renamedCopy)).rejects.toThrow();
    const canonical = path.join(fixture.userHome, ".agents/skills/semantic-atlas");
    expect(await realpath(oldClaudeSkill)).toBe(await realpath(canonical));
    expect(await realpath(path.join(fixture.userHome, ".codex/skills/semantic-atlas"))).toBe(
      await realpath(canonical),
    );
    expect(await readFile(path.join(unrelated, "keep.txt"), "utf8")).toBe("personal notes\n");
    expect((await installer.install()).skills).toMatchObject([
      { outcome: "current", identity: { skillName: "semantic-atlas" } },
    ]);
  });

  it("keeps the canonical Skill when Claude shares the entire Agents discovery root", async () => {
    const fixture = await createBundleFixture();
    const agentsRoot = path.join(fixture.userHome, ".agents/skills");
    await mkdir(agentsRoot, { recursive: true });
    await mkdir(path.join(fixture.userHome, ".claude"), { recursive: true });
    await symlink(agentsRoot, path.join(fixture.userHome, ".claude/skills"), "junction");
    const installer = new ManagedSkillsInstaller({
      packageIdentity,
      sourceRoot: fixture.sourceRoot,
      userHome: fixture.userHome,
    });
    await installer.install();
    await installer.install();
    expect(await readFile(path.join(agentsRoot, "semantic-atlas/SKILL.md"), "utf8")).toBe(
      skillDocument("primary workflow"),
    );
  });

  it("installs, verifies, and repairs the package-owned Skill", async () => {
    const fixture = await createFixture();
    const installer = new ManagedSkillInstaller({
      packageIdentity,
      sourceDirectory: fixture.sourceDirectory,
      userHome: fixture.userHome,
    });

    const installed = await installer.install();
    expect(installed).toMatchObject({
      outcome: "installed",
      targetDirectory: fixture.targetDirectory,
      identity: {
        packageName: packageIdentity.name,
        packageVersion: packageIdentity.version,
        skillName: "semantic-atlas",
      },
    });
    expect(installed.identity.fingerprint).toMatch(/^[a-f0-9]{64}$/u);
    await expect(readManagedMarker(fixture.targetDirectory)).resolves.toEqual({
      schemaVersion: 1,
      managedBy: "semantic-atlas",
      packageName: packageIdentity.name,
      packageVersion: packageIdentity.version,
      skillName: "semantic-atlas",
      fingerprint: installed.identity.fingerprint,
    });

    await expect(installer.install()).resolves.toMatchObject({ outcome: "current" });

    await writeFile(path.join(fixture.targetDirectory, "SKILL.md"), "modified managed copy\n");
    await expect(installer.install()).resolves.toMatchObject({ outcome: "repaired" });
    await expect(readFile(path.join(fixture.targetDirectory, "SKILL.md"), "utf8")).resolves.toBe(
      skillDocument("current bundled workflow"),
    );
  });

  it("refuses to replace an unrelated same-named directory", async () => {
    const fixture = await createFixture();
    await mkdir(fixture.targetDirectory, { recursive: true });
    const unrelatedDocument = skillDocumentForName("user-owned workflow", "project-notes");
    await writeFile(path.join(fixture.targetDirectory, "SKILL.md"), unrelatedDocument);

    const installer = new ManagedSkillInstaller({
      packageIdentity,
      sourceDirectory: fixture.sourceDirectory,
      userHome: fixture.userHome,
    });

    await expect(installer.install()).rejects.toBeInstanceOf(ManagedSkillConflictError);
    await expect(readFile(path.join(fixture.targetDirectory, "SKILL.md"), "utf8")).resolves.toBe(
      unrelatedDocument,
    );
  });

  it("requires the bundled Skill identity in frontmatter", async () => {
    const fixture = await createFixture();
    await writeFile(
      path.join(fixture.sourceDirectory, "SKILL.md"),
      "---\nname: another-skill\ndescription: wrong payload\n---\n\nname: semantic-atlas\n",
    );
    const installer = new ManagedSkillInstaller({
      packageIdentity,
      sourceDirectory: fixture.sourceDirectory,
      userHome: fixture.userHome,
    });

    await expect(installer.install()).rejects.toThrow("is not the 'semantic-atlas' Skill");
    await expect(access(fixture.targetDirectory)).rejects.toThrow();
  });

  it("upgrades a recognized Skill carrying an obsolete marker", async () => {
    const fixture = await createFixture();
    await mkdir(fixture.targetDirectory, { recursive: true });
    await writeFile(
      path.join(fixture.targetDirectory, "SKILL.md"),
      skillDocument("legacy managed workflow"),
    );
    await writeFile(
      path.join(fixture.targetDirectory, ".semantic-atlas-managed.json"),
      `${JSON.stringify(
        {
          version: "0.4.0",
          fingerprint: "a".repeat(64),
        },
        null,
        2,
      )}\n`,
    );

    const installer = new ManagedSkillInstaller({
      packageIdentity,
      sourceDirectory: fixture.sourceDirectory,
      userHome: fixture.userHome,
    });
    await expect(installer.install()).resolves.toMatchObject({ outcome: "upgraded" });
    await expect(
      readFile(path.join(fixture.targetDirectory, ".semantic-atlas-managed.json"), "utf8"),
    ).resolves.toContain('"packageVersion": "0.0.0"');
  });

  it("recovers an interrupted replacement of a current managed Skill", async () => {
    const fixture = await createFixture();
    const installer = new ManagedSkillInstaller({
      packageIdentity,
      sourceDirectory: fixture.sourceDirectory,
      userHome: fixture.userHome,
    });
    await installer.install();

    const backupDirectory = `${fixture.targetDirectory}.backup`;
    const orphanStage = `${fixture.targetDirectory}.installing-interrupted`;
    await rename(fixture.targetDirectory, backupDirectory);
    await mkdir(orphanStage);
    await writeFile(path.join(orphanStage, "partial.txt"), "partial replacement\n");
    await copyManagedMarker(backupDirectory, orphanStage);

    await expect(installer.install()).resolves.toMatchObject({ outcome: "recovered" });
    await expect(readFile(path.join(fixture.targetDirectory, "SKILL.md"), "utf8")).resolves.toBe(
      skillDocument("current bundled workflow"),
    );
    await expect(access(backupDirectory)).rejects.toThrow();
    await expect(access(orphanStage)).rejects.toThrow();
  });

  it("restores the previous managed copy when activation fails", async () => {
    const fixture = await createFixture();
    const installer = new ManagedSkillInstaller({
      packageIdentity,
      sourceDirectory: fixture.sourceDirectory,
      userHome: fixture.userHome,
    });
    await installer.install();
    const previousDocument = await readFile(path.join(fixture.targetDirectory, "SKILL.md"), "utf8");
    await writeFile(
      path.join(fixture.sourceDirectory, "SKILL.md"),
      skillDocument("replacement workflow"),
    );

    const failingInstaller = new ManagedSkillInstaller(
      {
        packageIdentity,
        sourceDirectory: fixture.sourceDirectory,
        userHome: fixture.userHome,
      },
      {
        moveDirectory: async (source, target) => {
          if (source.includes(".installing-") && target === fixture.targetDirectory) {
            throw new Error("simulated activation failure");
          }
          await rename(source, target);
        },
      },
    );

    await expect(failingInstaller.install()).rejects.toThrow("simulated activation failure");
    await expect(readFile(path.join(fixture.targetDirectory, "SKILL.md"), "utf8")).resolves.toBe(
      previousDocument,
    );
    await expect(access(`${fixture.targetDirectory}.backup`)).rejects.toThrow();
  });

  it("preserves recovery-shaped directories without managed ownership", async () => {
    const fixture = await createFixture();
    const installer = new ManagedSkillInstaller({
      packageIdentity,
      sourceDirectory: fixture.sourceDirectory,
      userHome: fixture.userHome,
    });
    await installer.install();
    const unrelatedBackup = `${fixture.targetDirectory}.backup`;
    const unrelatedStage = `${fixture.targetDirectory}.installing-user-owned`;
    await mkdir(unrelatedStage);
    await writeFile(path.join(unrelatedStage, "keep.txt"), "stage-owned-by-user\n");

    await expect(installer.install()).resolves.toMatchObject({ outcome: "current" });
    await expect(readFile(path.join(unrelatedStage, "keep.txt"), "utf8")).resolves.toBe(
      "stage-owned-by-user\n",
    );

    await mkdir(unrelatedBackup);
    await writeFile(path.join(unrelatedBackup, "keep.txt"), "backup-owned-by-user\n");

    await expect(installer.install()).rejects.toMatchObject({
      directory: unrelatedBackup,
    } satisfies Partial<ManagedSkillConflictError>);
    await expect(readFile(path.join(unrelatedBackup, "keep.txt"), "utf8")).resolves.toBe(
      "backup-owned-by-user\n",
    );
  });
});

async function createFixture(): Promise<{
  readonly sourceDirectory: string;
  readonly userHome: string;
  readonly targetDirectory: string;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-setup-"));
  sandboxes.push(sandbox);
  const sourceDirectory = path.join(sandbox, "package-skill");
  const userHome = path.join(sandbox, "home");
  const targetDirectory = path.join(userHome, ".agents", "skills", "semantic-atlas");
  await mkdir(path.join(sourceDirectory, "references"), { recursive: true });
  await writeFile(
    path.join(sourceDirectory, "SKILL.md"),
    skillDocument("current bundled workflow"),
  );
  await writeFile(path.join(sourceDirectory, "references", "workflow.md"), "# Current workflow\n");
  return { sourceDirectory, userHome, targetDirectory };
}

async function createBundleFixture(): Promise<{
  readonly sourceRoot: string;
  readonly userHome: string;
}> {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-setup-bundle-"));
  sandboxes.push(sandbox);
  const sourceRoot = path.join(sandbox, "package-skills");
  const userHome = path.join(sandbox, "home");
  const primaryDirectory = path.join(sourceRoot, "semantic-atlas");
  await mkdir(primaryDirectory, { recursive: true });
  await writeFile(path.join(primaryDirectory, "SKILL.md"), skillDocument("primary workflow"));
  return { sourceRoot, userHome };
}

function skillDocument(description: string): string {
  return skillDocumentForName(description, "semantic-atlas");
}

function skillDocumentForName(description: string, name: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# Semantic Atlas\n`;
}

async function readManagedMarker(directory: string): Promise<unknown> {
  return JSON.parse(
    await readFile(path.join(directory, ".semantic-atlas-managed.json"), "utf8"),
  ) as unknown;
}

async function copyManagedMarker(sourceDirectory: string, targetDirectory: string): Promise<void> {
  await writeFile(
    path.join(targetDirectory, ".semantic-atlas-managed.json"),
    await readFile(path.join(sourceDirectory, ".semantic-atlas-managed.json"), "utf8"),
  );
}
