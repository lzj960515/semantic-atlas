import { LocalizedCommand } from "./localized-command.js";
import { t } from "../i18n/index.js";
import path from "node:path";
import os from "node:os";
import { CommanderError, InvalidArgumentError, Option } from "commander";
import { MapApplication, type MapProjectionResult } from "../application/map-application.js";
import type {
  CliErrorEnvelope,
  CliRunResult,
  ContextEnvelope,
  FlowsEnvelope,
  FlowSearchEnvelope,
  InsightsSummaryEnvelope,
  ObserveMaintenanceEnvelope,
  ObserveReviewEnvelope,
  ObserveTaskEnvelope,
  ProjectAddEnvelope,
  ProjectListEnvelope,
  ReconciliationCandidatesEnvelope,
  ReconciliationStatusEnvelope,
  RenderEnvelope,
  SearchEnvelope,
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
import { ProjectDirectory, ProjectSelectionError } from "../projects/project-directory.js";
import { ProjectStore, ProjectStoreError } from "../projects/project-store.js";
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
import { readPackageIdentity, type PackageIdentity } from "../setup/package-identity.js";
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
  readonly projectDirectory: ProjectDirectory;
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
  const resolvedRuntime = runtime ?? (await createCliRuntime());
  const application = resolvedRuntime.mapApplication;
  let commandEnvelope:
    | ValidateEnvelope
    | ContextEnvelope
    | SearchEnvelope
    | FlowsEnvelope
    | FlowSearchEnvelope
    | RenderEnvelope
    | SetupEnvelope
    | UpgradeEnvelope
    | ObserveTaskEnvelope
    | ProjectAddEnvelope
    | ProjectListEnvelope
    | ObserveReviewEnvelope
    | InsightsSummaryEnvelope
    | ObserveMaintenanceEnvelope
    | ReconciliationCandidatesEnvelope
    | ReconciliationStatusEnvelope
    | WebEnvelope
    | undefined;
  let commandOutput = "";
  let commandError = "";
  const program = new LocalizedCommand()
    .name("semantic-atlas")
    .description(t("cli.description"))
    .version(resolvedRuntime.packageIdentity.version, "-V, --version", t("cli.version"))
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
    .description(t("cli.setup"))
    .action(async () => {
      commandEnvelope = await runSetupCommand(resolvedRuntime);
    });

  program
    .command("upgrade")
    .description(t("cli.upgrade"))
    .action(async () => {
      commandEnvelope = await runUpgradeCommand(resolvedRuntime);
    });

  program
    .command("validate")
    .description(t("cli.validate"))
    .option("--repo <path>", t("cli.repo"))
    .addOption(new Option("--project <name-or-id>", t("cli.projectSelector")).conflicts("repo"))
    .action(async (options: RepositorySelectionOptions) => {
      commandEnvelope = await runSelectedRepositoryCommand(
        "validate",
        resolvedRuntime,
        options,
        (repositoryPath) => application.validate(repositoryPath),
      );
    });

  program
    .command("render")
    .description(t("cli.render"))
    .option("--repo <path>", t("cli.repo"))
    .addOption(new Option("--project <name-or-id>", t("cli.projectSelector")).conflicts("repo"))
    .option("--output <path>", t("cli.output"))
    .action(async (options: RepositorySelectionOptions & { readonly output?: string }) => {
      commandEnvelope = await runSelectedRepositoryCommand(
        "render",
        resolvedRuntime,
        options,
        (repositoryPath) =>
          runRenderCommand(application, {
            repo: repositoryPath,
            ...(options.output !== undefined ? { output: options.output } : {}),
          }),
      );
    });

  const project = program.command("project").description(t("cli.project"));

  project
    .command("list")
    .description(t("cli.projectList"))
    .action(async () => {
      commandEnvelope = await runProjectListCommand(resolvedRuntime);
    });

  project
    .command("add")
    .description(t("cli.projectAdd"))
    .argument("[path]", t("cli.repo"), process.cwd())
    .action(async (repositoryPath: string) => {
      commandEnvelope = await runProjectAddCommand(resolvedRuntime, path.resolve(repositoryPath));
    });

  program
    .command("web")
    .description(t("cli.web"))
    .option("--repo <paths...>", t("cli.repos"))
    .addOption(new Option("--project <name-or-id>", t("cli.projectSelector")).conflicts("repo"))
    .option("--flow <flow-id>", t("cli.webFlow"))
    .option("--port <port>", t("cli.port"), parsePort, 4310)
    .option("--no-open", t("cli.noOpen"))
    .action(
      async (options: {
        readonly repo?: readonly string[];
        readonly project?: string;
        readonly flow?: string;
        readonly port: number;
        readonly open: boolean;
      }) => {
        if (options.project !== undefined) {
          commandEnvelope = await runSelectedRepositoryCommand(
            "web",
            resolvedRuntime,
            { project: options.project },
            (repositoryPath) =>
              runWebCommand(resolvedRuntime, {
                repositoryPaths: [repositoryPath],
                ...(options.flow !== undefined ? { flowId: options.flow } : {}),
                port: options.port,
                openBrowser: options.open,
              }),
          );
          return;
        }
        commandEnvelope = await runWebCommand(resolvedRuntime, {
          ...(options.flow !== undefined ? { flowId: options.flow } : {}),
          ...(options.repo
            ? {
                repositoryPaths: options.repo.map((repositoryPath) => path.resolve(repositoryPath)),
              }
            : {}),
          port: options.port,
          openBrowser: options.open,
        });
      },
    );

  program
    .command("search")
    .description(t("cli.search"))
    .argument("<query>", t("cli.query"))
    .option("--flows", t("cli.searchFlows"))
    .option("--repo <path>", t("cli.repo"))
    .addOption(new Option("--project <name-or-id>", t("cli.projectSelector")).conflicts("repo"))
    .action(
      async (query: string, options: RepositorySelectionOptions & { readonly flows?: boolean }) => {
        commandEnvelope = await runSelectedRepositoryCommand(
          "search",
          resolvedRuntime,
          options,
          async (repositoryPath): Promise<SearchEnvelope | FlowSearchEnvelope> =>
            options.flows
              ? application.searchFlows(repositoryPath, query)
              : application.search(repositoryPath, query),
        );
      },
    );

  program
    .command("flows")
    .description(t("cli.flows"))
    .argument("[flow-id]", t("cli.flowId"))
    .option("--repo <path>", t("cli.repo"))
    .addOption(new Option("--project <name-or-id>", t("cli.projectSelector")).conflicts("repo"))
    .action(async (flowId: string | undefined, options: RepositorySelectionOptions) => {
      commandEnvelope = await runSelectedRepositoryCommand(
        "flows",
        resolvedRuntime,
        options,
        (repositoryPath) => application.flows(repositoryPath, flowId),
      );
    });

  program
    .command("context")
    .description(t("cli.context"))
    .argument("<selector>", t("cli.selector"))
    .option("--repo <path>", t("cli.repo"))
    .addOption(new Option("--project <name-or-id>", t("cli.projectSelector")).conflicts("repo"))
    .action(async (selector: string, options: RepositorySelectionOptions) => {
      commandEnvelope = await runSelectedRepositoryCommand(
        "context",
        resolvedRuntime,
        options,
        (repositoryPath) => application.context(repositoryPath, selector),
      );
    });

  const observe = program.command("observe").description(t("cli.observe"));

  observe
    .command("task")
    .description(t("cli.observeTask"))
    .requiredOption("--stdin", t("cli.stdin"))
    .option("--repo <path>", t("cli.repo"), process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runObserveTaskCommand(resolvedRuntime, options.repo);
    });

  observe
    .command("review")
    .description(t("cli.observeReview"))
    .requiredOption("--stdin", t("cli.stdin"))
    .option("--repo <path>", t("cli.repo"), process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runObserveReviewCommand(resolvedRuntime, options.repo);
    });

  observe
    .command("maintenance")
    .description(t("cli.observeMaintenance"))
    .requiredOption("--stdin", t("cli.stdin"))
    .option("--repo <path>", t("cli.repo"), process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runObserveMaintenanceCommand(resolvedRuntime, options.repo);
    });

  program
    .command("insights")
    .description(t("cli.insights"))
    .command("summary")
    .description(t("cli.summary"))
    .option("--repo <path>", t("cli.repo"), process.cwd())
    .option("--period <duration>", t("cli.period"))
    .action(async (options: { readonly repo: string; readonly period?: string }) => {
      commandEnvelope = await runInsightsSummaryCommand(resolvedRuntime, options);
    });

  const reconcile = program.command("reconcile").description(t("cli.reconcile"));

  reconcile
    .command("candidates")
    .description(t("cli.candidates"))
    .option("--repo <path>", t("cli.repo"), process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runReconciliationCandidatesCommand(resolvedRuntime, options.repo);
    });

  reconcile
    .command("status")
    .description(t("cli.status"))
    .option("--repo <path>", t("cli.repo"), process.cwd())
    .action(async (options: { readonly repo: string }) => {
      commandEnvelope = await runReconciliationStatusCommand(resolvedRuntime, options.repo);
    });

  program.localizeHelpCommands();

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
        message: error instanceof Error ? error.message : t("cli.unexpected"),
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
        message: t("cli.required"),
      },
    };
    return serialize(2, envelope);
  }

  return serialize(commandEnvelope.ok ? 0 : 1, commandEnvelope);
}

