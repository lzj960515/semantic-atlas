import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

import { SkillInstaller } from "./skill-installer.js";

const packageName = "semantic-atlas";
const maximumCapturedOutputLength = 64 * 1_024;
const packageVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export type PackageUpgradeStep = "check" | "install" | "locate" | "verify" | "setup";

export interface PackageCommandResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

export interface PackageCommandRunner {
  run(
    executable: string,
    arguments_: readonly string[],
    environment?: NodeJS.ProcessEnv,
  ): Promise<PackageCommandResult>;
}

export interface NpmCommandRuntime {
  readonly platform: NodeJS.Platform;
  readonly commandShell?: string;
  readonly npmExecutable?: string;
}

export interface NpmCommandInvocation {
  readonly executable: string;
  readonly arguments: readonly string[];
}

export interface SemanticAtlasPackageUpgraderOptions {
  readonly currentVersion: string;
  readonly npmExecutable?: string;
  readonly nodeExecutable?: string;
  readonly userHome?: string;
  readonly installCurrentSkill?: () => Promise<unknown>;
}

export interface PackageUpgradeResult {
  readonly outcome: "current" | "upgraded";
  readonly previousVersion: string;
  readonly targetVersion: string;
  readonly skillDirectory: string;
}

export class PackageUpgradeError extends Error {
  override readonly name = "PackageUpgradeError";

