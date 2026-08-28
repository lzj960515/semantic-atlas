# Semantic Atlas Agent Guide

Semantic Atlas is a Git-native, advisory business map for coding agents.
It improves the accuracy of engineering work by giving an agent durable
business context before the agent confirms decisive behavior in current source,
tests, tracked product documentation, and runtime evidence.

## Product Authority

Read these pages before product or implementation work:

1. `docs/product-contract.md` defines the product outcome, users, scope, and
   completion standard.
2. `docs/architecture.md` defines ownership, lifecycle, dependency direction,
   and failure semantics.
3. `docs/map-format.md` defines the tracked map model and query meaning.
4. `docs/evaluation.md` defines accuracy and human-intervention evidence.

Keep one conclusion in its owning page and link to it elsewhere. Record durable
documentation changes in `docs/log.md`.

## Stable Product Model

- Tracked declarative files are the shared business-map source.
- Every CLI invocation loads those files into an in-memory graph.
- The map supplies business boundaries, relationships, and navigation anchors
  as investigation hypotheses.
- Current source, tests, tracked product documents, and runtime evidence confirm
  every claim that controls an engineering change.
- Ordinary engineering work reads the map without synchronizing it to every
  code change.
- Durable map changes use normal file edits, Git diffs, review, and merge.
- Periodic reconciliation integrates stable business changes and removes
  accumulated drift by business domain.
- Rendered diagrams and derived local artifacts are reproducible outputs of the
  tracked map.
- Static export and the loopback Web command use one shared interactive Viewer;
  the service adds project selection without becoming a second graph model.
- Source discovery uses the calling agent's normal repository tools. The map
  remains focused on business meaning rather than structural code indexing.

## Current Delivery Boundary

Build the first product as one small vertical path:

```text
tracked map files
  -> schema validation and normalization
  -> in-memory business graph
  -> local context query
  -> deterministic JSON and visual projections
```

The first release includes a repository-discovered Agent Skill that routes map
results into source confirmation. Later capabilities enter the product only
after real engineering evidence establishes their need.

## Engineering Quality

- Organize high-level methods in user-flow order and keep one abstraction level
  per method.
- Give every module one stable responsibility such as loading map documents,
  validating graph integrity, querying a business neighborhood, or rendering a
  projection.
- Keep domain contracts separate from CLI and rendering adapters.
- Use mature libraries for parsing, schema validation, command-line behavior,
  and graph layout when they express the required contract.
- Introduce local names for multi-step transformations and business decisions so
  inputs, outputs, and failure boundaries remain visible.
- Let errors propagate to a boundary that can return a stable, actionable CLI
  result. Add recovery behavior only when the boundary can perform a defined
  recovery.
- Express product behavior through public-flow tests. Exercise packaged CLI and
  rendered output when those surfaces change.
- Review architecture conformance before treating green tests as delivery
  evidence. A candidate belongs in the product when its responsibilities and
  lifecycle remain readable from the entry point.

## Accuracy Workflow

For business-changing engineering tasks in a mapped repository:

1. Query the smallest useful business neighborhood.
2. Treat returned nodes, relations, summaries, and anchors as current leads.
3. Open the decisive current source, tests, or tracked product documents.
4. Expand to upstream or downstream code when the business relations indicate
   another owner or collaborator.
5. Form the task-specific system model from current evidence.
6. Implement, verify, and independently review the engineering change.
7. Record a map-update candidate only when the task reveals a durable business
   concept or relationship change.

The final engineering conclusion is expected to be more accurate than the map
that helped locate it.

## Public Release Contract

- Treat `pnpm release:verify` as the complete source candidate gate. It covers
  contracts, tests, typecheck, build, render, installed package behavior,
  tarball privacy, pack output, and Git diff checks.
- Keep the package version and annotated `v<version>` tag on one exact commit.
  Enable immutable releases before publishing that tag as a non-prerelease
  GitHub Release. A read-only gate job verifies the specific Release before any
  tag checkout or access to the protected `npm` environment; the publish job
  starts only after that gate succeeds.
- Let the protected `npm` GitHub environment own credentials. The release
  workflow repeats source verification and uses npm provenance; local release
  instructions never publish directly.
- Verify the exact workflow run, GitHub Release, remote tag, and anonymous
  `npm view` result before reporting a public release complete.
- Release only a normal fast-forward continuation of public `main`. Preserve
  existing tags, Releases, and npm versions.
- Preserve release stages: a repository candidate does not authorize a direct
  `main` replacement, tag, GitHub Release, npm publication, target-repository
  change, or runtime rollout.

## Git And Task State

- Use TypeScript ESM with Node.js 24 and pnpm when product implementation begins.
- Use English single-line Conventional Commits.
- Keep worktrees under `.worktrees/` and add that directory to this repository's
  `.git/info/exclude` before creating the first worktree.
- Keep long-task state under ignored `tmp/` and update it after meaningful
  milestones.
- Preserve unrelated local work and keep each candidate limited to its task.
- Treat release, publication, installation, external repository changes, and
  runtime rollout as separate explicitly verified stages.
