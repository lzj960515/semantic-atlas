# Documentation Log

## 2026-08-31

- Defined `semantic-atlas@2.1.2` as the reviewed maintenance-result and narrow
  orchestration-status release.
- Added immutable `MaintenanceObservation` artifacts for reviewed
  post-integration candidate outcomes, with exact source positions, explicit
  business-domain validation, current evidence, and merged-map identity.
- Made reconciliation return current actionable candidates: accepted, refined,
  and discarded sources terminate; unresolved sources wait for a new origin in
  the same candidate group before becoming actionable again.
- Split the maintenance Skill into Work, independent Review, and Integration
  phases so work-stage proposals cannot consume candidates and uncertain record
  retries reuse one idempotent document.
- Added the read-only `reconcile status` contract for orchestration. It returns
  one `required` boolean from task and maintenance observations while keeping
  candidate details, Review evidence, and business-domain selection internal.

## 2026-08-28

- Defined `semantic-atlas@2.1.1` as the task-semantic business-understanding
  release for mapped and mapless repositories, with explicit post-task
  maintenance decisions and evidence-bounded initial-domain maintenance.
- Refactored the managed `semantic-atlas` Skill to activate from
  business-changing task meaning rather than map-file presence, including a
  bounded `MAP_NOT_FOUND` understanding path.
- Made every business-changing result record an observation and choose an
  evidence-based maintenance disposition; canonical YAML remains a separate
  reviewed post-integration change, with periodic reconciliation as fallback.
- Extended the maintenance Skill to turn a supported mapless candidate into one
  bounded initial business-domain YAML while preserving the one-domain review
  surface and complete-graph validation.
- Kept the understanding and maintenance workflows independent of task
  orchestrators, and retained mechanical work as a complete
  no-business-maintenance outcome.
- Defined `semantic-atlas@2.1.0` as the interactive Viewer release with compact
  business cards, on-demand navigation details, correct aspect-ratio-aware
  camera interaction, and safe multi-project selection.
- Replaced the oversized static-render introduction with one compact shared
  Viewer toolbar, added deterministic repository/domain projections and
  pan/zoom/fit interaction, and added a loopback GET/HEAD-only `web` command
  for explicitly selected repositories without restoring persistent state.
- Kept graph cards focused on business meaning, moved navigation anchors into
  accessible on-demand details, prevented drag selection, corrected camera
  coordinates for SVG letterboxing, and disambiguated duplicate project names
  without exposing repository paths.
- Added npm-version and MIT-license badges plus a packaged Simplified Chinese
  README that preserves the complete public install, use, evidence, privacy,
  and maintenance journey.
- Removed predecessor Skill, observation, claim, release-rehearsal, and direct
  repository-cutover compatibility from the current product contract.
- Defined `semantic-atlas@2.0.0` as the current-only public contract while
  preserving future package upgrades, atomic managed-Skill recovery, immutable
  observations, and normal fast-forward releases.

This page records durable changes to the product model and documentation
ownership.

## 2026-08-27

- Approved the existing `lzj960515/semantic-atlas` repository as the direct v1
  source identity. Its `main` changes to the clean v1 history through one
  lease-checked discontinuity while existing v0 tags, Releases, npm versions,
  and the repository-owned npm environment remain in place; a second repository
  and legacy-history backup are not cutover prerequisites.
- Prepared the clean repository as the local `semantic-atlas@1.0.0` release
  candidate with MIT licensing and the intended future public source identity.
- Added one repository-owned verification gate across source contracts, Node
  support, CI syntax, build and render behavior, tarball privacy, anonymous
  installed commands, the public v0.4 transition, package output, and Git diff.
- Restricted npm publication to a matching annotated tag published as an
  immutable, non-prerelease GitHub Release. The release command enables and
  reads back the repository setting, while a workflow-owned, read-only gate
  rejects any specific Release without active immutable protection before tag
  checkout, protected-environment access, provenance publication, and public
  registry read-back.
- Reframed the public README around install, setup, upgrade, target-repository
  maps, advisory evidence order, local observations, and read-only
  reconciliation without exposing private evaluation artifacts.
- Versioned current task observations as v2 after adding explicit candidate
  ownership and disposition, while retaining read-only compatibility for
  immutable task v1 evidence. Legacy unowned candidates remain outside
  reconciliation reports instead of being inferred or treated as corruption.
- Added explicit business-domain ownership and candidate-specific evidence
  dispositions to map-update observations so maintenance does not infer stable
  meaning from paths or free-form summaries.
- Added deterministic read-only reconciliation reports that group exact
  candidates while preserving every task occurrence, duplicate provenance,
  human correction, and linked independent review.
- Added the bundled `semantic-atlas-maintenance` Skill for one-domain current-
  evidence confirmation, one owning YAML edit, complete validation, rendering,
  Git diff, and independent review.
