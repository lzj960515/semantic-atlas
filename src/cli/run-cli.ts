import path from "node:path";
import os from "node:os";
import { Command, CommanderError } from "commander";
import { MapApplication, type MapProjectionResult } from "../application/map-application.js";
import type {
  CliErrorEnvelope,
  CliRunResult,
  ContextEnvelope,
  InsightsSummaryEnvelope,
  ObserveReviewEnvelope,
  ObserveTaskEnvelope,
  RenderEnvelope,
  SetupEnvelope,
  UpgradeEnvelope,
  ValidateEnvelope,
} from "../contracts/cli.js";
import { InsightService } from "../insights/insight-service.js";
import { ObservationApplication } from "../observations/observation-application.js";
import { ObservationStore } from "../observations/observation-store.js";
import { RepositoryIdentityResolver } from "../observations/repository-identity.js";
import {
  ManagedSkillConflictError,
  ManagedSkillInstaller,
  type ManagedSkillInstallation,
} from "../setup/managed-skill-installer.js";
import {
  PackageUpgradeError,
  SemanticAtlasPackageUpgrader,
  type PackageUpgradeResult,
} from "../setup/package-upgrader.js";
import {
  readPackageIdentity,
  type PackageIdentity,
} from "../setup/package-identity.js";
import {
  type ObservationCliRuntime,
  runInsightsSummaryCommand,
  runObserveReviewCommand,
  runObserveTaskCommand,
} from "./observation-commands.js";
import { writeProjection } from "./projection-writer.js";

export interface CliRuntime extends ObservationCliRuntime {
  readonly packageIdentity: PackageIdentity;
  readonly mapApplication: MapApplication;
  installSkill(): Promise<ManagedSkillInstallation>;
  upgradePackage(): Promise<PackageUpgradeResult>;
}

export interface CliRuntimeOptions {
  readonly userHome?: string;
  readonly readStandardInput?: () => Promise<string>;
  readonly now?: () => Date;
}

export async function runCli(
  arguments_: readonly string[],
  runtime?: CliRuntime,
): Promise<CliRunResult> {
  const resolvedRuntime = runtime ?? await createCliRuntime();
  const application = resolvedRuntime.mapApplication;
  let commandEnvelope:
    | ValidateEnvelope
    | ContextEnvelope
    | RenderEnvelope
    | SetupEnvelope
    | UpgradeEnvelope
    | ObserveTaskEnvelope
    | ObserveReviewEnvelope
    | InsightsSummaryEnvelope
    | undefined;
  let commandOutput = "";
  let commandError = "";
  const program = new Command()
    .name("semantic-atlas")
    .description("Query a Git-native advisory business map")
    .version(resolvedRuntime.packageIdentity.version)
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({
      writeOut: (message) => {
        commandOutput += message;
      },
      writeErr: (message) => {
        commandError += message;
      },
    });

  program
    .command("setup")
    .description("Install or repair the bundled user Skill")
    .action(async () => {
      commandEnvelope = await runSetupCommand(resolvedRuntime);
    });

  program
    .command("upgrade")
    .description("Install the latest stable package and sync its Skill")
    .action(async () => {
      commandEnvelope = await runUpgradeCommand(resolvedRuntime);
    });

  program
    .command("validate")
    .description("Validate tracked business-map documents")
    .option("--repo <path>", "repository root", process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await application.validate(options.repo);
    });

  program
    .command("render")
    .description("Render the validated business graph for human inspection")
    .option("--repo <path>", "repository root", process.cwd())
    .option("--output <path>", "static HTML output path")
    .action(async (options: { readonly repo: string; readonly output?: string }) => {
      commandEnvelope = await runRenderCommand(application, options);
    });

  program
    .command("context")
    .description("Return a local business neighborhood")
    .argument("<selector>", "stable ID, name, alias, or partial term")
    .option("--repo <path>", "repository root", process.cwd())
    .action(async (selector: string, options: { readonly repo: string }) => {
      commandEnvelope = await application.context(options.repo, selector);
    });

  const observe = program
    .command("observe")
    .description("Record immutable engineering accuracy evidence");

  observe
    .command("task")
    .description("Record task-agent investigation evidence")
    .requiredOption("--stdin", "read one JSON observation from standard input")
    .option("--repo <path>", "repository root", process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runObserveTaskCommand(resolvedRuntime, options.repo);
    });

  observe
    .command("review")
    .description("Record independent review evidence")
    .requiredOption("--stdin", "read one JSON observation from standard input")
    .option("--repo <path>", "repository root", process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runObserveReviewCommand(resolvedRuntime, options.repo);
    });

  program
    .command("insights")
    .description("Summarize retained accuracy evidence")
    .command("summary")
    .description("Derive a read-only repository accuracy summary")
    .option("--repo <path>", "repository root", process.cwd())
    .option("--period <duration>", "positive duration such as 24h, 7d, or 4w")
    .action(async (options: { readonly repo: string; readonly period?: string }) => {
      commandEnvelope = await runInsightsSummaryCommand(resolvedRuntime, options);
    });

  try {
    await program.parseAsync([...arguments_], { from: "user" });
  } catch (error) {
    if (error instanceof CommanderError && error.exitCode === 0) {
      return {
        exitCode: 0,
        stdout: commandOutput,
        stderr: "",
      };
    }
    if (error instanceof CommanderError) {
      const envelope: CliErrorEnvelope<"command"> = {
        schemaVersion: 1,
        ok: false,
        command: "command",
        error: {
          code: "INVALID_COMMAND",
          message: commandError.trim() || error.message,
        },
      };
      return serialize(2, envelope);
    }
    const envelope: CliErrorEnvelope<"command"> = {
      schemaVersion: 1,
      ok: false,
      command: "command",
      error: {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unexpected CLI failure",
      },
    };
    return serialize(2, envelope);
  }

  if (!commandEnvelope) {
    const envelope: CliErrorEnvelope<"command"> = {
      schemaVersion: 1,
      ok: false,
      command: "command",
      error: {
        code: "INVALID_COMMAND",
        message: "A command is required",
      },
    };
    return serialize(2, envelope);
  }

  return serialize(commandEnvelope.ok ? 0 : 1, commandEnvelope);
}

