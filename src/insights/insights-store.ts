import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { DatabaseSync as NodeDatabaseSync } from "node:sqlite";

import {
  type CommandOutcome,
  type FeedbackReportInput,
  type FeedbackStatus,
  type ObservedCommand,
} from "./contracts.js";
import { resolveInsightsDatabasePath } from "../storage/atlas-database.js";

const require = createRequire(import.meta.url);
const INSIGHTS_SCHEMA_VERSION = 1;

type DatabaseSyncConstructor = new (path: string) => NodeDatabaseSync;

export interface CommandObservationInput {
  readonly repositoryId: string;
  readonly command: ObservedCommand;
  readonly outcome: CommandOutcome;
  readonly exitCode: number;
  readonly warningCodes: readonly string[];
  readonly durationMs: number;
  readonly snapshotId: string | null;
}

export interface CommandObservation extends CommandObservationInput {
  readonly id: string;
  readonly occurredAt: string;
}

export interface FeedbackReport extends FeedbackReportInput {
  readonly id: string;
  readonly repositoryId: string;
  readonly snapshotId: string | null;
  readonly contextEventIds: string[];
  readonly status: FeedbackStatus;
  readonly note: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface InsightsRange {
  readonly from: string;
  readonly to: string;
}

export interface InsightsSummary {
  readonly commands: {
    readonly total: number;
    readonly outcomes: Record<CommandOutcome, number>;
    readonly byCommand: { readonly command: ObservedCommand; readonly count: number }[];
    readonly warningCodes: { readonly code: string; readonly count: number }[];
  };
  readonly feedback: {
    readonly total: number;
    readonly byCategory: { readonly category: FeedbackReport["category"]; readonly count: number }[];
  };
}

export class InsightsStore implements Disposable {
  readonly databasePath: string;
  readonly connection: NodeDatabaseSync;
  #closed = false;

  constructor(databasePath = resolveInsightsDatabasePath()) {
    this.databasePath = databasePath;
    const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: DatabaseSyncConstructor };
    this.connection = new DatabaseSync(databasePath);
    try {
      this.connection.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
      this.initializeSchema();
    } catch (error) {
      this.connection.close();
      throw error;
    }
  }

