import type { CliEnvelope } from "../contracts/cli.js";

export type CliCommandName = Exclude<CliEnvelope["data"]["command"], null>;

export type ParsedCommand =
  | { readonly name: "status" }
  | { readonly name: "index" }
  | { readonly name: "map.roots" }
  | { readonly name: "map.children"; readonly nodeId: string }
  | { readonly name: "map.search"; readonly query: string; readonly limit: number }
  | { readonly name: "map.show"; readonly nodeId: string; readonly depth: number }
  | { readonly name: "learn" }
  | {
      readonly name: "changes";
      readonly fromSnapshotId?: string;
      readonly toSnapshotId?: string;
    };

export interface ParsedInvocation {
  readonly repo: string;
  readonly pretty: boolean;
  readonly command: ParsedCommand;
}

export interface CliWarning {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface CommandResult {
  readonly data: unknown;
  readonly warnings: readonly CliWarning[];
}

export interface CliIo {
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: NodeJS.WritableStream;
  readonly stderr: NodeJS.WritableStream;
}