export async function createCliRuntime(options: CliRuntimeOptions = {}): Promise<CliRuntime> {
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
    projectDirectory: new ProjectDirectory(projectStore),
    addProject: (repositoryPath) => projectRegistration.add(repositoryPath),
    observationApplication: new ObservationApplication(repositoryResolver, observationStore),
    insightService: new InsightService(repositoryResolver, observationStore),
    reconciliationService: new ReconciliationService(repositoryResolver, observationStore),
    installSkills: () => new ManagedSkillsInstaller({ packageIdentity }).install(),
    upgradePackage: () =>
      new SemanticAtlasPackageUpgrader({
        currentVersion: packageIdentity.version,
      }).upgrade(),
    startWeb: (webOptions) => new WebCommandService(mapApplication, projectStore).start(webOptions),
    readStandardInput: options.readStandardInput ?? readStandardInput,
    now: options.now ?? (() => new Date()),
  };
}

interface RepositorySelectionOptions {
  readonly repo?: string;
  readonly project?: string;
}

async function runSelectedRepositoryCommand<TCommand extends string, TResult>(
  command: TCommand,
  runtime: CliRuntime,
  options: RepositorySelectionOptions,
  action: (repositoryPath: string) => Promise<TResult>,
): Promise<TResult | CliErrorEnvelope<TCommand>> {
  if (options.project === undefined) return action(options.repo ?? process.cwd());

  let repositoryPath: string;
  try {
    repositoryPath = (await runtime.projectDirectory.resolve(options.project)).repositoryPath;
  } catch (error) {
    if (!(error instanceof ProjectSelectionError || error instanceof ProjectStoreError))
      throw error;
    return {
      schemaVersion: 1,
      ok: false,
      command,
      error:
        error instanceof ProjectSelectionError
          ? error.error
          : { code: error.code, message: error.message },
    };
  }
  return action(repositoryPath);
}

