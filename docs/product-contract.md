# Semantic Atlas v0.1 Product Contract

## Purpose and authority

Semantic Atlas is a local, persistent project world model for AI coding agents. It projects compiler-derived structure and agent-verified business knowledge into a revision-aware graph. Source code is always authoritative. Atlas data is disposable, can be rebuilt, and never replaces source inspection when evidence is stale, unknown, unsupported, or insufficient.

This document fixes the v0.1 product boundary. The versioned machine contracts live in `schemas/`; human-readable details live in the other documents under `docs/`.

## Agent workflow

### First use

1. The calling agent invokes `semantic-atlas status` in a target repository.
2. If no current snapshot exists, the agent invokes `semantic-atlas index`.
3. Atlas inspects Git, package metadata, tsconfig projects, and supported source files without writing to the target repository.
4. The agent uses `map roots`, `map search`, `map children`, and `map show` to obtain bounded structural evidence and explicit unknown boundaries.
5. The agent opens enough authoritative source to answer the task and performs normal engineering work outside Atlas.
6. After source changes, the agent reindexes, inspects `changes`, and submits verified business knowledge with `learn --stdin` against the final current snapshot.

### Recurring use

1. The agent checks `status` before trusting stored knowledge.
2. A current map is queried first; stale, hypothesis, unknown, unsupported, or insufficient results route the agent to ordinary source inspection.
3. Source edits, tests, Git operations, and review remain normal agent work.
4. The agent reindexes after relevant source changes, checks semantic changes, and learns only assertions supported by current repository-contained evidence.

## Responsibility boundary

| Concern | Atlas | Calling agent |
| --- | --- | --- |
| Repository and working-tree inspection | Discovers repository identity and reads revision state | Chooses the repository and task scope |
| Structural code model | Derives exact supported relationships with the TypeScript Compiler API | Reads source when the map is insufficient |
| Business knowledge | Stores evidence-bound assertions, certainty, and validity | Understands natural language and decides which assertions are justified |
| Unknown behavior | Emits explicit `UnknownBoundary` nodes with reason and candidates | Investigates or reports the unresolved behavior |
| Source changes | Never edits the target repository | Edits source and configuration |
| Verification | Reports evidence and map state | Runs tests, reviews diffs, and judges correctness |
| Git workflow | Reads Git state for identity and snapshots | Commits, merges, rebases, reviews, and releases |
| Persistence | Stores Atlas state in the operating-system user data directory | May delete and rebuild Atlas state |

## Runtime and consistency model

- The target repository is read-only from Atlas's perspective. Atlas databases, snapshots, locks, and caches live outside it.
- Repository identity is shared by the main checkout and its Git worktrees. Each working tree can have a different content-derived snapshot.
- A snapshot incorporates the repository identity, HEAD, Atlas index format version, analyzed file paths and hashes, staged and unstaged changes, and relevant untracked files.
- Structural facts belong to one snapshot and are replaced by indexing. They cannot be created or edited through GraphPatch.
- Business assertions are attached to a base snapshot and exact source evidence. A content change invalidates only assertions whose evidence changed.
- `learn` is an optimistic-concurrency transaction: all operations commit together, or none commit.

Identifiers are stable and opaque to CLI clients. Repository IDs begin with `repo_`, snapshot IDs use `snap_<sha256>`, structural IDs are namespaced by kind, and business nodes use agent-chosen hierarchical keys that remain stable when labels change.

## Supported language and framework scope

v0.1 precisely supports TypeScript and JavaScript, including ESM, CommonJS, and multiple tsconfig project references. Compiler resolution, rather than regular-expression matching, owns structural relationships.

Internal framework adapters cover:

- NestJS modules, controllers, providers, and statically provable injection;
- GraphQL resolvers, operations, fields, and statically connected types;
- TypeORM entities, relations, and provable repository reads and writes;
- BullMQ queues, producers, processors, and jobs.

Dynamic imports, reflection, runtime container lookup, ambiguous string tokens, and dynamic queue names become exact edges only when uniquely provable. Otherwise Atlas creates an `UnknownBoundary`. Unsupported languages are reported as `unsupported` and are not approximated.

## Non-goals

v0.1 does not provide:

- a language model, embeddings, vector search, or natural-language inference;
- source editing, test execution, Git mutation, code review, or release automation;
- MCP or a public framework-adapter SDK;
- generic full-text source search;
- high-level `locate`, `impact`, `source`, or `verify` commands;
- exact claims for runtime-only behavior;
- a second documentation authority or a reason to skip source evidence.

## Release gate

The v0.1.0 release requires all of the following on the release commit:

1. Automated coverage for repository and snapshot identity, content hashes, structural IDs, GraphPatch transactions and concurrency, evidence state transitions, traversal, lexical ranking, language and framework fixtures, dynamic unknowns, and zero target-repository writes.
2. A packaged CLI smoke flow executed outside the source checkout on Linux, macOS, and Windows, with CI on Node.js 22.12 and 24.
3. Static and Fresh Agent verification of the packaged Codex Skill.
4. At least 12 paired Fresh Agent cases: six location and six dependency/impact cases covering NestJS, GraphQL, TypeORM, and BullMQ.
5. For every evaluated case, Atlas-assisted necessary-file recall, necessary-symbol recall, and final-answer correctness are no lower than the no-Atlas baseline.
6. Across all cases, Atlas reduces either median unique opened source files or median source input tokens by at least 30 percent compared with the paired no-Atlas baseline.
7. No evaluated answer presents stale, hypothesis, or unknown knowledge as exact.
8. Read-only validation against representative real repositories proves zero target-repository writes.

The gate is fixed before comparative results are collected. A failed gate creates follow-up work; it does not change the threshold.

## Related contracts

- [Graph model](contracts/graph-model.md)
- [CLI v1](contracts/cli-v1.md)
- [GraphPatch v1](contracts/graph-patch-v1.md)
- [Evaluation protocol](evaluation.md)
