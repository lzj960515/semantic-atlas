# [2026-09-18] revise | Design complete business boundaries before maps

- Change: map maintenance now establishes responsibility and lifecycle coverage
  before choosing domains or files. The shared
  [boundary-design reference](../../.agents/skills/semantic-atlas-maintenance/references/boundary-design.md)
  owns the evidence-based cohesion, ownership, external-collaborator and stopping
  judgments; ordinary engineering reuses it at task scale. YAML and candidate
  observation contracts remain unchanged.
- Reason: splitting files by plausible responsibility labels can still absorb
  collaborators, omit supported lifecycle behavior or place it under callers.
  An independent source-to-map coverage check makes these errors reviewable.
- Evidence: the de-identified
  [library-boundary fixture](../../tests/fixtures/map-authoring/library-boundary/README.md)
  starts with a valid graph that retains only retrieval under an assistant.
  Its current source supplies material intake, revision, extraction callbacks,
  withdrawal/removal and unrelated neighboring behavior. Case 4 in the
  [authoring suite](../../tests/fixtures/map-authoring/evals.json) checks full
  responsibility coverage and a bounded local correction.
- Affected pages: [map format](../map-format.md#business-ownership-and-file-boundaries),
  [evaluation](../evaluation.md#business-ownership-regression), the
  [understanding Skill](../../.agents/skills/semantic-atlas/SKILL.md) and
  [maintenance Skill](../../.agents/skills/semantic-atlas-maintenance/SKILL.md).
- Verification: both Skill packages pass frontmatter validation; changed
  relative document links resolve; all 15 existing Skill and authoring-resource
  tests pass, including complete-graph checks for the new initial fixture.
  One fresh-context baseline/candidate pair used identical inputs and runtime;
  independent artifact review passed all seven criteria for both. This pair
  demonstrates no regression on this case, not a general improvement over the
  baseline. The full source release gate passed 181 tests and build/package
  smoke checks before publication.
