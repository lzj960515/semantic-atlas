---
name: semantic-atlas
description: "Use Semantic Atlas as the required first business-understanding loop in supported TypeScript or JavaScript repositories before feature implementation, bug fixing, debugging, refactoring, behavior-changing review, business-flow tracing, invariant and test discovery, or dependency or impact analysis. Git-only release work, mechanical formatting, unrelated documentation, and unsupported repositories stay in normal workflows."
compatibility: "Requires Node.js 22.12 through 24 and the semantic-atlas CLI."
---

# Semantic Atlas

Use the local, deterministic Atlas world map as the first business-understanding
surface for every supported task. Source code remains authoritative; Atlas is a
revision-aware projection that supplies bounded evidence, business context,
certainty, validity, and explicit structural limits.

The calling Agent owns task interpretation, source changes, tests, Git, and
review. The CLI accepts business vocabulary, stable business keys, structural
search terms, snapshot identifiers, and structured GraphPatch input; it does
not interpret natural-language tasks.

Business knowledge grows during real engineering tasks. Indexing publishes
structural evidence and refreshes existing assertions; it does not invent an
upfront business map. A root is any currently parentless business node, and a
later verified task may place that root beneath a newly discovered parent.

## Required business-understanding loop

1. Identify the exact target Git worktree before any Atlas command. Run from
   that worktree or pass its absolute path with `--repo <path>`, and confirm the
   response `repository.root` is the intended worktree.
2. Run one Atlas CLI command at a time and wait for its complete response. The
   current worktree publication and repository-wide knowledge transaction form
   a serialized evidence boundary.
3. Start with `semantic-atlas status` before broad source discovery. Read the
   versioned envelope, `data.freshness`, snapshot, warnings, and
   `data.backend.completeness` by stable fields and codes.
4. Complete the matching snapshot-bootstrap procedure as soon as status reports
   missing, stale, failed, or incomplete publication state.
5. Query the business world before broad source search: inspect the world
   `map view`, search compact business vocabulary, then zoom into and show the
   most relevant business region.
6. Classify the business response and complete every triggered reference before
   source confirmation. `BUSINESS_KNOWLEDGE_EMPTY`, weak, partial, stale,
   unsupported, or otherwise insufficient business results trigger result
   routing and explicit task-scoped `code search` fallback.
7. Open cited ranges and confirm decisive behavior in authoritative source.
   Follow only the dependencies, interfaces, data, invariants, or tests needed
   to answer or change the behavior.
8. Perform implementation, debugging, testing, and review through the normal
   engineering workflow.
9. Reconcile relevant source changes with Atlas, then make the mandatory
   knowledge-capture decision before completing the task.

## Query before broad source discovery

Extract two to four compact concepts from the task: business vocabulary,
likely symbols, interfaces or data, and dependency or impact terms. Query them
in this order:

1. Run `semantic-atlas map view` to see the current world regions and
   cross-region business connections.
2. Use `semantic-atlas map search <business-term> [--limit <n>]` for distinct
   business concepts that are not obvious from the world view.
3. Use `semantic-atlas map view <business-key>` to zoom one level at a time.
   Follow `breadcrumbs`, `child` regions, `context` regions, and connection
   summaries until the task's owning business area is visible.
4. Use `semantic-atlas map show <business-key>` to inspect the selected
   assertion, its direct business relationships, and direct structural evidence.
5. When the map is empty or insufficient, use
   `semantic-atlas code search <structural-term> [--limit <n>]` for likely
   symbols, interfaces, data, or framework entry points. Open the returned
   source locations directly.

An empty business world is a normal continuous-learning state. Structural
results provide a bounded evidence path for the active task and never become a
second map or substitute business regions.

Treat search score as ranking rather than certainty. Stop semantic zoom when it
identifies the necessary symbols, files, relationships, evidence, and explicit
uncertainty. If the map remains weak, use its best seeds for bounded source
inspection and route the observed weak state through the conditional reference.

