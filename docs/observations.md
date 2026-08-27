# Semantic Atlas Accuracy Observations

This page defines the versioned task and independent-review evidence retained
from real engineering work. The [product contract](product-contract.md#accuracy-observations)
owns why observations exist; this page owns their data, persistence, replay,
and summary contract.

**Status: implemented as a local v1 rollout candidate.**

## Authority Boundary

A `TaskObservation` records what the task Agent queried, which concepts it
selected, how current evidence classified map statements, which reconciliation
candidates it found, and any explicit human correction it received. Its strict
schema has no review verdict or accuracy fields.

A `ReviewObservation` references an existing task observation in the same
repository partition. Independent review records business-boundary correctness,
upstream-cause correctness, impact completeness, required rework, and whether
the map caused a wrong conclusion. Explicit human corrections can be retained
by either observation while remaining visibly attributed as corrections.

An approved review expresses an accepted result: assessed dimensions are
correct or complete, `requiredRework` is `false`, and `mapCausedRegression` is
`false`. A `changes_requested` review sets `requiredRework` to `true` and
records the affected dimensions.

## Versioned Schemas

Both artifacts use `schemaVersion: 1`, an Agent-supplied immutable `id`, and an
RFC 3339 `recordedAt` value. The caller creates the ID and timestamp once and
reuses the complete document for an uncertain retry.

Task identity contains `taskId` and `runId`. Every task observation contains at
least one map query with one of these outcomes:

- `context`, with one or more selected concept IDs;
- `concept_not_found`;
- `concept_ambiguous`;
- `map_not_found`;
- `unavailable`.

Current-evidence dispositions are `confirmed`, `missing`, `stale`,
`contradicted`, or `unresolved`. Each disposition and map-update candidate
contains evidence references classified as source, test, tracked document, or
runtime evidence. Candidate kinds are node, relation, and anchor.

Source, test, and document evidence uses normalized repository-relative paths.
Runtime references use concise environment-independent evidence labels.

Review identity also contains `taskId` and `runId`, plus the referenced
`taskObservationId`. Review accuracy values explicitly distinguish correct,
incorrect, complete, incomplete, not applicable, and not assessed outcomes.

The bundled Skill's [observation reference](../.agents/skills/semantic-atlas/references/observations.md)
contains complete task and review JSON examples.

## Repository Identity And Privacy

The CLI derives the repository partition itself. A Git checkout uses a SHA-256
identity derived from its common Git directory, so independent worktrees write
to one repository partition. A directory without Git metadata uses a separate
directory identity. The persisted artifact stores only the identity kind and
digest; repository paths and remote URLs remain outside observation files.

Observations live under the user's local data boundary:

```text
~/.semantic-atlas/observations/v1/repositories/<repository-id>/
├── tasks/<observation-id>.json
└── reviews/<observation-id>.json
```

This partition is separate from `docs/business-map`, package contents, and Git.
Each observation is one JSON file. The implementation uses neither SQLite nor
a shared append-only JSONL file.

## Validation And Immutable Publication

The public write commands are:

```text
semantic-atlas observe task --stdin [--repo <path>]
semantic-atlas observe review --stdin [--repo <path>]
```

The CLI parses and strictly validates the complete input before resolving a
write destination. Review recording then confirms that its task observation
already exists in the same repository partition. The store serializes the
complete versioned artifact. It writes and syncs claim metadata before exposing
the claim through an atomic, non-overwriting link, then writes and syncs a
private observation staging file and atomically renames it into place. A
process-instance identity prevents a retrying process from treating its reused
PID as proof that it still owns an earlier claim. Interrupted directory claims
from the earlier local candidate remain recoverable without removing a claim
whose owner is running.
Different IDs never share a file or append boundary.

The first successful write returns `recorded`. Replaying the same ID and exact
artifact returns `idempotent`. Reusing an ID with different content returns
`OBSERVATION_CONFLICT` and retains the first artifact. Failed validation and
failed publication produce no final observation file; staging and claim files
are removed by the failing invocation.

## Derived Insights

The read-only summary command is:

```text
semantic-atlas insights summary [--repo <path>] [--period <duration>]
```

Durations use a positive integer followed by `h`, `d`, or `w`. The command
derives these counts from retained artifacts:

- task observations, review observations, and approved reviews;
- correct, incorrect, and unassessed business boundaries;
- correct, incorrect, not-applicable, and unassessed upstream causes;
- complete, incomplete, and unassessed impact scope;
- reviews requiring rework and map-caused regressions;
- tasks with an explicit human correction;
- independently approved recoveries from missing, stale, or contradicted map
  evidence.

A recovery count joins the task's current-evidence disposition to an approved
review. The task Agent's own evidence never becomes an accuracy verdict merely
because it was retained.

## Engineering Result Semantics

Observation recording is a secondary evidence action after the engineering
result is known. The Skill reports a recording failure separately and keeps the
engineering result unchanged. Independent review can then distinguish a valid
engineering delivery with missing observation evidence from a successful
accuracy record.
