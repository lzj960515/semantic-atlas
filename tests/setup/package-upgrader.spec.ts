import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  SemanticAtlasPackageUpgrader,
  resolveNpmCommandInvocation,
  type PackageCommandResult,
  type PackageCommandRunner,
} from "../../src/setup/package-upgrader.js";

describe("SemanticAtlasPackageUpgrader", () => {
  it("launches npm through the Windows command interpreter", () => {
    expect(resolveNpmCommandInvocation(["view", "semantic-atlas"], {
      platform: "win32",
      commandShell: "C:\\Windows\\System32\\cmd.exe",
    })).toEqual({
      executable: "C:\\Windows\\System32\\cmd.exe",
      arguments: ["/d", "/s", "/c", "npm.cmd", "view", "semantic-atlas"],
    });
  });

  it("installs the resolved latest release and synchronizes the new package's Skill", async () => {
    const globalRoot = join("", "global", "node_modules");
    const runner = new RecordedPackageCommandRunner([
      succeeded('"0.3.0"\n'),
      succeeded(),
      succeeded(`${globalRoot}\n`),
      succeeded("0.3.0\n"),
      succeeded("Installed Semantic Atlas Skill\n"),
    ]);
    const installCurrentSkill = vi.fn();

    const result = await new SemanticAtlasPackageUpgrader({
      currentVersion: "0.2.0",
      npmExecutable: "npm-test",
      nodeExecutable: "node-test",
      userHome: join("", "users", "atlas"),
      installCurrentSkill,
    }, runner).upgrade();

    const installedCli = join(
      globalRoot,
      "semantic-atlas",
      "dist",
      "cli",
      "bin.js",
    );
    expect(result).toEqual({
      outcome: "upgraded",
      previousVersion: "0.2.0",
      targetVersion: "0.3.0",
      skillDirectory: join("", "users", "atlas", ".agents", "skills", "semantic-atlas"),
    });
    expect(runner.invocations).toEqual([
      { executable: "npm-test", arguments: ["view", "semantic-atlas", "dist-tags.latest", "--json"] },
      { executable: "npm-test", arguments: ["install", "--global", "semantic-atlas@0.3.0"] },
      { executable: "npm-test", arguments: ["root", "--global"] },
      { executable: "node-test", arguments: [installedCli, "--version"] },
      { executable: "node-test", arguments: [installedCli, "setup"] },
    ]);
    expect(installCurrentSkill).not.toHaveBeenCalled();
  });

  it("repairs the managed Skill without reinstalling an already current package", async () => {
    const runner = new RecordedPackageCommandRunner([succeeded('"0.2.0"\n')]);
    const installCurrentSkill = vi.fn().mockResolvedValue(undefined);

    const result = await new SemanticAtlasPackageUpgrader({
      currentVersion: "0.2.0",
      npmExecutable: "npm-test",
      userHome: join("", "users", "atlas"),
      installCurrentSkill,
    }, runner).upgrade();

    expect(result.outcome).toBe("current");
    expect(result.targetVersion).toBe("0.2.0");
    expect(runner.invocations).toHaveLength(1);
    expect(installCurrentSkill).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "package installation",
      results: [succeeded('"0.3.0"\n'), failed("registry unavailable")],
      expectedStep: "install",
    },
    {
      name: "new-package Skill synchronization",
      results: [
        succeeded('"0.3.0"\n'),
        succeeded(),
        succeeded("/global/node_modules\n"),
        succeeded("0.3.0\n"),
        failed("managed Skill conflict"),
      ],
      expectedStep: "setup",
    },
  ])("fails the command when $name fails", async ({ results, expectedStep }) => {
    const runner = new RecordedPackageCommandRunner(results);

    await expect(new SemanticAtlasPackageUpgrader({
      currentVersion: "0.2.0",
      npmExecutable: "npm-test",
      nodeExecutable: "node-test",
    }, runner).upgrade()).rejects.toMatchObject({ step: expectedStep });
  });

  it("rejects an invalid registry version before installing anything", async () => {
    const runner = new RecordedPackageCommandRunner([succeeded('"latest"\n')]);

    await expect(new SemanticAtlasPackageUpgrader({
      currentVersion: "0.2.0",
      npmExecutable: "npm-test",
    }, runner).upgrade()).rejects.toThrow("valid package version");
    expect(runner.invocations).toHaveLength(1);
  });

  it("does not run setup when the installed CLI does not match the resolved release", async () => {
    const runner = new RecordedPackageCommandRunner([
      succeeded('"0.3.0"\n'),
      succeeded(),
      succeeded("/global/node_modules\n"),
      succeeded("0.2.9\n"),
    ]);

    await expect(new SemanticAtlasPackageUpgrader({
      currentVersion: "0.2.0",
      npmExecutable: "npm-test",
      nodeExecutable: "node-test",
    }, runner).upgrade()).rejects.toMatchObject({ step: "verify" });
    expect(runner.invocations).toHaveLength(4);
  });
});

function succeeded(stdout = ""): PackageCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function failed(stderr: string): PackageCommandResult {
  return { exitCode: 1, stdout: "", stderr };
}

class RecordedPackageCommandRunner implements PackageCommandRunner {
  readonly invocations: Array<{
    readonly executable: string;
    readonly arguments: readonly string[];
  }> = [];

  constructor(private readonly results: readonly PackageCommandResult[]) {}

  async run(executable: string, arguments_: readonly string[]): Promise<PackageCommandResult> {
    this.invocations.push({ executable, arguments: arguments_ });
    const result = this.results[this.invocations.length - 1];
    if (result === undefined) {
      throw new Error("Unexpected package command invocation");
    }
    return result;
  }
}
