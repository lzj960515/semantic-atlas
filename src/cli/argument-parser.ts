import { contentIdentifierSchema } from "../contracts/identifiers.js";
import { businessKeySchema } from "../contracts/graph.js";
import { invalidInput } from "./cli-error.js";
import type {
  CliCommandName,
  ParsedCommand,
  ParsedInvocation,
} from "./types.js";

export function parseCliArguments(
  arguments_: readonly string[],
  currentDirectory: string,
): ParsedInvocation {
  const commandName = identifyCommand(arguments_);
  const global = parseGlobalOptions(arguments_, currentDirectory, commandName);
  return {
    repo: global.repo,
    pretty: global.pretty,
    command: parseCommand(global.arguments, commandName),
  };
}

function parseGlobalOptions(
  arguments_: readonly string[],
  currentDirectory: string,
  command: CliCommandName | null,
): { readonly arguments: readonly string[]; readonly repo: string; readonly pretty: boolean } {
  const remaining: string[] = [];
  let repo = currentDirectory;
  let pretty = false;
  let hasRepo = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--pretty") {
      if (pretty) throw invalidInput("--pretty may only be provided once.", command);
      pretty = true;
      continue;
    }
    if (argument === "--repo") {
      if (hasRepo) throw invalidInput("--repo may only be provided once.", command);
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith("-")) {
        throw invalidInput("--repo requires a directory path.", command);
      }
      repo = value;
      hasRepo = true;
      index += 1;
      continue;
    }
    remaining.push(argument);
  }
  return { arguments: remaining, repo, pretty };
}

function parseCommand(
  arguments_: readonly string[],
  identified: CliCommandName | null,
): ParsedCommand {
  const [command, subcommand, ...rest] = arguments_;
  if (command === "status" || command === "index") {
    requireNoArguments([subcommand, ...rest].filter(isDefined), identified);
    return { name: command };
  }
  if (command === "learn") {
    if (subcommand !== "--stdin" || rest.length !== 0) {
      throw invalidInput("learn requires exactly --stdin.", "learn");
    }
    return { name: "learn" };
  }
  if (command === "feedback") {
    if (subcommand !== "report" || rest.length !== 1 || rest[0] !== "--stdin") {
      throw invalidInput("feedback report requires exactly --stdin.", "feedback.report");
    }
    return { name: "feedback.report" };
  }
  if (command === "changes") {
    return parseChanges([subcommand, ...rest].filter(isDefined));
  }
  if (command === "map") {
    return parseMap(subcommand, rest);
  }
  if (command === "code") {
    return parseCode(subcommand, rest);
  }
  throw invalidInput("The command arguments are invalid.", identified);
}

function parseMap(subcommand: string | undefined, arguments_: readonly string[]): ParsedCommand {
  if (subcommand === "view") {
    if (arguments_.length > 1) {
      throw invalidInput("map view accepts at most one business key.", "map.view");
    }
    const focusKey = arguments_[0];
    return {
      name: "map.view",
      ...(focusKey === undefined ? {} : { focusKey: requireBusinessKey(focusKey, "map.view") }),
    };
  }
  if (subcommand === "search") {
    const [query, ...options] = arguments_;
    if (query === undefined || query.trim().length === 0) {
      throw invalidInput("map search requires a lexical query.", "map.search");
    }
    return {
      name: "map.search",
      query,
      limit: parsePositiveIntegerOption(options, "--limit", 20, "map.search"),
    };
  }
  if (subcommand === "show") {
    if (arguments_.length !== 1) {
      throw invalidInput("map show requires one business key.", "map.show");
    }
    return {
      name: "map.show",
      businessKey: requireBusinessKey(arguments_[0]!, "map.show"),
    };
  }
  throw invalidInput("The map command is invalid.", identifyMapCommand(subcommand));
}

function parseCode(subcommand: string | undefined, arguments_: readonly string[]): ParsedCommand {
  if (subcommand === "search") {
    const [query, ...options] = arguments_;
    if (query === undefined || query.trim().length === 0) {
      throw invalidInput("code search requires a structural query.", "code.search");
    }
    return {
      name: "code.search",
      query,
      limit: parsePositiveIntegerOption(options, "--limit", 20, "code.search"),
    };
  }
  throw invalidInput("The code command is invalid.", identifyCodeCommand(subcommand));
}

function parseChanges(arguments_: readonly string[]): ParsedCommand {
  let fromSnapshotId: string | undefined;
  let toSnapshotId: string | undefined;
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    if ((option !== "--from" && option !== "--to") || value === undefined) {
      throw invalidInput("changes accepts --from and --to snapshot IDs.", "changes");
    }
    const snapshotId = parseSnapshotId(value);
    if (option === "--from") {
      if (fromSnapshotId !== undefined) throw invalidInput("--from may only be provided once.", "changes");
      fromSnapshotId = snapshotId;
    } else {
      if (toSnapshotId !== undefined) throw invalidInput("--to may only be provided once.", "changes");
      toSnapshotId = snapshotId;
    }
  }
  return {
    name: "changes",
    ...(fromSnapshotId === undefined ? {} : { fromSnapshotId }),
    ...(toSnapshotId === undefined ? {} : { toSnapshotId }),
  };
}

function parsePositiveIntegerOption(
  arguments_: readonly string[],
  option: string,
  defaultValue: number,
  command: CliCommandName,
  maximum?: number,
): number {
  if (arguments_.length === 0) return defaultValue;
  if (arguments_.length !== 2 || arguments_[0] !== option) {
    throw invalidInput(`${command} accepts only ${option}.`, command);
  }
  const value = Number(arguments_[1]);
  if (!Number.isInteger(value) || value < 1 || (maximum !== undefined && value > maximum)) {
    const range = maximum === undefined ? "a positive integer" : `an integer from 1 through ${maximum}`;
    throw invalidInput(`${option} must be ${range}.`, command);
  }
  return value;
}

function requireBusinessKey(value: string, command: CliCommandName): string {
  const business = businessKeySchema.safeParse(value);
  if (!business.success) {
    throw invalidInput("Expected a business key.", command);
  }
  return business.data;
}

function parseSnapshotId(value: string): string {
  const result = contentIdentifierSchema.safeParse(value);
  if (!result.success) throw invalidInput("Snapshot IDs must be SHA-256 identifiers.", "changes");
  return result.data;
}

function requireNoArguments(arguments_: readonly string[], command: CliCommandName | null): void {
  if (arguments_.length > 0) throw invalidInput("The command does not accept arguments.", command);
}

function identifyCommand(arguments_: readonly string[]): CliCommandName | null {
  const positional = arguments_.filter((argument, index) => (
    argument !== "--pretty"
      && argument !== "--repo"
      && arguments_[index - 1] !== "--repo"
  ));
  const [command, subcommand] = positional;
  if (command === "status" || command === "index" || command === "learn" || command === "changes") {
    return command;
  }
  if (command === "map") return identifyMapCommand(subcommand);
  if (command === "code") return identifyCodeCommand(subcommand);
  return command === "feedback" && subcommand === "report" ? "feedback.report" : null;
}

function identifyMapCommand(subcommand: string | undefined): CliCommandName | null {
  if (subcommand === "view" || subcommand === "search" || subcommand === "show") {
    return `map.${subcommand}`;
  }
  return null;
}

function identifyCodeCommand(subcommand: string | undefined): CliCommandName | null {
  return subcommand === "search" ? "code.search" : null;
}

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}
