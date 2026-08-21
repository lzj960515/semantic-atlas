# Semantic Atlas Product Contract

## Purpose and authority

Semantic Atlas is a local project world model used by AI coding agents and by
people who need a read-only view of established business knowledge. It connects
code structure to durable business concepts, flows, data, rules, and interfaces
so an agent can work from business meaning and a person can browse the resulting
map without reading implementation code first.

Source code remains authoritative. Atlas is a revision-aware projection with explicit evidence and validity. A stale, unsupported, unresolved, or insufficient result sends the calling agent back to source inspection.

This document defines the current product boundary. The versioned machine contracts live in `schemas/`; the storage and integration design is defined in [CodeGraph backend architecture](architecture/codegraph-backend.md).

## One-product boundary

Users and calling agents interact with one product:

- the `semantic-atlas` CLI supplies deterministic, machine-readable operations;
- the `semantic-atlas` Skill teaches the calling agent when and how to use those operations;
- the separate `semantic-atlas-insights` Skill supports deliberate product review and feedback triage;
- `semantic-atlas web` serves a local desktop viewer and read-only HTTP API over
  eligible primary `main` or `master` working trees;
- `@colbymchenry/codegraph` is an internal structural-index dependency behind an Atlas-owned adapter;
- CodeGraph's CLI, MCP server, storage model, and public types are not exposed as Semantic Atlas workflows.

Atlas interprets CodeGraph results through its own world-graph contract. Replacing or upgrading the structural backend does not change the public product identity.

## Agent workflow

### Required business-understanding loop

1. For every supported task that implements, fixes, debugs, refactors, reviews, traces, or assesses business behavior, the agent identifies the exact target worktree and invokes `semantic-atlas status` before broad source discovery.
2. Atlas commands run serially. A missing, stale, failed, or incomplete snapshot loads the bootstrap procedure and invokes `semantic-atlas index`; a current complete snapshot proceeds directly to map queries.
3. The agent starts from `map view`, searches business vocabulary with `map search`, zooms into relevant regions with `map view <business-key>`, and inspects direct evidence with `map show`. When business knowledge is absent or insufficient, `code search` returns a bounded structural source seed set instead of mixing code symbols into the business map.
4. The agent confirms answer-controlling and change-controlling behavior in authoritative source. Source edits, tests, Git operations, review, and natural-language reasoning remain normal engineering work outside Atlas.
5. After relevant source changes, the agent reindexes, inspects `changes`, re-queries affected concepts, and confirms the refreshed projection against source and tests.
6. Before completing the task, the agent makes a knowledge-capture decision. Every newly discovered durable, verified business concept and supported relationship caused by missing or insufficient map knowledge is submitted with `learn --stdin` and verified through `map show`; transient and unverified observations remain task context.

Detailed bootstrap, abnormal-result routing, and GraphPatch procedures are state-conditioned Skill references rather than permanently loaded first-use instructions.

### Task-driven continuous learning

A normal task adds only the durable business knowledge it verifies while doing the requested engineering work. This makes ordinary work incrementally improve later map queries without requiring a separate repository-wide business-learning phase.

An indexed repository may legitimately have no business nodes. In that state, the world `map view` returns `regions: []` with `BUSINESS_KNOWLEDGE_EMPTY`; the agent uses `code search` and source as a bounded fallback for the current task. After source and tests establish durable meaning, the agent records only that reusable knowledge. Later tasks may add a broader parent and place an existing root beneath it without changing the existing node identity.

### Human read workflow

`semantic-atlas web` starts a loopback server and bundled desktop interface. The
viewer lists one primary working tree per Atlas repository only when that tree
is on `main` or `master`; linked worktrees and other branches are outside the
Web product. A person selects a project, reads the world view, enters established
business regions, searches business vocabulary, and inspects direct node
details and evidence.

The Web surface is read-only. It does not index, learn, submit GraphPatch,
search arbitrary code, select a worktree, switch branches, or mutate source,
Git, configuration, Skills, or Atlas knowledge. Its HTTP adapter and the CLI
call shared Atlas application services rather than invoking one another.

## Responsibility boundary

