# Semantic Atlas Knowledge Maintenance Log

This log records material documentation ingestion and revisions. Current
conclusions live on their owning pages rather than in this chronology.

## [2026-08-21] revise | Anonymous Web viewer example

- Replaced a local project name in the public Web viewer layout example with a
  neutral project label before npm packaging.
- Affected page: `architecture/web-viewer.md`.

## [2026-08-21] revise | Browse latest primary publication

- Defined stale source freshness as non-blocking for the human Web viewer: map,
  search, and node reads serve the latest complete publication on the eligible
  `main` or `master` working tree.
- Kept missing, building, failed, and structurally incomplete publications
  unavailable because no complete map exists to browse.
- Defined semantic zoom consistency: a relationship line is visible only while
  both endpoint regions are visible.
- Affected pages: `architecture/web-viewer.md` and `contracts/http-api-v1.md`.

## [2026-08-21] revise | Minimal map node metadata

- Removed visible kind and leaf-detail labels from business-map nodes.
- Kept child counts as the sole optional node secondary text, rendered only
  when an expandable region contains child business regions.
- Affected page: `architecture/web-viewer.md`.

## [2026-08-21] revise | Chinese minimal business viewer

- Simplified the human-facing desktop chrome to project selection, path,
  search, map controls, and concise business details; removed decorative and
  diagnostic presentation from the normal viewing surface.
- Defined Chinese fixed UI copy, localized existing business kinds, and a
  business-only detail panel that omits Agent-facing evidence, certainty,
  validity, source symbols, and raw relation metadata.
- Defined wrapping behavior for long recorded detail and relationship labels.
- Affected page: `architecture/web-viewer.md`.

## [2026-08-21] revise | Immersive business map view

- Added one toolbar control for a desktop-only immersive map view that hides
  surrounding project and detail UI without changing the loaded map or Atlas
  state; the control and `Escape` restore the normal view.
- Kept `Fit` as a camera action over the loaded map rather than treating it as
  an application-layout switch.
- Affected page: `architecture/web-viewer.md`.

## [2026-08-21] revise | Continuous business map interaction

- Replaced the interim region-card grid with a deterministic continuous canvas:
  project roots form a ring and focused children expand outward while previously
  loaded regions retain their positions.
- Defined the project-local, disposable browser cache; focused-map requests
  load once, retain hierarchy and asserted connections, and are cleared only
  when the selected project changes.
- Defined pointer-anchored camera zoom, pan, fit, semantic level thresholds,
  focused-region camera movement, and separate hierarchy versus business
  relationship visibility.
- Affected page: `architecture/web-viewer.md`.

## [2026-08-21] add | Desktop read-only Web viewer

- Accepted `semantic-atlas web` as a human-facing desktop surface over the
  existing evidence-bound business map.
- Defined a shared read application boundary and loopback HTTP API instead of
  driving the browser through CLI subprocesses.
- Restricted project discovery to one primary working tree per repository on
  `main` or `master`; linked worktrees and branch selection remain outside the
  Web product.
- Kept the viewer read-only and business-oriented with project selection,
  hierarchy navigation, business search, node details, and existing kinds,
  certainty, and validity.
- Implemented and bundled the loopback server, read application services, and
  desktop client; packaged-installation and browser interaction checks cover
  the project catalog, map navigation, search, node details, and mutation
  rejection.
- Revised the desktop interaction contract after product review: the main
  surface is a pannable and zoomable spatial node-and-connection map. A card
  grid is a supporting presentation pattern and cannot replace the map canvas.
- Affected pages: `product-contract.md`, `architecture/web-viewer.md`,
  `contracts/cli-v1.md`, `contracts/http-api-v1.md`, and `index.md`.

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
