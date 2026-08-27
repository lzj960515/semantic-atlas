import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

const packageName = "semantic-atlas";
const maximumCapturedOutputLength = 64 * 1_024;
const stableVersionPattern = /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/u;

export type PackageUpgradeStep = "check" | "install" | "locate" | "verify" | "setup";

export interface PackageCommandResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}

export interface PackageCommandRunner {
  run(executable: string, arguments_: readonly string[]): Promise<PackageCommandResult>;
}

export interface PackageUpgraderOptions {
  readonly currentVersion: string;
  readonly nodeExecutable?: string;
  readonly npmExecutable?: string;
  readonly userHome?: string;
}

export interface PackageUpgradeResult {
  readonly outcome: "current" | "upgraded";
  readonly previousVersion: string;
  readonly targetVersion: string;
  readonly skillDirectories: readonly string[];
}

export class PackageUpgradeError extends Error {
  public override readonly name = "PackageUpgradeError";

  public constructor(
    public readonly step: PackageUpgradeStep,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class SemanticAtlasPackageUpgrader {
  private readonly nodeExecutable: string;
  private readonly userHome: string;

  public constructor(
    private readonly options: PackageUpgraderOptions,
    private readonly runner: PackageCommandRunner = new SpawnPackageCommandRunner(),
  ) {
    this.nodeExecutable = options.nodeExecutable ?? process.execPath;
    this.userHome = options.userHome ?? homedir();
  }

  public async upgrade(): Promise<PackageUpgradeResult> {
    const targetVersion = await this.latestStableVersion();
    const outcome = targetVersion === this.options.currentVersion ? "current" : "upgraded";
    if (outcome === "upgraded") await this.install(targetVersion);

    const installedCli = await this.installedCliPath();
    await this.verifyInstalledVersion(installedCli, targetVersion);
    await this.runChecked("setup", this.nodeExecutable, [installedCli, "setup"]);

    return {
      outcome,
      previousVersion: this.options.currentVersion,
      targetVersion,
      skillDirectories: [
        path.join(this.userHome, ".agents", "skills", packageName),
        path.join(this.userHome, ".agents", "skills", "semantic-atlas-maintenance"),
      ],
    };
  }

  private async latestStableVersion(): Promise<string> {
    const result = await this.runNpmChecked("check", [
      "view",
      packageName,
      "dist-tags.latest",
      "--json",
    ]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new PackageUpgradeError(
        "check",
        "npm did not return the latest Semantic Atlas release as JSON",
        error instanceof Error ? { cause: error } : undefined,
      );
    }
    if (typeof parsed !== "string" || !stableVersionPattern.test(parsed)) {
      throw new PackageUpgradeError(
        "check",
        "npm did not return one exact stable Semantic Atlas version",
      );
    }
    return parsed;
  }

  private async install(targetVersion: string): Promise<void> {
    await this.runNpmChecked("install", [
      "install",
      "--global",
      `${packageName}@${targetVersion}`,
    ]);
  }

  private async installedCliPath(): Promise<string> {
    const result = await this.runNpmChecked("locate", ["root", "--global"]);
    const globalRoot = result.stdout.trim();
    if (globalRoot.length === 0) {
      throw new PackageUpgradeError("locate", "npm did not return its global package root");
    }
    return path.join(globalRoot, packageName, "dist", "cli", "bin.js");
  }

  private async verifyInstalledVersion(
    installedCli: string,
    targetVersion: string,
  ): Promise<void> {
    const result = await this.runChecked(
      "verify",
      this.nodeExecutable,
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

  private runNpmChecked(
    step: PackageUpgradeStep,
    arguments_: readonly string[],
  ): Promise<PackageCommandResult> {
    const invocation = resolveNpmInvocation(arguments_, this.options.npmExecutable);
    return this.runChecked(step, invocation.executable, invocation.arguments);
  }

  private async runChecked(
    step: PackageUpgradeStep,
    executable: string,
    arguments_: readonly string[],
  ): Promise<PackageCommandResult> {
    const result = await this.runner.run(executable, arguments_);
    if (result.error === undefined && result.exitCode === 0) return result;
    const diagnostic = commandDiagnostic(result);
    throw new PackageUpgradeError(
      step,
      `Semantic Atlas ${step} failed${diagnostic.length === 0 ? "" : `: ${diagnostic}`}`,
      result.error ? { cause: result.error } : undefined,
    );
  }
}

class SpawnPackageCommandRunner implements PackageCommandRunner {
  public async run(
    executable: string,
    arguments_: readonly string[],
  ): Promise<PackageCommandResult> {
    return new Promise((resolve) => {
      const child = spawn(executable, arguments_, {
        env: process.env,
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

function resolveNpmInvocation(
  arguments_: readonly string[],
  npmExecutable?: string,
): { readonly executable: string; readonly arguments: readonly string[] } {
  if (npmExecutable || process.platform !== "win32") {
    return {
      executable: npmExecutable ?? "npm",
      arguments: arguments_,
    };
  }
  return {
    executable: process.env.ComSpec ?? "cmd.exe",
    arguments: ["/d", "/s", "/c", "npm.cmd", ...arguments_],
  };
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