export async function createCliRuntime(
  options: CliRuntimeOptions = {},
): Promise<CliRuntime> {
  const packageIdentity = await readPackageIdentity();
  const repositoryResolver = new RepositoryIdentityResolver();
  const observationStore = new ObservationStore({
    userHome: options.userHome ?? os.homedir(),
  });
  return {
    packageIdentity,
    mapApplication: new MapApplication(),
    observationApplication: new ObservationApplication(
      repositoryResolver,
      observationStore,
    ),
    insightService: new InsightService(repositoryResolver, observationStore),
    installSkill: () => new ManagedSkillInstaller({ packageIdentity }).install(),
    upgradePackage: () => new SemanticAtlasPackageUpgrader({
      currentVersion: packageIdentity.version,
    }).upgrade(),
    readStandardInput: options.readStandardInput ?? readStandardInput,
    now: options.now ?? (() => new Date()),
  };
}

async function readStandardInput(): Promise<string> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function runSetupCommand(runtime: CliRuntime): Promise<SetupEnvelope> {
  try {
    const result = await runtime.installSkill();
    return {
      schemaVersion: 1,
      ok: true,
      command: "setup",
      data: result,
    };
  } catch (error) {
    if (error instanceof ManagedSkillConflictError) {
      return {
        schemaVersion: 1,
        ok: false,
        command: "setup",
        error: {
          code: "MANAGED_SKILL_CONFLICT",
          message: error.message,
          directory: error.directory,
        },
      };
    }
    return {
      schemaVersion: 1,
      ok: false,
      command: "setup",
      error: {
        code: "SETUP_FAILED",
        message: errorMessage(error),
      },
    };
  }
}

async function runUpgradeCommand(runtime: CliRuntime): Promise<UpgradeEnvelope> {
  try {
    const result = await runtime.upgradePackage();
    return {
      schemaVersion: 1,
      ok: true,
      command: "upgrade",
      data: result,
    };
  } catch (error) {
    const upgradeError = error instanceof PackageUpgradeError
      ? error
      : new PackageUpgradeError("check", errorMessage(error));
    return {
      schemaVersion: 1,
      ok: false,
      command: "upgrade",
      error: {
        code: "UPGRADE_FAILED",
        message: upgradeError.message,
        step: upgradeError.step,
      },
    };
  }
}

function serialize(exitCode: number, envelope: object): CliRunResult {
  return {
    exitCode,
    stdout: `${JSON.stringify(envelope, null, 2)}\n`,
    stderr: "",
  };
}

function renderError(
  result: Extract<MapProjectionResult, { readonly ok: false }>,
): RenderEnvelope {
  return {
    schemaVersion: 1,
    ok: false,
    command: "render",
    ...(result.repository ? { repository: result.repository } : {}),
    error: result.error,
  };
}

async function runRenderCommand(
  application: MapApplication,
  options: { readonly repo: string; readonly output?: string },
): Promise<RenderEnvelope> {
  const result = await application.project(options.repo);
  if (!result.ok) return renderError(result);

  const requestedOutputPath = options.output
    ?? path.join(result.repository.root, "semantic-atlas.html");
  try {
    const outputPath = await writeProjection(
      requestedOutputPath,
      result.projection.content,
    );
    return {
      schemaVersion: 1,
      ok: true,
      command: "render",
      repository: result.repository,
      data: {
        format: result.projection.format,
        outputPath,
        nodeCount: result.projection.nodeCount,
        relationCount: result.projection.relationCount,
      },
    };
  } catch (error) {
    const outputPath = path.resolve(requestedOutputPath);
    return {
      schemaVersion: 1,
      ok: false,
      command: "render",
      repository: result.repository,
      error: {
        code: "OUTPUT_FAILED",
        message: `Could not write the rendered business map to '${outputPath}': ${errorMessage(error)}`,
        outputPath,
      },
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected output failure";
}
