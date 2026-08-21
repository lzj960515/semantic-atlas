import {
  feedbackReportUpdateInputSchema,
  feedbackStatusSchema,
  insightsEnvelopeSchema,
  insightsPeriodSchema,
  type FeedbackStatus,
  type InsightsEnvelope,
  type InsightsPeriod,
  type InsightsSuccessData,
} from "../contracts/insights.js";
import { InsightsStore, type InsightsRange } from "../insights/insights-store.js";
import type { CliIo } from "./types.js";

type ParsedInsightsCommand =
  | { readonly name: "insights.summary"; readonly period: InsightsPeriod; readonly pretty: boolean }
  | {
    readonly name: "insights.feedback";
    readonly period: InsightsPeriod;
    readonly status?: FeedbackStatus;
    readonly pretty: boolean;
  }
  | { readonly name: "insights.feedback.update"; readonly pretty: boolean };

class InsightsInputError extends Error {}

export async function runInsightsCli(
  arguments_: readonly string[],
  io: CliIo,
): Promise<number | undefined> {
  if (arguments_[0] !== "insights") return undefined;

  let command: ParsedInsightsCommand["name"] | null = identifyInsightsCommand(arguments_);
  try {
    const parsed = parseInsightsArguments(arguments_);
    command = parsed.name;
    using store = new InsightsStore();
    const data = await executeInsightsCommand(parsed, store, io.stdin);
    writeInsightsEnvelope(io, { schemaVersion: 1, status: "ok", data }, parsed.pretty);
    return 0;
  } catch (error) {
    const inputError = error instanceof InsightsInputError;
    writeInsightsEnvelope(io, {
      schemaVersion: 1,
      status: "error",
      data: {
        command,
        error: {
          code: inputError ? "INVALID_INPUT" : "INTERNAL_ERROR",
          message: inputError ? error.message : "Semantic Atlas insights failed unexpectedly.",
        },
      },
    }, false);
    if (!inputError && error instanceof Error && error.stack !== undefined) {
      io.stderr.write(`${error.stack}\n`);
    }
    return inputError ? 2 : 1;
  }
}

export function resolveInsightsRange(period: InsightsPeriod, now = new Date()): InsightsRange {
  if (period === "all") {
    return { from: "1970-01-01T00:00:00.000Z", to: "9999-12-31T23:59:59.999Z" };
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  if (period === "yesterday") start.setDate(start.getDate() - 1);
  if (period === "7d") start.setDate(start.getDate() - 6);
  if (period === "30d") start.setDate(start.getDate() - 29);
  const end = period === "yesterday" ? today : new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

async function executeInsightsCommand(
  command: ParsedInsightsCommand,
  store: InsightsStore,
  stdin: NodeJS.ReadableStream,
): Promise<InsightsSuccessData> {
  if (command.name === "insights.summary") {
    const range = resolveInsightsRange(command.period);
    return { command: command.name, range, summary: store.summary(range) };
  }
  if (command.name === "insights.feedback") {
    const range = resolveInsightsRange(command.period);
    return { command: command.name, range, reports: store.listFeedback(range, command.status) };
  }

  const input = await readJsonStandardInput(stdin, command.name);
  const parsed = feedbackReportUpdateInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new InsightsInputError("The feedback update input is invalid.");
  }
  return {
    command: command.name,
    report: store.updateFeedback({
      id: parsed.data.id,
      status: parsed.data.status,
      note: parsed.data.note,
    }),
  };
}

function parseInsightsArguments(arguments_: readonly string[]): ParsedInsightsCommand {
  const argumentsWithoutPretty = removePrettyOption(arguments_.slice(1));
  const [subcommand, action, ...rest] = argumentsWithoutPretty.remaining;
  if (subcommand === "summary") {
    return {
      name: "insights.summary",
      period: parsePeriodOption([action, ...rest], "insights summary"),
      pretty: argumentsWithoutPretty.pretty,
    };
  }
  if (subcommand === "feedback" && action === "update") {
    if (rest.length !== 1 || rest[0] !== "--stdin") {
      throw new InsightsInputError("insights feedback update requires exactly --stdin.");
    }
    return { name: "insights.feedback.update", pretty: argumentsWithoutPretty.pretty };
  }
  if (subcommand === "feedback") {
    const options = parseOptions([action, ...rest].filter(isDefined), ["--period", "--status"], "insights feedback");
    const statusValue = options.get("--status");
    const parsedStatus = statusValue === undefined ? undefined : feedbackStatusSchema.safeParse(statusValue);
    if (parsedStatus !== undefined && !parsedStatus.success) {
      throw new InsightsInputError("--status must be a feedback status.");
    }
    return {
      name: "insights.feedback",
      period: parsePeriod(options.get("--period")),
      ...(parsedStatus === undefined ? {} : { status: parsedStatus.data }),
      pretty: argumentsWithoutPretty.pretty,
    };
  }
  throw new InsightsInputError("The insights command is invalid.");
}

function removePrettyOption(arguments_: readonly string[]): {
  readonly remaining: readonly string[];
  readonly pretty: boolean;
} {
  const remaining: string[] = [];
  let pretty = false;
  for (const argument of arguments_) {
    if (argument === "--pretty") {
      if (pretty) throw new InsightsInputError("--pretty may only be provided once.");
      pretty = true;
    } else {
      remaining.push(argument);
    }
  }
  return { remaining, pretty };
}

function parsePeriodOption(arguments_: readonly (string | undefined)[], command: string): InsightsPeriod {
  return parsePeriod(parseOptions(arguments_.filter(isDefined), ["--period"], command).get("--period"));
}

function parseOptions(
  arguments_: readonly string[],
  allowed: readonly string[],
  command: string,
): ReadonlyMap<string, string> {
  if (arguments_.length % 2 !== 0) {
    throw new InsightsInputError(`${command} options require values.`);
  }
  const options = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index]!;
    const value = arguments_[index + 1]!;
    if (!allowed.includes(option) || value.startsWith("-") || options.has(option)) {
      throw new InsightsInputError(`${command} accepts only ${allowed.join(" and ")}.`);
    }
    options.set(option, value);
  }
  return options;
}

function parsePeriod(value: string | undefined): InsightsPeriod {
  if (value === undefined) return "today";
  const parsed = insightsPeriodSchema.safeParse(value);
  if (!parsed.success) {
    throw new InsightsInputError("--period must be one of today, yesterday, 7d, 30d, or all.");
  }
  return parsed.data;
}

async function readJsonStandardInput(
  stream: NodeJS.ReadableStream,
  command: string,
): Promise<unknown> {
  let contents = "";
  for await (const chunk of stream) contents += String(chunk);
  try {
    return JSON.parse(contents);
  } catch {
    throw new InsightsInputError(`${command} requires one complete JSON value on standard input.`);
  }
}

function identifyInsightsCommand(arguments_: readonly string[]): ParsedInsightsCommand["name"] | null {
  if (arguments_[0] !== "insights") return null;
  if (arguments_[1] === "summary") return "insights.summary";
  if (arguments_[1] !== "feedback") return null;
  return arguments_[2] === "update" ? "insights.feedback.update" : "insights.feedback";
}

function writeInsightsEnvelope(io: CliIo, envelope: InsightsEnvelope, pretty: boolean): void {
  const validated = insightsEnvelopeSchema.parse(envelope);
  io.stdout.write(`${JSON.stringify(validated, null, pretty ? 2 : undefined)}\n`);
}

function isDefined(value: string | undefined): value is string {
  return value !== undefined;
}
