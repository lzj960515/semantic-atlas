import { cliEnvelopeSchema, type CliEnvelope } from "../contracts/cli.js";
import { errorMessage, type CliError } from "./cli-error.js";
import type { CliIo } from "./types.js";

export class CliPresenter {
  constructor(private readonly io: CliIo) {}

  write(envelope: CliEnvelope, pretty: boolean): void {
    const validated = cliEnvelopeSchema.parse(envelope);
    this.io.stdout.write(`${JSON.stringify(validated, null, pretty ? 2 : undefined)}\n`);
  }

  writeError(
    error: CliError,
    context: {
      readonly repository: CliEnvelope["repository"];
      readonly snapshot: CliEnvelope["snapshot"];
    },
    pretty: boolean,
  ): void {
    const envelope = cliEnvelopeSchema.parse({
      schemaVersion: 1,
      repository: context.repository,
      snapshot: context.snapshot,
      status: "error",
      data: {
        command: error.command,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      warnings: [],
    });
    this.write(envelope, pretty);
  }

  writeUnexpectedDiagnostic(error: unknown): void {
    const diagnostic = error instanceof Error && error.stack !== undefined
      ? error.stack
      : errorMessage(error);
    this.io.stderr.write(`${diagnostic}\n`);
  }
}
