# Documentation Log

This page records durable changes to the product model and documentation
ownership.

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
  Codrive review, integration, and any public release remain separate stages.
