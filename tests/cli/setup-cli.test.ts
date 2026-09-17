import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCliRuntime, runCli, type CliRuntime } from "../../src/cli/run-cli.js";
import { SemanticAtlasPackageUpgrader } from "../../src/setup/package-upgrader.js";
import { ManagedSkillsInstaller } from "../../src/setup/managed-skill-installer.js";

const sandboxes: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    sandboxes.splice(0).map((sandbox) => rm(sandbox, { recursive: true, force: true })),
  );
});

describe("managed Skill conflict recovery", () => {
  it.each(["en", "zh-CN"])(
    "preserves the conflicting Skill and carries %s recovery guidance through upgrade",
    async (language) => {
      vi.stubEnv("SEMANTIC_ATLAS_LANG", language);
      const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-conflict-"));
      sandboxes.push(sandbox);
      const userHome = path.join(sandbox, "home");
      const directory = path.join(userHome, ".agents", "skills", "semantic-atlas");
      const skillFile = path.join(directory, "SKILL.md");
      const userContent = "---\nname: semantic-atlas\n---\n# User-owned workflow\n";
      await mkdir(directory, { recursive: true });
      await writeFile(skillFile, userContent);
      const baseRuntime = await createCliRuntime({ userHome });
      const installer = new ManagedSkillsInstaller({
        userHome,
        packageIdentity: baseRuntime.packageIdentity,
      });
      const runtime = { ...baseRuntime, installSkills: () => installer.install() };

      const setup = await runCli(["setup"], runtime);
      expect(setup.exitCode).toBe(1);
      const setupError = JSON.parse(setup.stdout).error;
      expect(setupError).toMatchObject({ code: "MANAGED_SKILL_CONFLICT", directory });
      expect(setupError.message).toContain(".semantic-atlas-managed.json");
      expect(setupError.message).toContain("semantic-atlas setup");
      expect(setupError.message).toContain(
        language === "en" ? "outside the Skills directory" : "Skills 目录之外",
      );
      expect(await readFile(skillFile, "utf8")).toBe(userContent);

      const upgrade = await runCli(["upgrade"], upgradeRuntime(runtime));
      expect(upgrade.exitCode).toBe(1);
      expect(JSON.parse(upgrade.stdout).error).toMatchObject({
        code: "UPGRADE_FAILED",
        step: "setup",
        message: expect.stringContaining("MANAGED_SKILL_CONFLICT"),
      });
      expect(JSON.parse(upgrade.stdout).error.message).toContain("semantic-atlas setup");
      expect(await readFile(skillFile, "utf8")).toBe(userContent);

      // 手动保留用户副本后，重试已安装 CLI 的 setup，无需再次安装包。
      const preservedDirectory = path.join(sandbox, "preserved-skill");
      await rename(directory, preservedDirectory);
      const recovered = await runCli(["setup"], runtime);
      expect(recovered.exitCode).toBe(0);
      expect(JSON.parse(recovered.stdout).data.skills).toHaveLength(2);
      expect(await readFile(path.join(preservedDirectory, "SKILL.md"), "utf8")).toBe(userContent);
      expect(
        JSON.parse(await readFile(path.join(directory, ".semantic-atlas-managed.json"), "utf8")),
      ).toMatchObject({
        schemaVersion: 1,
        skillName: "semantic-atlas",
        managedBy: "semantic-atlas",
      });
      expect((await runCli(["setup"], runtime)).exitCode).toBe(0);
    },
  );
});

function upgradeRuntime(runtime: CliRuntime): CliRuntime {
  const version = runtime.packageIdentity.version;
  const upgrader = new SemanticAtlasPackageUpgrader(
    { currentVersion: version },
    {
      async run(_executable, arguments_) {
        if (arguments_[0] === "view")
          return { exitCode: 0, stdout: JSON.stringify(version), stderr: "" };
        if (arguments_[0] === "root")
          return { exitCode: 0, stdout: "/isolated/node_modules", stderr: "" };
        if (arguments_.at(-1) === "--version") return { exitCode: 0, stdout: version, stderr: "" };
        if (arguments_.at(-1) === "setup") {
          const result = await runCli(["setup"], runtime);
          return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
        }
        throw new Error("Unexpected package command in isolated upgrade");
      },
    },
  );
  return { ...runtime, upgradePackage: () => upgrader.upgrade() };
}
