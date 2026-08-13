import type { CliEnvelope } from "../contracts/cli.js";
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

  try {
    const invocation = parseCliArguments(arguments_, currentDirectory);
    pretty = invocation.pretty;
    command = invocation.command.name;
    application = new CliApplication(io);
    const context = await application.openRepository(invocation.repo, command);
    ({ repository, snapshot } = application.responseContext(context));
    const result = await application.execute(invocation.command, context);
    const responseContext = invocation.command.name === "index"
      ? await application.openRepository(context.repository.worktreeRoot, command)
      : context;
    const envelope = application.envelope(result, responseContext);
    snapshot = envelope.snapshot;
    presenter.write(envelope, pretty);
    return 0;
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
    return classified.exitCode;
  }
}