| Concern | Semantic Atlas | Calling agent |
| --- | --- | --- |
| Product interface | Exposes the `semantic-atlas` CLI, two focused Skills, and a local desktop read-only Web viewer | Chooses the repository, task scope, and maintenance cadence; people browse eligible primary-branch knowledge without changing it |
| Installation lifecycle | Ships version-matched primary and insights Skills, synchronizes them through `semantic-atlas setup`, and upgrades the global package plus Skills through `semantic-atlas upgrade` | Performs the initial global npm installation and can invoke setup or upgrade from any directory |
| Structural code model | Uses the embedded CodeGraph SDK for extraction, cross-file resolution, incremental sync, and structural queries | Reads source when the structural map is insufficient |
| Business world model | Stores and queries capabilities, scenarios, operations, invariants, interfaces, data, and their relationships | Understands natural language and decides which business assertions are justified |
| Unified graph | Connects business assertions to structural evidence and returns one Atlas graph contract | Uses graph results as bounded context |
| Evidence lifecycle | Records source locators and hashes, then derives `valid` or `stale` after indexing | Revalidates or replaces stale assertions |
| Generated state | Writes durable knowledge under the user Atlas home and disposable structure under ignored `.atlas/` | Edits source and project configuration |
| Product observability | Best-effort records objective command events and explicit feedback in the installation-level insights store | Reviews signals, validates reports, and chooses product follow-up work |
| Verification | Reports evidence, freshness, support, and unresolved boundaries | Runs tests, reviews diffs, and judges correctness |
| Git workflow | Reads Git state for snapshots without changing tracked state | Commits, merges, rebases, reviews, and releases |

## Storage and zero-intrusion contract

Atlas separates repository knowledge from worktree structure:

```text
~/.semantic-atlas/repositories/<repository-id>/
└── atlas.db                 repository-wide durable knowledge

~/.semantic-atlas/
└── insights.db              installation-level product observations and feedback

<worktree>/
└── .atlas/
    ├── .gitignore
    ├── codegraph.db         worktree-local disposable CodeGraph projection
    └── transient lock and SQLite sidecar files
```

- The user-level `atlas.db` stores business knowledge, repository snapshots, snapshot-specific evidence bindings and validity, plus one publication chain for each Git directory.
- The separate user-level `insights.db` stores product command metadata and explicit feedback. It contains no business assertions, structural projection data, command arguments, prompts, source text, or command output.
- `SEMANTIC_ATLAS_HOME` is the only storage override. It must be absolute; the default is `~/.semantic-atlas`.
- Atlas prepares `.atlas/.gitignore` so generated state does not change normal Git status. No tracked source file or project configuration is created or modified.
- Every worktree has an independent CodeGraph index because its checked-out and dirty source state can differ. A missing index is copied from the best compatible sibling through SQLite backup and always incrementally synchronized before publication; full indexing is the fallback.
- `.atlas/codegraph.db` contains only CodeGraph-owned structural schema. Deleting a worktree discards this projection without deleting repository knowledge.
- Atlas never copies CodeGraph structural nodes and edges into parallel Atlas structural tables. The Atlas query layer composes both ownership domains into one logical world graph.

## Index and consistency lifecycle

`semantic-atlas index` is the only public owner of the combined lifecycle:

1. acquire the Atlas worktree lock and mark that Git directory's central state as `building`;
2. bootstrap a missing CodeGraph projection from a compatible sibling when possible, then initialize or open CodeGraph with `CODEGRAPH_DIR=.atlas`;
3. run CodeGraph indexing or incremental sync and verify the repository snapshot against its indexed source manifest;
4. commit the local structural publication so the CodeGraph projection is durable;
5. atomically record the snapshot-specific bindings, validity, and worktree publication in the user-level Atlas database;
6. move that worktree state to `current` and release the lock.

An interrupted or failed build remains explicit. Map commands do not present a partial structural graph as current.

Structural failure restores the previous worktree projection. If the local projection commits but the central Atlas transaction fails, the worktree stays fail closed; the next `index` performs an incremental no-op or sync and republishes central state. No Atlas business data needs to be restored into CodeGraph.

`learn` is an optimistic-concurrency transaction. It validates all evidence against the current completed snapshot and commits all operations together or none of them.

## World-model contract

The public graph has two ownership domains and one query surface:

- structural nodes and relations come from CodeGraph and describe where code lives and how statically discoverable code connects;
- business nodes and relations come from evidence-bound Atlas learning and describe why the system exists and how its business behavior flows;
- evidence links connect business assertions to structural nodes without foreign-key ownership of CodeGraph rows;
- map and change results expose Atlas identifiers, certainty, validity, support, and evidence without leaking backend table layouts.

Evidence stores a backend locator together with normalized path, symbol identity, source range, and content hash. A structural rebuild may replace backend rows, so Atlas rebinds evidence after indexing. Failed rebinding produces `stale`; it never silently deletes or upgrades a business assertion.

