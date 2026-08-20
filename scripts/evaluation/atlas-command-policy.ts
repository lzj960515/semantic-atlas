import { parseCliArguments } from "../../src/cli/argument-parser.js";
import { businessKeySchema, structuralNodeIdSchema } from "../../src/contracts/graph.js";
import { contentIdentifierSchema } from "../../src/contracts/identifiers.js";
import {
  RETAINED_FRESH_AGENT_COMMAND_AUDIT_POLICY,
  type FreshAgentCommandAuditPolicy,
} from "../../src/evaluation/contracts.js";

const CURRENT_FIXTURE_COMMANDS = new Set([
  "status",
  "changes",
  "map.view",
  "map.search",
  "map.show",
  "code.search",
]);

export function atlasCommandNameForPolicy(
  words: readonly string[],
  policy: FreshAgentCommandAuditPolicy,
): string | undefined {
  if (words[0] !== "semantic-atlas") return undefined;
  const arguments_ = words.slice(1);
  if (arguments_.includes("--repo")) return undefined;

  if (policy === RETAINED_FRESH_AGENT_COMMAND_AUDIT_POLICY) {
    return parseRetainedV4Command(arguments_);
  }

  try {
    const commandName = parseCliArguments(arguments_, ".").command.name;
    return CURRENT_FIXTURE_COMMANDS.has(commandName) ? commandName : undefined;
  } catch {
    return undefined;
  }
}

function parseRetainedV4Command(arguments_: readonly string[]): string | undefined {
  const commandArguments = removePrettyOption(arguments_);
  if (commandArguments === undefined) return undefined;
  const [command, subcommand, ...rest] = commandArguments;

  if (command === "status" && subcommand === undefined) return "status";
  if (command === "changes") return isChangesCommand([subcommand, ...rest]) ? "changes" : undefined;
  if (command !== "map") return undefined;

  if (subcommand === "roots" && rest.length === 0) return "map.roots";
  if (subcommand === "children" && rest.length === 1 && isRetainedNodeId(rest[0]!)) {
    return "map.children";
  }
  if (subcommand === "search" && hasQueryWithOption(rest, "--limit")) return "map.search";
  if (subcommand === "show" && hasRetainedShowArguments(rest)) return "map.show";
  return undefined;
}

function removePrettyOption(arguments_: readonly string[]): readonly string[] | undefined {
  const prettyOptions = arguments_.filter((argument) => argument === "--pretty");
  if (prettyOptions.length > 1) return undefined;
  return arguments_.filter((argument) => argument !== "--pretty");
}

function isChangesCommand(arguments_: readonly (string | undefined)[]): boolean {
  const definedArguments = arguments_.filter((argument): argument is string => argument !== undefined);
  const seen = new Set<string>();
  for (let index = 0; index < definedArguments.length; index += 2) {
    const option = definedArguments[index];
    const value = definedArguments[index + 1];
    if (
      (option !== "--from" && option !== "--to")
      || value === undefined
      || seen.has(option)
      || !contentIdentifierSchema.safeParse(value).success
    ) {
      return false;
    }
    seen.add(option);
  }
  return true;
}

function hasQueryWithOption(arguments_: readonly string[], option: string): boolean {
  const [query, ...options] = arguments_;
  return query !== undefined
    && query.trim().length > 0
    && hasPositiveIntegerOption(options, option);
}

function hasRetainedShowArguments(arguments_: readonly string[]): boolean {
  const [nodeId, ...options] = arguments_;
  if (nodeId === undefined || !isRetainedNodeId(nodeId)) return false;
  if (options.length === 0) return true;
  if (options.length !== 2 || options[0] !== "--depth") return false;
  const depth = Number(options[1]);
  return Number.isInteger(depth) && depth >= 1 && depth <= 3;
}

function hasPositiveIntegerOption(arguments_: readonly string[], option: string): boolean {
  if (arguments_.length === 0) return true;
  if (arguments_.length !== 2 || arguments_[0] !== option) return false;
  const value = Number(arguments_[1]);
  return Number.isInteger(value) && value >= 1;
}

function isRetainedNodeId(value: string): boolean {
  return structuralNodeIdSchema.safeParse(value).success
    || businessKeySchema.safeParse(value).success;
}