async function runProjectListCommand(runtime: CliRuntime): Promise<ProjectListEnvelope> {
  try {
    return {
      schemaVersion: 1,
      ok: true,
      command: "project list",
      data: { projects: await runtime.projectDirectory.list() },
    };
  } catch (error) {
    if (!(error instanceof ProjectStoreError)) throw error;
    return {
      schemaVersion: 1,
      ok: false,
      command: "project list",
      error: { code: error.code, message: error.message },
    };
  }
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
    throw new InvalidArgumentError(t("cli.invalidPort"));
  }
  return port;
}

async function runWebCommand(runtime: CliRuntime, options: StartWebOptions): Promise<WebEnvelope> {
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
    const upgradeError =
      error instanceof PackageUpgradeError
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
  const command = "command" in envelope ? envelope.command : undefined;
  const query = command === "search" || command === "context" || command === "flows";
  return {
    exitCode,
    stdout: `${JSON.stringify(envelope, null, query ? undefined : 2)}\n`,
    stderr: "",
  };
}

function renderError(result: Extract<MapProjectionResult, { readonly ok: false }>): RenderEnvelope {
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

  const requestedOutputPath =
    options.output ?? path.join(result.repository.root, "semantic-atlas.html");
  try {
    const outputPath = await writeProjection(requestedOutputPath, result.projection.content);
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
        message: t("cli.writeFailed", { outputPath, reason: errorMessage(error) }),
        outputPath,
      },
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : t("cli.outputFailure");
}
