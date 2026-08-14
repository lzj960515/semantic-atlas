---
name: semantic-atlas
description: "Use Semantic Atlas for evidence-bound project understanding and impact analysis in TypeScript or JavaScript repositories: locate business capabilities and implementations, trace dependencies, inspect invariants and tests, assess semantic changes, and preserve verified business knowledge. Use when a repository has the semantic-atlas CLI or a local Atlas map; route source editing, testing, Git, and review to normal engineering workflows."
compatibility: "Requires Node.js 22.12 through 24 and the semantic-atlas CLI."
---

# Semantic Atlas

Use the local, deterministic Atlas world map as the first project-understanding
surface. Source code remains authoritative; Atlas data is a revision-aware
projection that supplies bounded context, evidence, certainty, validity, and
explicit structural limits.

The calling Agent owns concept extraction and natural-language reasoning. The
CLI accepts lexical terms, graph identifiers, snapshot identifiers, and a
structured GraphPatch; it does not interpret a natural-language task.

Run one Atlas CLI command at a time within a worktree and wait for its complete
response before starting the next command. The worktree-local database and
publication lifecycle are a serialized evidence boundary; parallel status,
index, map, changes, or learn calls can observe transient publication state.

## First use

1. Identify the exact target Git worktree. Keep all commands scoped to that
   worktree with the current directory or `--repo <path>`.
2. Run `semantic-atlas status` and parse the versioned JSON envelope. Use fields
   such as `status`, `data.freshness`, `snapshot`, `warnings`, and
   `data.backend.completeness`; use stable codes rather than message text.
3. Run `semantic-atlas index` when freshness is `missing` or `stale`, or when
   backend completeness is not `complete`. Indexing owns generated `.atlas/`
   state inside this worktree.
4. Run `semantic-atlas map roots` on a current snapshot. Business `Capability`
   roots appear after learning; structural `Module` roots provide the initial
   map before business knowledge exists.
5. Extract two to four compact concepts from the task: business vocabulary,
   likely symbols, interfaces or data, and dependency/impact terms. Use those
   concepts to begin the recurring-task protocol.

When the CLI, repository, or language is unavailable, follow [result
routing](references/result-routing.md) and continue through bounded source
fallback.

## Recurring task

1. Start every distinct task with `semantic-atlas status`. Trust a stored map
   only when the world snapshot is current and the backend is complete.
2. Query before broad source exploration:
   - use `semantic-atlas map search <query> [--limit <n>]` for each compact
     lexical concept;
   - use `semantic-atlas map show <node-id> [--depth <n>]` to inspect promising
     nodes, evidence-rich neighbors, invariants, tests, and unknown boundaries;
   - use `semantic-atlas map children <node-id>` to descend business `part_of`
     or structural `contains` hierarchies;
   - revisit `semantic-atlas map roots` when the task crosses capabilities or
     the first search vocabulary is weak.
3. Begin with depth 1 and expand a promising node to depth 2 or 3 only when the
   task requires the additional dependency path. Treat search score as ranking,
   not certainty.
4. Stop map traversal when it identifies the necessary symbols, files,
   relationships, evidence, and explicit uncertainty for the task. Open the
   cited source ranges to confirm behavior that controls the answer or change.
5. Perform implementation, debugging, tests, and review through the normal
   engineering workflow, using the Atlas results as bounded context.

## Interpret Atlas results

Classify every result before using it:

| Result | Agent treatment |
| --- | --- |
| `valid` plus `exact` | Use as current evidence for the stated assertion and confirm decisive behavior in source. |
| `valid` plus `inferred` | Preserve the result as a supported Agent inference and inspect source before presenting it as exact. |
| `hypothesis` | Treat as an exploration lead and verify it independently. |
| `stale` | Use identity and vocabulary only; reindex, then re-open authoritative source for the assertion. |
| `unknown` | Preserve the owner-linked unknown boundary, reason, location, and candidates; inspect that bounded source area. |
| `unsupported` | Use supported results as partial context and inspect the unsupported language or construct in source. |
| `partial` | Consume usable fields and route each warning or boundary independently. |
| `insufficient` map | Fall back from the best available seeds and complete the task from source. |

