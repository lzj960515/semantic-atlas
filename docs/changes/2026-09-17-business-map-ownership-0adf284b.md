# [2026-09-17] revise | Business ownership throughout map authoring

- Change: made real business ownership the shared decision process for creating,
  extending, correcting, and reconciling maps. Existing domain/file ownership is
  reused when its meaning fits; independent business responsibilities receive
  distinct owners. Shared concepts, source-owned relations, scenario-owned flows,
  and stable identities remain consistent across files.
- Reason: [issue #8](https://github.com/lzj960515/semantic-atlas/issues/8) first
  appeared during initialization. The maintainer clarified that the same rule
  must guide later maintenance and engineering candidates. Ordinary candidate
  reconciliation retains its exact-origin, single-domain observation contract;
  necessary multi-file ownership corrections use a complete Git review surface
  with separate, accurate origin accounting.
- Affected pages: the [maintenance Skill](../../.agents/skills/semantic-atlas-maintenance/SKILL.md),
  [understanding Skill](../../.agents/skills/semantic-atlas/SKILL.md),
  [map format](../map-format.md), [architecture](../architecture.md),
  [product contract](../product-contract.md), [observations](../observations.md),
  [evaluation](../evaluation.md), and both READMEs.
- Verification: the complete source gate passes with 174 tests. The
  [authoring fixtures](../../tests/fixtures/map-authoring/README.md) cover a
  multi-business project, a single-business control, and an existing order map
  receiving delivery knowledge. Five fresh executions retain source, artifact,
  and tool evidence in the task workspace: the original Skill produced a single
  umbrella domain, the first revision passed both initialization controls, and
  both the first and final revisions produced separate order/fulfillment owners
  in the incremental case. This small sample verifies those behaviors, rather
  than establishing a general improvement rate. Browser and nested independent
  review tools were unavailable inside the execution harness; artifact review
  and actual CLI/Viewer-model checks are performed outside it.
