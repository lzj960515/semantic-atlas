import path from "node:path";
import os from "node:os";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { MapApplication, type MapProjectionResult } from "../application/map-application.js";
import type {
  CliErrorEnvelope,
  CliRunResult,
  ContextEnvelope,
  InsightsSummaryEnvelope,
  ObserveMaintenanceEnvelope,
  ObserveReviewEnvelope,
  ObserveTaskEnvelope,
  ProjectAddEnvelope,
  ReconciliationCandidatesEnvelope,
  ReconciliationStatusEnvelope,
  RenderEnvelope,
  SetupEnvelope,
  UpgradeEnvelope,
  ValidateEnvelope,
  WebEnvelope,
} from "../contracts/cli.js";
import { InsightService } from "../insights/insight-service.js";
import { ObservationApplication } from "../observations/observation-application.js";
import { ObservationStore } from "../observations/observation-store.js";
import { RepositoryIdentityResolver } from "../observations/repository-identity.js";
import { ReconciliationService } from "../reconciliation/reconciliation-service.js";
import {
  ProjectRegistrationService,
  type ProjectRegistrationResult,
} from "../projects/project-registration-service.js";
import { ProjectStore } from "../projects/project-store.js";
import {
  ManagedSkillConflictError,
  ManagedSkillsInstaller,
  type ManagedSkillsInstallation,
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
  runObserveMaintenanceCommand,
  runObserveReviewCommand,
  runObserveTaskCommand,
} from "./observation-commands.js";
import { writeProjection } from "./projection-writer.js";
import {
  type ReconciliationCliRuntime,
  runReconciliationCandidatesCommand,
  runReconciliationStatusCommand,
} from "./reconciliation-command.js";
import {
  WebCommandService,
  type StartWebOptions,
  type WebSessionData,
} from "../web/web-command-service.js";

export interface CliRuntime extends ObservationCliRuntime, ReconciliationCliRuntime {
  readonly packageIdentity: PackageIdentity;
  readonly mapApplication: MapApplication;
  addProject(repositoryPath: string): Promise<ProjectRegistrationResult>;
  installSkills(): Promise<ManagedSkillsInstallation>;
  upgradePackage(): Promise<PackageUpgradeResult>;
  startWeb(options: StartWebOptions): Promise<WebSessionData>;
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
    | ProjectAddEnvelope
    | ObserveReviewEnvelope
    | InsightsSummaryEnvelope
    | ObserveMaintenanceEnvelope
    | ReconciliationCandidatesEnvelope
    | ReconciliationStatusEnvelope
    | WebEnvelope
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
    .description("Install or repair the bundled user Skills")
    .action(async () => {
      commandEnvelope = await runSetupCommand(resolvedRuntime);
    });

  program
    .command("upgrade")
    .description("Install the latest stable package and sync its Skills")
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

  const project = program
    .command("project")
    .description("Manage user-local Viewer projects");

  project
    .command("add")
    .description("Validate and register a project for the local Viewer")
    .argument("[path]", "repository root", process.cwd())
    .action(async (repositoryPath: string) => {
      commandEnvelope = await runProjectAddCommand(
        resolvedRuntime,
        path.resolve(repositoryPath),
      );
    });

  program
    .command("web")
    .description("Start the local interactive business-map viewer")
    .option("--repo <paths...>", "repository roots")
    .option("--port <port>", "loopback HTTP port", parsePort, 4310)
    .option("--no-open", "start without opening the default browser")
    .action(async (options: {
      readonly repo?: readonly string[];
      readonly port: number;
      readonly open: boolean;
    }) => {
      commandEnvelope = await runWebCommand(resolvedRuntime, {
        ...(options.repo
          ? { repositoryPaths: options.repo.map((repositoryPath) => path.resolve(repositoryPath)) }
          : {}),
        port: options.port,
        openBrowser: options.open,
      });
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

  observe
    .command("maintenance")
    .description("Record a reviewed post-integration candidate result")
    .requiredOption("--stdin", "read one JSON observation from standard input")
    .option("--repo <path>", "repository root", process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runObserveMaintenanceCommand(
        resolvedRuntime,
        options.repo,
      );
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

  const reconcile = program
    .command("reconcile")
    .description("Prepare reviewed business-map maintenance");

  reconcile
    .command("candidates")
    .description("Group retained map-update candidates without editing the repository")
    .option("--repo <path>", "repository root", process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runReconciliationCandidatesCommand(
        resolvedRuntime,
        options.repo,
      );
    });

  reconcile
    .command("status")
    .description("Report whether the repository has actionable maintenance")
    .option("--repo <path>", "repository root", process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runReconciliationStatusCommand(
        resolvedRuntime,
        options.repo,
      );
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
  const mapApplication = new MapApplication();
  const repositoryResolver = new RepositoryIdentityResolver();
  const observationStore = new ObservationStore({
    userHome: options.userHome ?? os.homedir(),
  });
  const projectStore = new ProjectStore({
    userHome: options.userHome ?? os.homedir(),
  });
  const projectRegistration = new ProjectRegistrationService(mapApplication, projectStore);
  return {
    packageIdentity,
    mapApplication,
    addProject: (repositoryPath) => projectRegistration.add(repositoryPath),
    observationApplication: new ObservationApplication(
      repositoryResolver,
      observationStore,
    ),
    insightService: new InsightService(repositoryResolver, observationStore),
    reconciliationService: new ReconciliationService(
      repositoryResolver,
      observationStore,
    ),
    installSkills: () => new ManagedSkillsInstaller({ packageIdentity }).install(),
    upgradePackage: () => new SemanticAtlasPackageUpgrader({
      currentVersion: packageIdentity.version,
    }).upgrade(),
    startWeb: (webOptions) => new WebCommandService(mapApplication, projectStore).start(webOptions),
    readStandardInput: options.readStandardInput ?? readStandardInput,
    now: options.now ?? (() => new Date()),
  };
}

async function runProjectAddCommand(
  runtime: CliRuntime,
  repositoryPath: string,
): Promise<ProjectAddEnvelope> {
  const result = await runtime.addProject(repositoryPath);
  if (!result.ok) {
    return {
      schemaVersion: 1,
      ok: false,
      command: "project add",
      ...(result.repository ? { repository: result.repository } : {}),
      error: result.error,
    };
  }
  return {
    schemaVersion: 1,
    ok: true,
    command: "project add",
    repository: result.repository,
    data: { outcome: result.outcome },
  };
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new InvalidArgumentError("port must be an integer from 1 through 65535");
  }
  return port;
}

async function runWebCommand(
  runtime: CliRuntime,
  options: StartWebOptions,
): Promise<WebEnvelope> {
  try {
    return {
      schemaVersion: 1,
      ok: true,
      command: "web",
      data: await runtime.startWeb(options),
    };
  } catch (error) {
    return {
      schemaVersion: 1,
      ok: false,
      command: "web",
      error: {
        code: "WEB_START_FAILED",
        message: errorMessage(error),
      },
    };
  }
}

async function readStandardInput(): Promise<string> {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input;
}

async function runSetupCommand(runtime: CliRuntime): Promise<SetupEnvelope> {
  try {
    const result = await runtime.installSkills();
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
        flowCount: result.projection.flowCount,
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
