# Semantic Atlas v0.1 Product Contract

## Purpose and authority

Semantic Atlas is a local project world model used by AI coding agents. It connects code structure to durable business concepts, flows, data, rules, and interfaces so an agent can understand a project through business meaning instead of repeatedly reconstructing that meaning from source search.

Source code remains authoritative. Atlas is a revision-aware projection with explicit evidence and validity. A stale, unsupported, unresolved, or insufficient result sends the calling agent back to source inspection.

This document fixes the v0.1 product boundary. The versioned machine contracts live in `schemas/`; the storage and integration design is defined in [CodeGraph backend architecture](architecture/codegraph-backend.md).

## One-product boundary

Users and calling agents interact with one product:

- the `semantic-atlas` CLI supplies deterministic, machine-readable operations;
- the Semantic Atlas Skill teaches the calling agent when and how to use those operations;
- `@colbymchenry/codegraph` is an internal structural-index dependency behind an Atlas-owned adapter;
- CodeGraph's CLI, MCP server, storage model, and public types are not exposed as Semantic Atlas workflows.

Atlas interprets CodeGraph results through its own world-graph contract. Replacing or upgrading the structural backend does not change the public product identity.

## Agent workflow

### First use

1. The calling agent invokes `semantic-atlas status` in a target worktree.
2. If the current worktree has no usable world snapshot, the agent invokes `semantic-atlas index`.
3. Atlas creates local generated state under `<worktree>/.atlas/` and invokes the embedded CodeGraph SDK to build the structural graph.
4. In the same index lifecycle, Atlas records the repository snapshot, rebinds evidence, derives validity, and makes one unified world graph queryable.
5. The agent uses `map roots`, `map search`, `map children`, and `map show` to obtain business context connected to bounded structural evidence.
6. The agent opens authoritative source where evidence is stale, unresolved, unsupported, or insufficient and performs engineering work outside Atlas.
7. After relevant source changes, the agent reindexes, inspects `changes`, and submits verified business knowledge with `learn --stdin` against the current snapshot.

### Recurring use

1. The agent checks `status` before trusting stored knowledge.
2. A current world map is queried before broad source search.
3. Source edits, tests, Git operations, review, and natural-language reasoning remain normal agent work.
4. Reindexing updates the structural projection and invalidates only business assertions whose evidence can no longer be rebound.

## Responsibility boundary

| Concern | Semantic Atlas | Calling agent |
| --- | --- | --- |
| Product interface | Exposes the `semantic-atlas` CLI and Skill | Chooses the repository and task scope |
| Structural code model | Uses the embedded CodeGraph SDK for extraction, cross-file resolution, incremental sync, and structural queries | Reads source when the structural map is insufficient |
| Business world model | Stores and queries capabilities, scenarios, operations, invariants, interfaces, data, and their relationships | Understands natural language and decides which business assertions are justified |
| Unified graph | Connects business assertions to structural evidence and returns one Atlas graph contract | Uses graph results as bounded context |
| Evidence lifecycle | Records source locators and hashes, then derives `valid` or `stale` after indexing | Revalidates or replaces stale assertions |
| Source changes | Writes generated state only under `.atlas/` | Edits source and project configuration |
| Verification | Reports evidence, freshness, support, and unresolved boundaries | Runs tests, reviews diffs, and judges correctness |
| Git workflow | Reads Git state for snapshots without changing tracked state | Commits, merges, rebases, reviews, and releases |

## Storage and zero-intrusion contract

Each Git worktree owns one local store:

```text
<worktree>/
└── .atlas/
    ├── .gitignore
    ├── codegraph.db
    └── transient lock and SQLite sidecar files
```

- `.atlas/codegraph.db` is the single durable SQLite database. Its filename is an internal consequence of the embedded CodeGraph API, not a second product or a public compatibility promise.
- Atlas prepares `.atlas/.gitignore` so generated state does not change normal Git status. No tracked source file or project configuration is created or modified.
- Every worktree has an independent index because its checked-out and dirty source state can differ. v0.1 does not share one mutable structural database across worktrees or operating systems.
- CodeGraph owns its structural schema. Atlas owns namespaced business, evidence, snapshot, validity, and integration metadata in the same database.
- Atlas never copies CodeGraph structural nodes and edges into parallel Atlas structural tables. The Atlas query layer composes both ownership domains into one logical world graph.

## Index and consistency lifecycle

`semantic-atlas index` is the only public owner of the combined lifecycle:

1. acquire the Atlas worktree lock and mark the projection as building;
2. initialize or open CodeGraph with `CODEGRAPH_DIR=.atlas`;
3. run CodeGraph indexing or incremental sync and require a successful, complete result;
4. close the CodeGraph write lifecycle;
5. record the Atlas snapshot and structural-backend version;
6. rebind business evidence to the current structural graph and derive assertion validity;
7. publish the completed world snapshot and release the lock.

