import type { CliEnvelope } from "../contracts/cli.js";
import type { ObservedCommand } from "../contracts/insights.js";
import { InsightsStore } from "../insights/insights-store.js";
import type { GitRepository } from "../repository/types.js";
import { parseCliArguments } from "./argument-parser.js";
import { CliApplication } from "./cli-application.js";
import { classifyCliError, CliError } from "./cli-error.js";
import { CliPresenter } from "./cli-presenter.js";
import type { CliCommandName, CliIo } from "./types.js";

export async function runCli(
  arguments_: readonly string[],
  io: CliIo,
  currentDirectory: string,
): Promise<number> {
  const presenter = new CliPresenter(io);
  let pretty = arguments_.includes("--pretty");
  let command: CliCommandName | null = null;
  let repository: CliEnvelope["repository"] = null;
  let snapshot: CliEnvelope["snapshot"] = null;
  let application: CliApplication | undefined;
  let observedRepository: GitRepository | null = null;
  let outcome: "ok" | "partial" | "error" = "error";
  let warningCodes: readonly string[] = [];
  let exitCode = 1;
  const startedAt = performance.now();

  try {
    const invocation = parseCliArguments(arguments_, currentDirectory);
    pretty = invocation.pretty;
    command = invocation.command.name;
    application = new CliApplication(io);
    const context = await application.openRepository(invocation.repo, command);
    observedRepository = context.repository;
    ({ repository, snapshot } = application.responseContext(context));
    const result = await application.execute(invocation.command, context);
    const responseContext = invocation.command.name === "index"
      ? await application.openRepository(context.repository.worktreeRoot, command)
      : context;
    const envelope = application.envelope(result, responseContext);
    snapshot = envelope.snapshot;
    outcome = envelope.status;
    warningCodes = envelope.warnings.map((warning) => warning.code);
    presenter.write(envelope, pretty);
    exitCode = 0;
    return exitCode;
  } catch (error) {
    const classified = classifyCliError(error, command);
    if (application !== undefined && command !== null && repository !== null) {
      try {
        const failureContext = await application.openRepository(repository.root, command);
        ({ repository, snapshot } = application.responseContext(failureContext));
      } catch {
        // Preserve the last successfully resolved response context.
      }
    }
    presenter.writeError(classified, { repository, snapshot }, pretty);
    if (classified.exitCode === 1 && !(error instanceof CliError)) {
      presenter.writeUnexpectedDiagnostic(error);
    }
    exitCode = classified.exitCode;
    return exitCode;
  } finally {
    if (command !== null && observedRepository !== null) {
      try {
        using insights = new InsightsStore();
        insights.recordCommand({
          repositoryId: observedRepository.repositoryId,
          command: command as ObservedCommand,
          outcome,
          exitCode,
          warningCodes,
          durationMs: performance.now() - startedAt,
          snapshotId: snapshot?.id ?? null,
        });
      } catch {
        // Observability must not change the outcome or output of a development command.
      }
    }
  }
}
