import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PackageUpgradeError,
  SemanticAtlasPackageUpgrader,
  type PackageCommandResult,
  type PackageCommandRunner,
} from "../../src/setup/package-upgrader.js";

describe("SemanticAtlasPackageUpgrader", () => {
  it("installs the resolved stable version and delegates setup to that exact CLI", async () => {
    const runner = new ScriptedRunner([
      success('"1.0.0"\n'),
      success(),
      success("/global/lib/node_modules\n"),
      success("1.0.0\n"),
      success('{"ok":true,"command":"setup"}\n'),
    ]);
    const upgrader = new SemanticAtlasPackageUpgrader({
      currentVersion: "0.4.0",
      nodeExecutable: "/runtime/node",
      npmExecutable: "/runtime/npm",
      userHome: "/isolated/home",
    }, runner);

    await expect(upgrader.upgrade()).resolves.toEqual({
      outcome: "upgraded",
      previousVersion: "0.4.0",
      targetVersion: "1.0.0",
      skillDirectory: path.join(
        "/isolated/home",
        ".agents",
        "skills",
        "semantic-atlas",
      ),
    });
    expect(runner.invocations).toEqual([
      ["/runtime/npm", ["view", "semantic-atlas", "dist-tags.latest", "--json"]],
      ["/runtime/npm", ["install", "--global", "semantic-atlas@1.0.0"]],
      ["/runtime/npm", ["root", "--global"]],
      [
        "/runtime/node",
        ["/global/lib/node_modules/semantic-atlas/dist/cli/bin.js", "--version"],
      ],
      [
        "/runtime/node",
        ["/global/lib/node_modules/semantic-atlas/dist/cli/bin.js", "setup"],
      ],
    ]);
  });

  it("still verifies the installed CLI and repairs its Skill when already current", async () => {
    const runner = new ScriptedRunner([
      success('"1.0.0"\n'),
      success("/global/lib/node_modules\n"),
      success("1.0.0\n"),
      success('{"ok":true,"command":"setup"}\n'),
    ]);
    const upgrader = new SemanticAtlasPackageUpgrader({
      currentVersion: "1.0.0",
      nodeExecutable: "/runtime/node",
      npmExecutable: "/runtime/npm",
      userHome: "/isolated/home",
    }, runner);

    await expect(upgrader.upgrade()).resolves.toMatchObject({
      outcome: "current",
      targetVersion: "1.0.0",
    });
    expect(runner.invocations).not.toContainEqual([
      "/runtime/npm",
      ["install", "--global", "semantic-atlas@1.0.0"],
    ]);
    expect(runner.invocations.at(-1)).toEqual([
      "/runtime/node",
      ["/global/lib/node_modules/semantic-atlas/dist/cli/bin.js", "setup"],
    ]);
  });

  it("rejects a non-stable registry version before changing the installation", async () => {
    const runner = new ScriptedRunner([success('"1.0.0-rc.1"\n')]);
    const upgrader = new SemanticAtlasPackageUpgrader({
      currentVersion: "0.4.0",
      npmExecutable: "/runtime/npm",
    }, runner);

    await expect(upgrader.upgrade()).rejects.toMatchObject({
      step: "check",
    } satisfies Partial<PackageUpgradeError>);
    expect(runner.invocations).toHaveLength(1);
  });

  it("stops before setup when npm did not install the resolved identity", async () => {
    const runner = new ScriptedRunner([
      success('"1.0.0"\n'),
      success(),
      success("/global/lib/node_modules\n"),
      success("0.4.0\n"),
    ]);
    const upgrader = new SemanticAtlasPackageUpgrader({
      currentVersion: "0.4.0",
      nodeExecutable: "/runtime/node",
      npmExecutable: "/runtime/npm",
    }, runner);

    await expect(upgrader.upgrade()).rejects.toMatchObject({
      step: "verify",
    } satisfies Partial<PackageUpgradeError>);
    expect(runner.invocations).toHaveLength(4);
  });
});

class ScriptedRunner implements PackageCommandRunner {
  public readonly invocations: Array<readonly [string, readonly string[]]> = [];

  public constructor(private readonly results: readonly PackageCommandResult[]) {}

  public async run(
    executable: string,
    arguments_: readonly string[],
  ): Promise<PackageCommandResult> {
    this.invocations.push([executable, arguments_]);
    const result = this.results[this.invocations.length - 1];
    if (!result) throw new Error("Unexpected package command");
    return result;
  }
}

function success(stdout = ""): PackageCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}