## Source authority

Confirm every answer-controlling or change-controlling claim in source even
when Atlas reports `valid` plus `exact`. Keep structural support, business
certainty, and evidence validity separate:

- `exact` identifies uniquely supported structure or business evidence;
- `inferred` is supported Agent synthesis that remains distinguishable from an
  exact fact;
- `hypothesis` remains an exploration lead;
- `stale`, `unknown`, `unsupported`, `partial`, and `insufficient` results bound
  source fallback rather than authorizing a decisive claim.

When index warnings or source reveal dynamic ambiguity, preserve the unresolved
boundary in the task conclusion. Source inspection may resolve the current task
without turning the structural ambiguity into an exact Atlas claim.

## After source changes

1. Preserve the pre-change current snapshot ID when impact or semantic change
   matters.
2. Complete source changes and relevant tests through the normal workflow.
3. Run `semantic-atlas index` after relevant source changes and require a
   current, complete publication before trusting the refreshed map.
4. Run `semantic-atlas changes`; use `--from <snapshot-id>` and
   `--to <snapshot-id>` for an explicit persisted range.
5. Inspect node and relation additions, changes, removals, and
   `staleAssertions`. Re-query affected concepts and confirm the result against
   source and tests.

Treat a failed or incomplete publication as unavailable map state and retain
source as authority.

## Knowledge-capture decision

Before completing every supported task, classify the business meaning learned
during source confirmation:

- `reuse`: current knowledge already expresses the verified business meaning;
- `extend`: add a durable, verified `Capability`, `Scenario`, `Operation`,
  `Invariant`, `Interface`, or `Data` concept or supported relationship;
- `introduce`: create a verified concept as a provisional root when no credible
  parent is known yet;
- `reparent`: attach an existing node or subtree to a newly verified parent while
  preserving its key, evidence, and non-hierarchy relationships;
- `refine`: update an existing kind, label, summary, aliases, certainty, or
  evidence when source proves a better assertion;
- `transient`: keep transient or unverified observations only in task context,
  including symptoms, one-off notes, tentative runtime paths, Git facts, and
  hypotheses without durable evidence.

Persist every new durable, verified concept and supported relationship that
will help a later task. Reuse current knowledge without a duplicate patch when
it already captures the result.

When durable knowledge exists, read GraphPatch authoring, recheck status, submit
one atomic patch with `semantic-atlas learn --stdin`, then run
`semantic-atlas map show <learned-key>` to verify current validity, certainty,
evidence, and relationships. The verified node must be reusable by a later
fresh task through world view, business search, semantic zoom, and direct show.

## Conditional references

Load detailed procedures only after their matching observable state:

- Read [snapshot bootstrap](references/snapshot-bootstrap.md) only when status
  reports `missing`, `stale`, failed, or incomplete state.
- Read [result routing](references/result-routing.md) only when a command returns
  an error, warning, `hypothesis`, `unknown`, `unsupported`, `partial`, empty,
  competing, or otherwise `insufficient` result.
- Read [GraphPatch authoring](references/graph-patch.md) only when the
  knowledge-capture decision identifies durable verified knowledge to persist.

## Answer contract

Use Atlas internally as context rather than dumping raw envelopes. State the
relevant business concepts, files, symbols, and relationships; distinguish
exact evidence from inference; identify unresolved boundaries and their source
fallback; cite authoritative source and verification; and mention reindexing,
semantic changes, or learned knowledge when they materially affect the result.

## Responsibility boundary

Semantic Atlas owns deterministic indexing, revision-aware map queries,
semantic change records, and evidence-bound business knowledge in local Atlas data.
The calling Agent owns concept extraction, natural-language reasoning,
source editing, tests, Git operations, and review. Keep repository-specific
facts in Atlas or authoritative source and keep this Skill reusable across
repositories.