Structural `support.status` describes backend resolution. Business `certainty`
describes the Agent's assertion. Business `validity` describes evidence
freshness. Keep these dimensions separate: an exact call edge alone does not
prove a business rule, and a current hypothesis remains a hypothesis.

Read [result routing](references/result-routing.md) when status, index, or a map
query returns an error envelope, warnings, no relevant results, or competing
candidates.

## Bounded source fallback

1. Assemble the smallest source seed set from current result locations,
   evidence, structural IDs, unknown owners, and finite candidates.
2. Open the cited ranges and enough surrounding code to understand the owning
   declaration. Follow only the imports, callers, callees, interfaces, data, or
   tests required by the task.
3. Reformulate one Atlas query when source supplies a more precise business or
   symbol term. This often reconnects the task to mapped context.
4. When Atlas supplies no usable seed, run a narrow ordinary source search for
   the task's most distinctive identifier or contract, then continue the normal
   source workflow from confirmed results.
5. Base the conclusion on source for every stale, hypothesis, unknown,
   unsupported, ambiguous, or map-insufficient portion. Retain the boundary in
   the answer when source inspection cannot resolve it.

This fallback bounds discovery without replacing the calling Agent's generic
source-reading and search capabilities.

## After source changes

1. Preserve the pre-change current snapshot ID when the task may need impact or
   semantic-change inspection.
2. Complete source editing and relevant tests through the normal workflow.
3. Run `semantic-atlas index` after relevant source changes. Treat a failed or
   incomplete publication as unavailable map state and keep working from source.
4. Run `semantic-atlas changes`; provide `--from <snapshot-id>` and
   `--to <snapshot-id>` when the task requires an explicit persisted range.
5. Inspect node and relation additions, changes, removals, and
   `staleAssertions`. Re-run map queries for affected concepts and confirm the
   resulting impact against source and tests.
6. Consider learning only after the new snapshot is current and the engineering
   result is verified.

Structural fact counters summarize graph publication work; semantic impact
comes from `changes`, map traversal, source, and tests.

## Learn verified knowledge

Learning is optional. Use it for durable business capabilities, scenarios,
operations, invariants, interfaces, data, and their supported relationships
when that knowledge will help later tasks.

1. Read [GraphPatch authoring](references/graph-patch.md).
2. Recheck `semantic-atlas status` immediately before authoring. Use the current
   snapshot ID as `baseSnapshotId`.
3. Derive evidence from current map results and inspected source. Every evidence
   item must use a current structural symbol ID, exact repository-relative file,
   one-based range, and current file `contentHash` returned by Atlas.
4. Choose `exact` for uniquely proven assertions, `inferred` for supported Agent
   synthesis, and `hypothesis` for explicitly exploratory knowledge. Prefer
   fresh, exact evidence for durable facts.
5. Send one complete JSON GraphPatch value to `semantic-atlas learn --stdin`.
   Apply related operations together so optimistic-concurrency validation is
   atomic.
6. Inspect the response and query the learned key with `semantic-atlas map show`
   to verify the resulting certainty, validity, evidence, and relationships.
7. If the snapshot or evidence changed, refresh the map and rebuild the patch
   from current results. The current snapshot ID and evidence are the write
   boundary.

## Answer contract

Use Atlas internally as context rather than dumping raw envelopes. In the task
answer:

- state the relevant business concept, files, symbols, and relationships;
- distinguish current exact evidence from Agent inference;
- identify stale, hypothesis, unknown, unsupported, ambiguous, or insufficient
  portions and the source inspection used to handle them;
- cite the authoritative source and relevant verification for engineering
  conclusions;
- mention reindexing, semantic changes, or learned knowledge when those actions
  materially affect the result.

## Responsibility boundary

Semantic Atlas owns deterministic indexing, revision-aware map queries,
semantic change records, and evidence-bound business knowledge in local Atlas
data. The calling Agent owns concept extraction, natural-language reasoning,
source editing, tests, Git operations, and review. Keep repository-specific
facts in Atlas or authoritative source; keep this Skill reusable across
repositories.
