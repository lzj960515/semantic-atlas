# Snapshot publication

Read this reference after the required `status` call shows that the structural
snapshot needs publication. Keep all commands serialized in the exact target
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
3. Run `semantic-atlas map view`. It returns current parentless business nodes
   as world regions. An empty `regions` array with `BUSINESS_KNOWLEDGE_EMPTY`
   means no task has established reusable business knowledge yet.
4. Use source as authority while publication is unavailable. Read result routing
   when the index or follow-up status contains warnings or errors.

## Continue into the normal task

A normal task grows only the business area it actually verifies:

1. Inspect the world view and search task business vocabulary. When business
   knowledge is empty or irrelevant, use `code search` for bounded structural
   owners and source locations.
2. Open the bounded source path required by the task and confirm the decisive
   behavior.
3. Identify each durable business concept and relationship that the source now
   proves but the current map lacks.
4. Follow GraphPatch authoring, submit those verified facts together, and verify
   each learned entry through `semantic-atlas map show`, then confirm its
   placement through `semantic-atlas map view`.
5. Stop after the task-relevant business area is reusable. Let later engineering
   tasks expand or reorganize the map as they verify more behavior.

Empty business knowledge routes to bounded structural and source inspection for
the active task. The resulting source evidence may introduce a provisional root;
a later task can reparent it when a broader business concept becomes verified.
