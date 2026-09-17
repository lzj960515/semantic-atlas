# [2026-08-28] history | Documentation changes

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
