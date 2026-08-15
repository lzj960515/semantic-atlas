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
review. The CLI accepts lexical queries, graph identifiers, snapshot identifiers,
and structured GraphPatch input; it does not interpret natural-language tasks.

## Required business-understanding loop

1. Identify the exact target Git worktree before any Atlas command. Run from
   that worktree or pass its absolute path with `--repo <path>`, and confirm the
   response `repository.root` is the intended worktree.
2. Run one Atlas CLI command at a time and wait for its complete response. The
   worktree-local database and publication lifecycle form a serialized evidence
   boundary.
3. Start with `semantic-atlas status` before broad source discovery. Read the
   versioned envelope, `data.freshness`, snapshot, warnings, and
   `data.backend.completeness` by stable fields and codes.
4. Complete the matching procedure in [Conditional references](#conditional-references)
   as soon as the observed status needs indexing or bootstrap.
5. Query the current map with compact task vocabulary before broad source
   search. Let map evidence, owners, candidates, and unknown boundaries define
   the initial source seed set.
6. Classify the map response and complete every triggered reference before
   source confirmation. Relevant structural nodes with no relevant business
   node trigger snapshot bootstrap; weak, partial, unknown, unsupported, or
   otherwise insufficient results trigger result routing.
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
in this order as useful:

1. Use `semantic-atlas map search <query> [--limit <n>]` for each distinct
   lexical concept.
2. Use `semantic-atlas map show <node-id> [--depth <n>]` on promising business
   or structural nodes. Begin at depth 1 and expand to 2 or 3 only for a needed
   dependency path.
3. Use `semantic-atlas map children <node-id>` to descend business `part_of` or
   structural `contains` hierarchies.
4. Use `semantic-atlas map roots` when the task crosses capabilities, the
   initial vocabulary is weak, or the current map has no relevant business root.

When search and roots return relevant structural nodes but no relevant business
node, read snapshot bootstrap before opening source. That state starts the
incremental business-map path rather than the abnormal-result path alone.

Treat search score as ranking rather than certainty. Stop map traversal when it
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

Preserve every owner-linked unknown boundary with its reason, location, and
finite candidates. Source inspection may resolve the task while the Atlas
boundary remains honestly unknown.

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

- Persist every new durable, verified `Capability`, `Scenario`, `Operation`,
  `Invariant`, `Interface`, or `Data` concept, plus every supported relationship
  between them, when missing or insufficient Atlas knowledge caused the source
  inspection.
- Keep transient or unverified observations only in task context. Examples
  include debugging symptoms, one-off implementation notes, tentative runtime
  paths, Git facts, and hypotheses that lack durable evidence.
- When current Atlas knowledge already expresses the verified business meaning,
  reuse it and avoid a duplicate patch.

When durable knowledge exists, read GraphPatch authoring, recheck status, submit
one atomic patch with `semantic-atlas learn --stdin`, then run
`semantic-atlas map show <learned-key>` to verify current validity, certainty,
evidence, and relationships. The verified node must be reusable by a later
fresh task through normal map search and traversal.

## Conditional references

Load detailed procedures only after their matching observable state:

- Read [snapshot bootstrap](references/snapshot-bootstrap.md) only when status
  reports `missing`, `stale`, or incomplete state; a current map has no relevant
  business knowledge; or the user explicitly requests project initialization.
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
