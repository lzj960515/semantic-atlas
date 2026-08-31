# Semantic Atlas Accuracy Observations

This page defines the versioned task, independent-review, and maintenance evidence retained
from real engineering work. The [product contract](product-contract.md#accuracy-observations)
owns why observations exist; this page owns their data, persistence, replay,
and summary contract.

**Status: implemented with current task, review, and maintenance contracts.**

## Authority Boundary

Every business-changing engineering or analysis run produces one
`TaskObservation`, including runs in repositories with no map. It records what
the task Agent queried, which concepts it selected, how current evidence
classified map statements, which reconciliation candidates it found, and any
explicit human correction it received. Its strict schema has no review verdict
or accuracy fields.

An independent-review run produces one `ReviewObservation` that references an
existing task observation in the same repository partition. It records
business-boundary correctness, upstream-cause correctness, impact completeness,
required rework, and whether the map caused a wrong conclusion. Explicit human
corrections can be retained by either observation while remaining visibly
attributed as corrections.

An approved review expresses an accepted result: assessed dimensions are
correct or complete, `requiredRework` is `false`, and `mapCausedRegression` is
`false`. A `changes_requested` review sets `requiredRework` to `true` and
records the affected dimensions.

A post-integration maintenance run produces one `MaintenanceObservation`. It
references exact task-candidate positions, records the reviewed classification
and current evidence, and includes the owning YAML plus real merged commit when
the canonical map changed. Work-stage proposals are not observations.

## Versioned Schemas

Current task artifacts use `schemaVersion: 2`; review and maintenance artifacts
use `schemaVersion: 1`. All use an Agent-supplied immutable `id` and an RFC 3339
`recordedAt` value. The caller creates the ID and timestamp once and reuses the
complete document for an uncertain retry.

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
runtime evidence. Candidate kinds are node, relation, and anchor. Every
candidate names its stable `businessDomainId` and carries a candidate-specific
`confirmed`, `contradicted`, or `unresolved` disposition. Domain ownership and
disposition are recorded explicitly because they cannot be inferred safely from
source paths or free-form summaries.

`mapUpdateCandidates` may be empty. The engineering result reports whether the
stable meaning was already represented, remained implementation-local, or could
not yet be resolved. A non-empty candidate list is reserved for a
source-supported durable correction owned by a stable business domain.

Source, test, and document evidence uses normalized repository-relative paths.
Runtime references use concise environment-independent evidence labels.

Review identity also contains `taskId` and `runId`, plus the referenced
`taskObservationId`. Review accuracy values explicitly distinguish correct,
incorrect, complete, incomplete, not applicable, and not assessed outcomes.

Maintenance identity contains its task and run ID plus one `businessDomainId`.
Each result references `taskObservationId` and zero-based `candidateIndex`, then
records `accepted`, `refined`, `discarded`, or `unresolved`, an evidence-based
reason, and current evidence. Accepted and refined results require one
`docs/business-map/*.yaml` path and hexadecimal `mergedCommit`; a document with
only discarded and unresolved results omits `mapChange`.

The understanding Skill's [observation reference](../.agents/skills/semantic-atlas/references/observations.md)
contains complete task and review JSON examples. The maintenance Skill's
[reconciliation reference](../.agents/skills/semantic-atlas-maintenance/references/reconciliation.md)
contains the maintenance result shape.

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
├── reviews/<observation-id>.json
└── maintenances/<observation-id>.json
```

The directory `v1` identifies the private storage layout. Each artifact's own
`schemaVersion` controls its current data contract; unsupported versions make a
read fail visibly and are never migrated implicitly.

This partition is separate from `docs/business-map`, package contents, and Git.
Each observation is one JSON file. The implementation uses neither SQLite nor
a shared append-only JSONL file.

## Validation And Immutable Publication

The public write commands are:

```text
semantic-atlas observe task --stdin [--repo <path>]
semantic-atlas observe review --stdin [--repo <path>]
semantic-atlas observe maintenance --stdin [--repo <path>]
```

The CLI parses and strictly validates the current complete input before
resolving a write destination. Review recording then confirms that its task
observation already exists in the same repository partition. Maintenance
recording resolves every exact candidate position and verifies its explicit
business-domain ownership. The store reads
the same current task version that it writes. Before publication it writes and
syncs claim metadata, exposes the claim
through an atomic, non-overwriting link, then writes and syncs a private
observation staging file and atomically renames it into place. A
process-instance identity prevents a retrying process from treating its reused
PID as proof that it still owns an earlier claim. Unsupported claim shapes remain
untouched and block publication instead of being reinterpreted.
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

## Read-Only Reconciliation Candidates

The candidate discovery command is:

```text
semantic-atlas reconcile candidates --repo <path>
```

It derives one deterministic v1 report from the selected repository partition.
Exact domain, candidate kind, and candidate summary form a group. The report
contains only groups with a current actionable origin. Every returned task
occurrence remains visible with its candidate position, evidence disposition,
task query and evidence record, human correction, linked independent reviews,
and earlier unresolved maintenance history. Duplicate groups produce one
maintenance lead while preserving all origins. Accepted, refined, and discarded
results terminate their exact origins. When every remaining origin has only an
unresolved result, the group leaves `domains` and contributes to
`waitingForEvidenceOccurrences`; a new origin in the same group makes the full
unresolved-plus-new evidence set actionable again.

The command reads repository identity and immutable observation files only. It
does not edit observations, source, `docs/business-map`, rendered artifacts, or
Git state. The bundled `semantic-atlas-maintenance` Skill selects one business
domain, rechecks current source and tracked product meaning, and submits any
accepted correction as a normal reviewed YAML change. Unresolved and
implementation-local observations remain outside the canonical map. When the
repository has no map, the maintenance Skill can turn a supported candidate
into one bounded initial business-domain YAML. After independent review and
integration, the Skill records the result through `observe maintenance` and
requires a recorded or idempotent response before reporting completion.

## Engineering Result Semantics

Observation recording is a secondary evidence action after the engineering
result is known. The Skill also reports the post-task maintenance disposition;
observation failure is reported separately and keeps the engineering result
unchanged. Independent review can then distinguish a valid engineering delivery
with missing observation evidence from a successful accuracy record.