  close(): void {
    if (this.#closed) return;
    this.connection.close();
    this.#closed = true;
  }

  [Symbol.dispose](): void {
    this.close();
  }

  recordCommand(input: CommandObservationInput): CommandObservation {
    const observation: CommandObservation = {
      ...input,
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      warningCodes: [...input.warningCodes],
      durationMs: Math.max(0, Math.round(input.durationMs)),
    };
    this.connection.prepare(`
      INSERT INTO insight_command_events (
        id, repository_id, command, outcome, exit_code, warning_codes, duration_ms, snapshot_id, occurred_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      observation.id,
      observation.repositoryId,
      observation.command,
      observation.outcome,
      observation.exitCode,
      JSON.stringify(observation.warningCodes),
      observation.durationMs,
      observation.snapshotId,
      observation.occurredAt,
    );
    return observation;
  }

  recordFeedback(input: FeedbackReportInput & {
    readonly repositoryId: string;
    readonly snapshotId: string | null;
  }): FeedbackReport {
    const now = new Date().toISOString();
    const report: FeedbackReport = {
      ...input,
      id: randomUUID(),
      contextEventIds: this.recentCommandEventIds(input.repositoryId),
      repositoryId: input.repositoryId,
      snapshotId: input.snapshotId,
      status: "new",
      note: null,
      createdAt: now,
      updatedAt: now,
    };
    this.connection.prepare(`
      INSERT INTO insight_feedback_reports (
        id, repository_id, snapshot_id, kind, category, impact, observed, expected, suggestion,
        source_confirmed, context_event_ids, status, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      report.id,
      report.repositoryId,
      report.snapshotId,
      report.kind,
      report.category,
      report.impact,
      report.observed,
      report.expected,
      report.suggestion ?? null,
      Number(report.sourceConfirmed),
      JSON.stringify(report.contextEventIds),
      report.status,
      report.note,
      report.createdAt,
      report.updatedAt,
    );
    return report;
  }

  listFeedback(range: InsightsRange, status?: FeedbackStatus): FeedbackReport[] {
    const rows = this.connection.prepare(`
      SELECT *
      FROM insight_feedback_reports
      WHERE created_at >= ? AND created_at < ?
      ${status === undefined ? "" : "AND status = ?"}
      ORDER BY created_at DESC, id DESC
    `).all(
      range.from,
      range.to,
      ...(status === undefined ? [] : [status]),
    ) as unknown as readonly FeedbackRow[];
    return rows.map(presentFeedback);
  }

  updateFeedback(input: {
    readonly id: string;
    readonly status: FeedbackStatus;
    readonly note?: string;
  }): FeedbackReport {
    const updatedAt = new Date().toISOString();
    const result = this.connection.prepare(`
      UPDATE insight_feedback_reports
      SET status = ?, note = ?, updated_at = ?
      WHERE id = ?
    `).run(input.status, input.note ?? null, updatedAt, input.id);
    if (result.changes !== 1) throw new Error(`Feedback report ${input.id} was not found`);
    const row = this.connection.prepare(`
      SELECT * FROM insight_feedback_reports WHERE id = ?
    `).get(input.id) as unknown as FeedbackRow;
    return presentFeedback(row);
  }

  summary(range: InsightsRange): InsightsSummary {
    const commandRows = this.connection.prepare(`
      SELECT command, outcome, warning_codes
      FROM insight_command_events
      WHERE occurred_at >= ? AND occurred_at < ?
    `).all(range.from, range.to) as unknown as readonly CommandSummaryRow[];
    const feedbackRows = this.connection.prepare(`
      SELECT category
      FROM insight_feedback_reports
      WHERE created_at >= ? AND created_at < ?
    `).all(range.from, range.to) as unknown as readonly FeedbackSummaryRow[];
    const outcomes: Record<CommandOutcome, number> = { ok: 0, partial: 0, error: 0 };
    const commands = new Map<ObservedCommand, number>();
    const warnings = new Map<string, number>();
    for (const row of commandRows) {
      outcomes[row.outcome] += 1;
      commands.set(row.command, (commands.get(row.command) ?? 0) + 1);
      for (const code of parseStringArray(row.warning_codes)) {
        warnings.set(code, (warnings.get(code) ?? 0) + 1);
      }
    }
    const categories = new Map<FeedbackReport["category"], number>();
    for (const row of feedbackRows) {
      categories.set(row.category, (categories.get(row.category) ?? 0) + 1);
    }
    return {
      commands: {
        total: commandRows.length,
        outcomes,
        byCommand: [...commands.entries()]
          .map(([command, count]) => ({ command, count }))
          .sort((left, right) => left.command.localeCompare(right.command)),
        warningCodes: [...warnings.entries()]
          .map(([code, count]) => ({ code, count }))
          .sort((left, right) => left.code.localeCompare(right.code)),
      },
      feedback: {
        total: feedbackRows.length,
        byCategory: [...categories.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((left, right) => left.category.localeCompare(right.category)),
      },
    };
  }

  private recentCommandEventIds(repositoryId: string): string[] {
    const rows = this.connection.prepare(`
      SELECT id
      FROM insight_command_events
      WHERE repository_id = ?
      ORDER BY occurred_at DESC, id DESC
      LIMIT 5
    `).all(repositoryId) as unknown as readonly { readonly id: string }[];
    return rows.map((row) => row.id);
  }

  private initializeSchema(): void {
    const row = this.connection.prepare(`
      SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'insights_schema'
    `).get();
    if (row !== undefined) {
      const version = this.connection.prepare(`
        SELECT version FROM insights_schema WHERE singleton = 1
      `).get() as { readonly version: number };
      if (version.version !== INSIGHTS_SCHEMA_VERSION) {
        throw new Error(`Insights database schema ${version.version} is not supported`);
      }
      return;
    }
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      this.connection.exec(INSIGHTS_SCHEMA);
      this.connection.prepare(`
        INSERT INTO insights_schema (singleton, version, created_at) VALUES (1, ?, ?)
      `).run(INSIGHTS_SCHEMA_VERSION, new Date().toISOString());
      this.connection.exec("COMMIT");
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
}

interface FeedbackRow {
  readonly id: string;
  readonly repository_id: string;
  readonly snapshot_id: string | null;
  readonly kind: FeedbackReport["kind"];
  readonly category: FeedbackReport["category"];
  readonly impact: FeedbackReport["impact"];
  readonly observed: string;
  readonly expected: string;
  readonly suggestion: string | null;
  readonly source_confirmed: number;
  readonly context_event_ids: string;
  readonly status: FeedbackStatus;
  readonly note: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface CommandSummaryRow {
  readonly command: ObservedCommand;
  readonly outcome: CommandOutcome;
  readonly warning_codes: string;
}

interface FeedbackSummaryRow {
  readonly category: FeedbackReport["category"];
}

function presentFeedback(row: FeedbackRow): FeedbackReport {
  return {
    id: row.id,
    repositoryId: row.repository_id,
    snapshotId: row.snapshot_id,
    kind: row.kind,
    category: row.category,
    impact: row.impact,
    observed: row.observed,
    expected: row.expected,
    ...(row.suggestion === null ? {} : { suggestion: row.suggestion }),
    sourceConfirmed: row.source_confirmed === 1,
    contextEventIds: parseStringArray(row.context_event_ids),
    status: row.status,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Insights database contains an invalid string collection");
  }
  return [...parsed];
}

const INSIGHTS_SCHEMA = `
  CREATE TABLE insights_schema (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    version INTEGER NOT NULL CHECK (version = 1),
    created_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE insight_command_events (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    command TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('ok', 'partial', 'error')),
    exit_code INTEGER NOT NULL,
    warning_codes TEXT NOT NULL,
    duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
    snapshot_id TEXT,
    occurred_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX insight_command_events_time_index
    ON insight_command_events (occurred_at, command);
  CREATE INDEX insight_command_events_repository_time_index
    ON insight_command_events (repository_id, occurred_at DESC);

  CREATE TABLE insight_feedback_reports (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    snapshot_id TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('problem', 'suggestion')),
    category TEXT NOT NULL CHECK (category IN (
      'misleading-result', 'missing-knowledge', 'workflow-friction',
      'performance', 'cli-error', 'skill-instruction'
    )),
    impact TEXT NOT NULL CHECK (impact IN ('blocked', 'slowed', 'minor')),
    observed TEXT NOT NULL,
    expected TEXT NOT NULL,
    suggestion TEXT,
    source_confirmed INTEGER NOT NULL CHECK (source_confirmed IN (0, 1)),
    context_event_ids TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('new', 'triaged', 'resolved', 'dismissed')),
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  ) STRICT;

  CREATE INDEX insight_feedback_reports_time_index
    ON insight_feedback_reports (created_at DESC, status, category);
`;