  constructor(
    readonly step: PackageUpgradeStep,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class SemanticAtlasPackageUpgrader {
  readonly #currentVersion: string;
  readonly #nodeExecutable: string;
  readonly #userHome: string;
  readonly #installCurrentSkill: () => Promise<unknown>;
  readonly #npmRuntime: NpmCommandRuntime;

  constructor(
    options: SemanticAtlasPackageUpgraderOptions,
    private readonly runner: PackageCommandRunner = new SpawnPackageCommandRunner(),
  ) {
    this.#currentVersion = options.currentVersion;
    this.#nodeExecutable = options.nodeExecutable ?? process.execPath;
    this.#userHome = options.userHome ?? homedir();
    this.#npmRuntime = {
      platform: process.platform,
      ...(process.env.ComSpec === undefined ? {} : { commandShell: process.env.ComSpec }),
      ...(options.npmExecutable === undefined ? {} : { npmExecutable: options.npmExecutable }),
    };
    this.#installCurrentSkill = options.installCurrentSkill ?? (() => (
      new SkillInstaller({ version: this.#currentVersion, userHome: this.#userHome }).install()
    ));
  }

  async upgrade(): Promise<PackageUpgradeResult> {
    const targetVersion = await this.latestVersion();
    if (targetVersion === this.#currentVersion) {
      await this.synchronizeCurrentSkill();
      return this.result("current", targetVersion);
    }

    await this.install(targetVersion);
    const installedCli = await this.installedCliPath();
    await this.verifyInstalledVersion(installedCli, targetVersion);
    await this.synchronizeInstalledSkill(installedCli);
    return this.result("upgraded", targetVersion);
  }

  private async latestVersion(): Promise<string> {
    const result = await this.runNpmChecked(
      "check",
      ["view", packageName, "dist-tags.latest", "--json"],
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new PackageUpgradeError(
        "check",
        "npm did not return the latest Semantic Atlas release as JSON",
        { cause: error },
      );
    }
    if (typeof parsed !== "string" || !packageVersionPattern.test(parsed)) {
      throw new PackageUpgradeError(
        "check",
        "npm did not return a valid package version for Semantic Atlas",
      );
    }
    return parsed;
  }

  private async install(targetVersion: string): Promise<void> {
    await this.runNpmChecked(
      "install",
      ["install", "--global", `${packageName}@${targetVersion}`],
    );
  }

  private async installedCliPath(): Promise<string> {
    const result = await this.runNpmChecked(
      "locate",
      ["root", "--global"],
    );
    const globalRoot = result.stdout.trim();
    if (globalRoot.length === 0) {
      throw new PackageUpgradeError("locate", "npm did not return its global package root");
    }
    return join(globalRoot, packageName, "dist", "cli", "bin.js");
  }

  private async verifyInstalledVersion(installedCli: string, targetVersion: string): Promise<void> {
    const result = await this.runChecked(
      "verify",
      this.#nodeExecutable,
      [installedCli, "--version"],
    );
    const installedVersion = result.stdout.trim();
    if (installedVersion !== targetVersion) {
      throw new PackageUpgradeError(
        "verify",
        `npm installed Semantic Atlas ${installedVersion || "with no readable version"}; expected ${targetVersion}`,
      );
    }
  }

  private async synchronizeCurrentSkill(): Promise<void> {
    try {
      await this.#installCurrentSkill();
    } catch (error) {
      throw new PackageUpgradeError(
        "setup",
        `The current Semantic Atlas Skill could not be synchronized: ${errorMessage(error)}`,
        error instanceof Error ? { cause: error } : undefined,
      );
    }
  }

  private async synchronizeInstalledSkill(installedCli: string): Promise<void> {
    await this.runChecked(
      "setup",
      this.#nodeExecutable,
      [installedCli, "setup"],
    );
  }

  private result(
    outcome: PackageUpgradeResult["outcome"],
    targetVersion: string,
  ): PackageUpgradeResult {
    return {
      outcome,
      previousVersion: this.#currentVersion,
      targetVersion,
      skillDirectory: join(this.#userHome, ".agents", "skills", packageName),
    };
  }

  private async runChecked(
    step: PackageUpgradeStep,
    executable: string,
    arguments_: readonly string[],
  ): Promise<PackageCommandResult> {
    const result = await this.runner.run(executable, arguments_, process.env);
    if (result.error === undefined && result.exitCode === 0) {
      return result;
    }
    const diagnostic = commandDiagnostic(result);
    throw new PackageUpgradeError(
      step,
      `Semantic Atlas ${step} failed${diagnostic.length === 0 ? "" : `: ${diagnostic}`}`,
      result.error === undefined ? undefined : { cause: result.error },
    );
  }

  private async runNpmChecked(
    step: PackageUpgradeStep,
    arguments_: readonly string[],
  ): Promise<PackageCommandResult> {
    const invocation = resolveNpmCommandInvocation(arguments_, this.#npmRuntime);
    return this.runChecked(step, invocation.executable, invocation.arguments);
  }
}

export function resolveNpmCommandInvocation(
  arguments_: readonly string[],
  runtime: NpmCommandRuntime,
): NpmCommandInvocation {
  if (runtime.npmExecutable !== undefined || runtime.platform !== "win32") {
    return {
      executable: runtime.npmExecutable ?? "npm",
      arguments: arguments_,
    };
  }
  return {
    executable: runtime.commandShell ?? "cmd.exe",
    arguments: ["/d", "/s", "/c", "npm.cmd", ...arguments_],
  };
}

class SpawnPackageCommandRunner implements PackageCommandRunner {
  async run(
    executable: string,
    arguments_: readonly string[],
    environment?: NodeJS.ProcessEnv,
  ): Promise<PackageCommandResult> {
    return new Promise((resolve) => {
      const child = spawn(executable, arguments_, {
        env: environment,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      let settled = false;
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout = appendCapturedOutput(stdout, chunk);
      });
      child.stderr.on("data", (chunk: string) => {
        stderr = appendCapturedOutput(stderr, chunk);
      });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode: null, stdout, stderr, error });
      });
      child.once("close", (exitCode) => {
        if (settled) return;
        settled = true;
        resolve({ exitCode, stdout, stderr });
      });
    });
  }
}

function appendCapturedOutput(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= maximumCapturedOutputLength
    ? combined
    : combined.slice(-maximumCapturedOutputLength);
}

function commandDiagnostic(result: PackageCommandResult): string {
  const diagnostic = [result.error?.message, result.stderr, result.stdout]
    .find((value) => value !== undefined && value.trim().length > 0);
  return diagnostic?.trim().slice(-2_000) ?? "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