- Extended `setup` and exact-package upgrade results to manage the engineering
  and maintenance Skills with the same package identity and per-Skill atomic
  replacement guarantees.
- Implemented strict versioned task and independent-review observation
  contracts while keeping correctness, rework, and map-regression authority in
  review evidence rather than task-agent self-scoring.
- Added anonymous repository identities shared across Git worktrees, immutable
  user-local per-ID JSON files, atomic publication, exact replay idempotency,
  changed-content conflicts, and same-repository review references.
- Closed the interrupted-claim retry window by atomically publishing complete
  claim metadata, distinguishing process instances, and retaining compatible
  recovery for empty, damaged, dead-owner, and live-owner directory claims.
- Added read-only accuracy summaries for review correctness, upstream cause,
  impact completeness, rework, map regression, human correction, and
  independently approved stale, missing, and contradicted-map recovery.
- Extended the bundled managed Skill to record task evidence after
  business-changing work and to report observation failure separately without
  changing the engineering result.
- Implemented the local managed-Skill lifecycle candidate: package-identity
  markers, deterministic payload fingerprints, idempotent repair, supported
  v0.4 replacement, conflict refusal, and recoverable atomic directory swaps.
- Added exact stable-version upgrade orchestration that verifies and invokes
  the newly installed CLI by npm global package path before synchronizing its
  Skill, keeping old and new package payloads out of one setup transaction.
- Extended packed-product acceptance through an isolated user home and target
  repository, including setup repetition, repair, legacy replacement,
  interrupted-swap recovery, unrelated-directory preservation, and managed
  adapter version mismatch reporting.
- Recorded that the documentation baseline and all five initial product slices
  are accepted and integrated at `decac0c`; setup, publication, installation,
  target-repository rollout, and real-use acceptance remain separate gates.
- Approved `semantic-atlas@1.0.0` as the breaking identity for the new product
  while preserving the previous public repository, local unpublished history,
  and existing npm versions through an explicit later cutover.
- Made the published CLI responsible for atomically installing and repairing
  its version-matched managed user Skills without replacing an unrelated
  same-named directory.
- Defined immutable, independently identified `TaskObservation` and
  `ReviewObservation` artifacts under user-local repository partitions. The task
  Agent records task evidence, while independent review or explicit human
  correction owns accuracy judgments.
- Kept observations separate from the Git business map, made reconciliation
  candidate discovery read-only, and retained normal reviewed YAML edits as the
  only way to change the canonical map. This workflow uses neither SQLite nor a
  remote observation service.
- Established separately verified v1 gates for setup, observations, release
  readiness, legacy preservation, publication, target-repository rollout, and
  longitudinal acceptance.

## 2026-08-26

- Established Semantic Atlas Next as a clean Git-native product rather than an
  incremental rewrite of the evidence-bound local database implementation.
- Defined end-to-end engineering accuracy and reduced human supervision as the
  product outcomes. File-count, token, latency, and maintenance cost remain
  observations rather than acceptance thresholds.
- Made tracked declarative map files the shared source and in-memory loading the
  runtime lifecycle.
- Defined the business map as advisory context that current source and tests can
  confirm, refine, or contradict.
- Separated ordinary map-assisted engineering from slower periodic map
  reconciliation.
- Implemented the first stateless product path from tracked YAML through strict
  graph validation and immutable in-memory indexes to deterministic `validate`
  and `context` CLI envelopes.
- Kept parsing, complete-graph validation, graph navigation, context projection,
  and CLI behavior in separate responsibilities, backed by public-flow tests
  and an external packaged-command check.
- Added a deterministic static HTML projection over the same validated
  in-memory graph. Dagre owns node placement and relation routing; containment
  and directed collaboration use separate visual and accessible channels.
- Added the repository-discovered `semantic-atlas` Agent Skill. It starts
  business-changing work with bounded map context, routes missing, ambiguous,
  stale, and contradicted knowledge into current evidence, and keeps durable
  map observations separate from ordinary engineering completion.
- Added de-identified controlled fixtures for upstream cause, downstream
  consumer, missing knowledge, ambiguous vocabulary, missing and stale anchors,
  and contradicted relations, plus packaged Skill and CLI-adapter checks.
- Completed the private paired real-project evaluation with all required case
  types, correct map-assisted conclusions, explicit stale and missing knowledge
  recovery, no map-caused regression, one material accuracy improvement, and
  independently approved implementation evidence. Only aggregate,
  de-identified conclusions are recorded in this repository.
- Accepted the complete initial candidate through one local command covering
  the full regression suite, typecheck, build, package dry-run, Commerce example
  rendering, Skill checks, and an external temporary consumer of the packed CLI.
  Later Codrive review and integration completed at `decac0c`; public release
  remains a separate v1 delivery gate.
