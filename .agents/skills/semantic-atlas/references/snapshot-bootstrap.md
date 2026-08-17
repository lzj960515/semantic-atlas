# Snapshot and business-map bootstrap

Read this reference after the required `status` call shows that the structural
snapshot needs publication, or after a current map proves that relevant
business knowledge is absent. Keep all commands serialized in the exact target
worktree.

## Publish structural state

1. For `missing`, `stale`, failed, or incomplete state, run
   `semantic-atlas index` and inspect the returned envelope. In a new Git
   worktree, this command automatically restores a compatible sibling
   CodeGraph projection and incrementally synchronizes it; no separate
   initialization command is needed. When no candidate is compatible, the same
   command performs the initial full index.
2. Run `semantic-atlas status` again. Continue with Atlas only when freshness is
   `current` and backend completeness is `complete`.
3. Run `semantic-atlas map roots`. Structural `Module` roots are valid initial
   navigation when no business `Capability` root exists.
4. Use source as authority while publication is unavailable. Read result routing
   when the index or follow-up status contains warnings or errors.

## Bootstrap during a normal task

A normal task grows only the business area it actually verifies:

1. Search task vocabulary and inspect the closest structural owner, neighbors,
   and finite unknown candidates.
2. Open the bounded source path required by the task and confirm the decisive
   behavior.
3. Identify each durable business concept and relationship that the source now
   proves but the current map lacks.
4. Follow GraphPatch authoring, submit those verified facts together, and verify
   each learned entry through `semantic-atlas map show`.
5. Stop after the task-relevant capability is reusable. Leave unrelated roots
   for later tasks.

## Bootstrap an explicitly requested project map

Treat project initialization as a bounded mapping task rather than an attempt
to describe every symbol:

1. Begin with `semantic-atlas map roots` and select the requested directories,
   domains, or a small set of the most evidence-rich structural roots when the
   request supplies no narrower boundary.
2. For each selected root, follow one representative path through public
   interfaces, operations, data, invariants, and verification where present.
3. Confirm the controlling declarations in source and record the initialization
   boundary in the task result.
4. Learn only durable verified capabilities and their supported child concepts
   and relationships. Preserve unknown or unsupported behavior as boundaries,
   not exact business facts.
5. Verify learned capability keys with `semantic-atlas map show`, then start a
   fresh query from one learned term to prove the initial map is reusable.

Future tasks extend this initial map incrementally as they verify more business
behavior.