An interrupted or failed build remains explicit. Map commands do not present a partial structural graph as current.

Normal rebuilds use CodeGraph operations that preserve unknown tables in the same database. The Atlas adapter does not expose or invoke CodeGraph `recreate()` or `uninitialize()`, because those operations delete the physical database and therefore Atlas-owned business knowledge. Any future corruption-recovery path must preserve and restore Atlas-owned data before replacing the database file.

`learn` is an optimistic-concurrency transaction. It validates all evidence against the current completed snapshot and commits all operations together or none of them.

## World-model contract

The public graph has two ownership domains and one query surface:

- structural nodes and relations come from CodeGraph and describe where code lives and how statically discoverable code connects;
- business nodes and relations come from evidence-bound Atlas learning and describe why the system exists and how its business behavior flows;
- evidence links connect business assertions to structural nodes without foreign-key ownership of CodeGraph rows;
- map and change results expose Atlas identifiers, certainty, validity, support, and evidence without leaking backend table layouts.

Evidence stores a backend locator together with normalized path, symbol identity, source range, and content hash. A structural rebuild may replace backend rows, so Atlas rebinds evidence after indexing. Failed rebinding produces `stale`; it never silently deletes or upgrades a business assertion.

## Supported scope

v0.1 supports business understanding for TypeScript and JavaScript projects, with initial evaluation coverage for NestJS, GraphQL, TypeORM, and BullMQ flows. CodeGraph supplies the structural coverage available from the pinned dependency version. Atlas reports unsupported or unresolved structure instead of promising complete JavaScript runtime semantics.

Framework knowledge is implemented as Atlas-owned business interpretation over structural queries. It focuses on capabilities, operations, interfaces, data flow, rules, tests, and their evidence. Language parsing, cross-file symbol resolution, callers, callees, and file dependencies remain the structural backend's responsibility.

## Non-goals

v0.1 does not provide:

- a second CodeGraph-facing product, CLI, MCP server, or user workflow;
- a new compiler, language server, or general-purpose JavaScript runtime analyzer;
- a duplicate copy of CodeGraph's structural graph in Atlas-owned tables;
- a language model, embeddings, vector search, or natural-language inference inside the CLI;
- source editing, test execution, Git mutation, code review, or release automation;
- exact claims for runtime-only behavior that the structural backend cannot establish;
- a human-facing IDE, documentation site, or graph explorer.

## Dependency policy

The first implementation directly depends on a pinned, verified `@colbymchenry/codegraph` npm version and uses its public SDK. No upstream change or source copy is required for v0.1. An upgrade must pass adapter contract tests for directory placement, schema coexistence, index/sync behavior, structural query normalization, business-data preservation, evidence rebinding, and Node.js compatibility before the pinned version changes.

The fallback order is direct dependency, a small upstream extension, a thin maintained fork, then selective vendoring. Vendoring retains the upstream MIT notice and is used only when a required product boundary cannot be maintained through the SDK.

## Release gate

The v0.1.0 release requires all of the following on the release commit:

1. A packaged install uses the pinned CodeGraph SDK through an Atlas-owned adapter and exposes no CodeGraph CLI or MCP workflow.
2. `semantic-atlas index` creates only ignored `.atlas/` state in the target worktree and leaves tracked files and normal Git status unchanged.
3. CodeGraph and Atlas migrations coexist in one `.atlas/codegraph.db` without schema ownership collisions.
4. Initial index, incremental sync, interrupted index recovery, and structural-only rebuild preserve Atlas-owned business knowledge.
5. Business evidence rebinds after stable structural changes and becomes visibly stale after changed or missing evidence.
6. Unified map queries traverse business and structural relationships through one versioned Atlas response contract.
7. Packaged CLI smoke flows pass on supported Node.js versions and operating systems.
8. Static and Fresh Agent verification of the packaged Semantic Atlas Skill passes.
9. At least 12 paired Fresh Agent business-location and dependency/impact cases preserve necessary-file recall, necessary-symbol recall, and answer correctness while reducing either median unique opened source files or median source input tokens by at least 30 percent.
10. No evaluated answer presents stale, hypothesis, unresolved, or unsupported knowledge as exact.

The gate is fixed before comparative results are collected. A failed gate creates follow-up work; it does not broaden the current task until it passes.

## Related contracts

- [CodeGraph backend architecture](architecture/codegraph-backend.md)
- [Graph model](contracts/graph-model.md)
- [CLI v1](contracts/cli-v1.md)
- [GraphPatch v1](contracts/graph-patch-v1.md)
- [Evaluation protocol](evaluation.md)
