# Semantic Atlas Knowledge Maintenance Log

This log records material documentation ingestion and revisions. Current
conclusions live on their owning pages rather than in this chronology.

## [2026-08-21] add | Local product insights and separate maintenance Skill

- Added passive, installation-level command observations plus explicit,
  evidence-contextual feedback and a strict `insights` JSON envelope.
- Kept normal task context lean: the primary Skill loads feedback guidance only
  after confirmed material friction, while a separately installed insights Skill
  owns daily review and feedback triage.
- Defined the privacy boundary, interpretation limits, and independent
  repository/worktree storage in `contracts/insights-v1.md`.
- Affected pages: `product-contract.md`, `contracts/cli-v1.md`,
  `contracts/insights-v1.md`, and `index.md`.

## [2026-08-20] revise | Business-first README and managed package upgrade

- Rebuilt the bilingual README around the product gap between file search and
  business understanding, task-driven learning, and one semantically zoomable
  map.
- Added repository-independent `upgrade`: resolve npm `latest`, install the
  exact target, verify the new CLI, and synchronize the new package's Skill.
- Kept `setup` as the repair and synchronization command for the currently
  installed package, including the already-current upgrade path.
- Affected pages: `README.md`, `README.zh-CN.md`, `product-contract.md`, and
  `contracts/cli-v1.md`.

## [2026-08-20] revise | Versioned evaluation command replay

- Bound each Fresh Agent run to the command-policy version that produced it.
- Preserved v4 replay for immutable structural-map records and introduced v5
  for the business-first map and explicit code-search grammar.
- Kept current runs fail-closed against removed commands while allowing release
  validation to re-audit historical evidence without rewriting it.
- Affected page: `evaluation.md`.

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
