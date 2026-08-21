# Insights Contract v1

## Question and scope

This page defines the local product-observability interface for Semantic Atlas.
It answers how a maintainer can evaluate adoption and confirmed friction without
adding work to a normal engineering task. The current contract is implemented
by `semantic-atlas insights` and `semantic-atlas feedback report`.

Insights are installation-scoped under `~/.semantic-atlas/insights.db`, or the
absolute `SEMANTIC_ATLAS_HOME` override. They are separate from each
repository's `atlas.db` knowledge and every worktree's `.atlas` projection.

## Data boundary

Every completed project command best-effort records one event containing:

- repository identity and the current snapshot identity when available;
- command name, outcome, exit code, stable warning codes, and rounded duration;
- a generated event ID and timestamp.

Events never contain command arguments, prompts, query text, source text, or
command output. A failure to write an event never changes the project command's
exit code, JSON response, or standard output.

`feedback report --stdin` stores explicit Agent input only when source
confirmation establishes meaningful product friction or a concrete improvement.
Each report includes a product classification, observed and expected behavior,
an optional suggestion, and up to five recent event IDs from the same
repository. The maintainer must keep this text concise and free of credentials,
source contents, prompts, command output, and unrelated task detail.

## Commands

| Command | Result |
| --- | --- |
| `semantic-atlas insights summary [--period <period>]` | Aggregates command outcomes, command names, warning codes, and feedback categories. |
| `semantic-atlas insights feedback [--period <period>] [--status <status>]` | Lists explicit feedback reports for review. |
| `semantic-atlas insights feedback update --stdin` | Writes one triage decision: `triaged`, `resolved`, or `dismissed`, with a required explanatory note. |
| `semantic-atlas feedback report --stdin` | Project-scoped write of one evidence-contextual product report. |

The default period is `today`; accepted period values are `today`, `yesterday`,
`7d`, `30d`, and `all`. Day boundaries use the executing machine's local time,
and stored timestamps are ISO-8601 UTC. `--pretty` indents insights responses.

## Envelope

`insights` commands write the strict, repository-independent schema in
`schemas/insights-envelope-v1.schema.json`:

```json
{
  "schemaVersion": 1,
  "status": "ok",
  "data": {
    "command": "insights.summary",
    "range": {
      "from": "2026-08-20T16:00:00.000Z",
      "to": "2026-08-21T16:00:00.000Z"
    },
    "summary": {
      "commands": { "total": 12, "outcomes": { "ok": 10, "partial": 2, "error": 0 }, "byCommand": [], "warningCodes": [] },
      "feedback": { "total": 1, "byCategory": [] }
    }
  }
}
```

The envelope intentionally omits repository and snapshot fields because one
installation-level query can aggregate many repositories. Individual feedback
reports retain their hashed repository and nullable snapshot identity.

Invalid input returns the same envelope with `status: "error"`,
`data.error.code: "INVALID_INPUT"`, and exit code `2`. An internal local-store
failure returns `INTERNAL_ERROR` and exit code `1`. Successful data, including
an empty range, returns exit code `0`.

## Interpretation

Command volume and warnings show usage shape; they are not a retrieval-recall
or task-quality score. Evaluate a product change by connecting trends to
source-confirmed feedback, reproducible investigations, tests, and fresh-agent
task evaluation. The `semantic-atlas-insights` Skill provides the daily review
and triage workflow while the primary Skill stays focused on development work.
