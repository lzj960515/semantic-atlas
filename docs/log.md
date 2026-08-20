# Semantic Atlas Knowledge Maintenance Log

This log records material documentation ingestion and revisions. Current
conclusions live on their owning pages rather than in this chronology.

## [2026-08-20] revise | Managed Skill setup and CLI discovery

- Added repository-independent `setup`, help, and version commands before the
  Git/SQLite lifecycle.
- Defined `~/.agents/skills/semantic-atlas` as the shared managed target with
  atomic updates, package-version/content markers, and recognized legacy
  `~/.codex/skills/semantic-atlas` migration.
- Replaced the separate repository Skill-installer journey with the bundled
  npm package workflow and added installed-tarball setup/update verification.
- Affected pages: `README.md`, `README.zh-CN.md`, `product-contract.md`, and
  `contracts/cli-v1.md`.

## [2026-08-20] revise | Semantic zoom and AI-first query contract

- Defined one canonical business graph with world/focused visible frontiers,
  breadcrumbs, child/context regions, and evidence-preserving aggregate
  connections.
- Replaced roots, children, mixed search, structural show, and depth traversal
  with `map view`, business-only search/show, and explicit `code search`.
- Reframed the public API around the calling Agent's actual self-dogfood path:
  business navigation, bounded code fallback, source confirmation, engineering
  work, and task-driven knowledge capture.
- Synchronized the product contract, graph model, CLI contract, READMEs, and
  Semantic Atlas Skill without compatibility aliases.
- Affected pages: `architecture/continuous-business-learning.md`,
  `product-contract.md`, `contracts/graph-model.md`, and `contracts/cli-v1.md`.

## [2026-08-20] revise | Continuous business learning and evolving roots

- Added the continuous-learning architecture as the owning design for business
  knowledge acquired during real engineering tasks.
- Defined roots as the current parentless business frontier rather than fixed
  Capability roots or structural-module fallbacks.
- Defined stable keys, single-parent hierarchy, acyclic placement, and atomic
  reparenting as the first implementation slice.
- Synchronized the product, graph, GraphPatch, CLI, README, and Agent Skill
  contracts around task-driven learning and the `BUSINESS_KNOWLEDGE_EMPTY`
  fallback.
- Established the documentation index and knowledge-base maintenance boundary.
- Affected pages: `architecture/continuous-business-learning.md`,
  `product-contract.md`, `contracts/graph-model.md`, `contracts/graph-patch-v1.md`,
  and `contracts/cli-v1.md`.
