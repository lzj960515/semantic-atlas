---
name: semantic-atlas
description: Query a repository's advisory business map before broad source discovery for business-changing feature, bug, refactor, and impact-analysis tasks. Use in repositories with docs/business-map files to find likely owners, collaborators, data, invariants, interfaces, and source anchors, then confirm every change-controlling claim in current evidence.
compatibility: Requires Node.js 24+, a bundled or PATH-compatible semantic-atlas CLI, and repository source access.
---

# Semantic Atlas

Use the tracked business map as a compact navigation prior. Treat all returned
nodes, relations, summaries, and anchors as investigation leads; current
source, tests, tracked product documents, and required runtime evidence decide
what an engineering change may claim and do.

## Choose The Workflow

Use this workflow when a task can change business behavior, ownership, shared
data, an invariant, or an interface. Begin ordinary repository work directly
when the task is purely mechanical and its exact source boundary is already
established, such as formatting, a local rename, or generated-file refresh.

## Query The Smallest Useful Neighborhood

1. Read the task contract and repository instructions. Resolve the repository
   root and keep all commands in the task's assigned worktree.
2. Choose one distinctive business term from the user-visible behavior. Prefer
   an exact business name or stable task vocabulary over a framework, folder,
   class, or method name.
3. Before broad source discovery, run the Skill's identity- and
   contract-checking adapter:

   ```bash
   node "<skill-directory>/scripts/query-context.mjs" \
     "<business-term>" --repo "<absolute-repository-root>"
   ```

   A package-bundled adapter invokes that package's CLI directly. A managed
   user Skill first requires the PATH CLI version recorded by `setup`, then
   verifies the v1 `context` envelope. This keeps an older command with the
   same executable name from being interpreted as the current product.

4. Read the selected concept, ancestors, direct children, incoming and outgoing
   relations, endpoint summaries, and anchors. Record them as hypotheses.
5. Query a returned stable ID only when a direct owner, upstream action,
   downstream consumer, shared data concept, invariant, or interface could
   change the implementation scope. Stop expanding when the current task has a
   source-confirmable boundary; a complete graph traversal is not required.

## Route Map Outcomes

- A successful context result supplies likely business scope and source entry
  points. Open the most decisive anchors first, then follow current imports,
  callers, consumers, tests, and product documents as the behavior requires.
- `CONCEPT_AMBIGUOUS` supplies explicit candidates. Compare their stable IDs,
  names, kinds, and task meaning, then query the matching ID. When current
  behavior is needed to choose, search only the task term and candidate
  vocabulary before selecting.
- `CONCEPT_NOT_FOUND` and `MAP_NOT_FOUND` are bounded map outcomes. Continue
  with ordinary source discovery using user vocabulary, likely product docs,
  and progressively narrower source searches.
- `MAP_DOCUMENT_INVALID`, an unavailable CLI, or an infrastructure failure
  makes the map unavailable for this task. Preserve the error as context and
  continue through the repository's normal discovery workflow.
- A node with no anchors still provides business vocabulary and relations.
  Search its stable name, aliases, neighboring concepts, and interface terms,
  then follow current code structure.
- A missing or stale file, directory, document, symbol, or search anchor weakens
  that navigation hint. Use the node meaning and direct relations for a bounded
  search, and confirm the replacement location in current evidence.

## Build A Current-Evidence Model

For every map statement that could control the change:

1. Open current source or tests that implement or exercise the behavior.
2. Open the tracked product document when it owns the durable rule or outcome.
3. Confirm both endpoints of an invocation, shared-data, invariant, publish, or
   consume relation when that relation expands the required scope.
4. Use runtime evidence when the conclusion depends on deployed state rather
   than repository behavior.
5. Classify each relevant hypothesis as confirmed, contradicted, or unresolved.
   Let confirmed current evidence control the implementation. Replace a
   contradicted relation with the source-supported collaborator in the
   task-specific model. Keep unresolved statements out of decisive conclusions.

Trace a downstream symptom toward its confirmed upstream cause before editing.
For shared data or interfaces, inspect every confirmed producer and consumer
needed to preserve the contract. Keep unrelated neighbors outside the change.

## Implement And Verify

Continue through the repository's normal engineering workflow after the
current-evidence model is clear. Implement the confirmed cause and affected
collaborators, add regression coverage at the public behavior boundary, run
the repository's required checks, and review the final diff against the task
scope.

Final conclusions identify the business boundary, the decisive current
evidence, the implemented or proposed scope, and relevant verification. Phrase
map-only statements as leads or uncertainty rather than current behavior.

## Record The Task Observation

For business-changing work, read [references/observations.md](references/observations.md)
and record one task observation after the engineering result and verification
are known. Use a stable observation ID for the run and reuse the same complete
document when retrying an interrupted submission.

The task observation records the map-query outcome, selected concepts,
current-evidence dispositions, map-update candidates, and any explicit human
correction. Independent review owns accuracy judgments, so the task document
contains investigation evidence rather than a correctness verdict.

Submit the complete JSON document through the installed CLI:

```text
semantic-atlas observe task --stdin [--repo <repository-root>]
```

Report the recorded or idempotent outcome with the engineering result. When
the observation command fails, the engineering result remains unchanged;
report the observation failure separately so review can distinguish delivery
evidence from missing accuracy evidence.

## Report Durable Map Observations Separately

Ordinary task completion does not require editing `docs/business-map`. When
current evidence reveals a stable missing concept, stale anchor, or
contradicted relation, add a separate map-update candidate to the task report:

```text
Map-update candidate: <node, relation, or anchor>
Current evidence: <repository-relative source, test, or product document>
Durable correction: <concise proposed business meaning>
```

Keep the candidate separate from the engineering conclusion so later periodic
reconciliation can accept, refine, or discard it through the repository's
normal Git review workflow.