`map view` projects one canonical business graph into the frontier needed by the current task. The world view exposes every current parentless business node as a root region. A focused view exposes direct child regions, breadcrumb context, and cross-boundary business connections aggregated from deeper asserted relations. Projection counts preserve direct versus aggregated contributors plus certainty and validity distributions; projected connections are never persisted as new facts.

Root placement is provisional. Business keys remain stable vocabulary identifiers while `part_of` is the hierarchy authority; every node has at most one `part_of` parent and the hierarchy is acyclic. Structural modules and symbols remain available only through explicit `code search` fallback and never substitute for an empty business map.

## Supported scope

The current release supports business understanding for TypeScript and JavaScript projects, with initial evaluation coverage for NestJS, GraphQL, TypeORM, and BullMQ flows. CodeGraph supplies the structural coverage available from the pinned dependency version. Atlas reports unsupported or unresolved structure instead of promising complete JavaScript runtime semantics.

Framework knowledge is implemented as Atlas-owned business interpretation over structural queries. It focuses on capabilities, operations, interfaces, data flow, rules, tests, and their evidence. Language parsing, cross-file symbol resolution, callers, callees, and file dependencies remain the structural backend's responsibility.

## Non-goals

Semantic Atlas does not provide:

- a second CodeGraph-facing product, CLI, MCP server, or user workflow;
- a new compiler, language server, or general-purpose JavaScript runtime analyzer;
- a duplicate copy of CodeGraph's structural graph in Atlas-owned tables;
- a language model, embeddings, vector search, or natural-language inference inside the CLI;
- source editing, test execution, Git mutation, code review, or release automation;
- exact claims for runtime-only behavior that the structural backend cannot establish;
- a human-facing IDE, source editor, business-knowledge authoring UI, mobile
  application, or remote collaboration service.

## Dependency policy

The first implementation directly depends on pinned `@colbymchenry/codegraph` 1.5.0 and uses its existing public SDK. No upstream change or source copy is required. An upgrade must pass adapter contract tests for directory placement, index/sync behavior, sibling bootstrap compatibility, structural query normalization, evidence rebinding, and Node.js compatibility before the pin changes.

The fallback order is direct dependency, a small upstream extension, a thin maintained fork, then selective vendoring. Vendoring retains the upstream MIT notice and is used only when a required product boundary cannot be maintained through the SDK.

## Release gate

Every public release requires all of the following on the release commit:

1. A packaged install uses the pinned CodeGraph SDK through an Atlas-owned adapter and exposes no CodeGraph CLI or MCP workflow.
2. `semantic-atlas index` creates only ignored `.atlas/` state in the target worktree and leaves tracked files and normal Git status unchanged.
3. The user Atlas database contains `atlas_*` objects while every worktree CodeGraph database contains none.
4. Initial index, sibling bootstrap, incremental sync, interrupted index recovery, and worktree deletion preserve Atlas-owned business knowledge.
5. Business evidence rebinds after stable structural changes and becomes visibly stale after changed or missing evidence.
6. Business map views zoom deterministically through one hierarchy, preserve evidence summaries on aggregated connections, and keep business search separate from structural code fallback.
7. Packaged CLI smoke flows pass on supported Node.js versions and operating systems.
8. Static and Fresh Agent verification of the packaged Semantic Atlas Skill passes.
9. At least 12 paired Fresh Agent business-location and dependency/impact cases preserve necessary-file recall, necessary-symbol recall, and answer correctness while reducing either median unique opened source files or median source input tokens by at least 30 percent.
10. No evaluated answer presents stale, hypothesis, unresolved, or unsupported knowledge as exact.
11. The packaged `web` command serves the bundled desktop application and the
    versioned loopback HTTP API without executing CLI map subprocesses.
12. The Web catalog returns only primary working trees on `main` or `master`,
    excludes linked worktrees, exposes no mutation route, and leaves Agent CLI
    behavior and stored graph contracts unchanged.

The gate is fixed before comparative results are collected. A failed gate creates follow-up work; it does not broaden the current task until it passes.

## Related contracts

- [CodeGraph backend architecture](architecture/codegraph-backend.md)
- [Graph model](contracts/graph-model.md)
- [CLI v1](contracts/cli-v1.md)
- [Insights v1](contracts/insights-v1.md)
- [HTTP API v1](contracts/http-api-v1.md)
- [GraphPatch v1](contracts/graph-patch-v1.md)
- [Desktop Web viewer](architecture/web-viewer.md)
- [Evaluation protocol](evaluation.md)
