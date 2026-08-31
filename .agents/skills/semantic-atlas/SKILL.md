---
name: semantic-atlas
description: Build source-supported business understanding and make maintenance decisions for business-changing engineering tasks, with or without an existing business map. Use for features, bugs, refactors, reviews, and impact analysis to find or establish business boundaries, collaborators, data, invariants, interfaces, business flows, and source entry points before broad discovery, then decide whether stable shared knowledge needs maintenance.
compatibility: Requires Node.js 24+, a bundled or PATH-compatible semantic-atlas CLI, and repository source access.
---

# Semantic Atlas

Build the smallest current-evidence business model needed to make an accurate
engineering decision. An existing map is a compact navigation prior. Missing,
incomplete, stale, or contradicted map knowledge changes the discovery route;
it does not remove the need to understand the business boundary.

Current source, tests, tracked product documents, and required runtime evidence
decide what an engineering change may claim and do. Treat map results as
investigation leads.

## Choose The Workflow From The Task

Use this workflow when work can change or depend on business behavior,
ownership, shared data, an invariant, or an interface. This includes feature,
bug, refactor, impact-analysis, and independent-review work whose correct scope
requires business judgment.

Begin ordinary repository work directly when the task is purely mechanical and
its exact source boundary is already established, such as formatting, a local
rename, or generated-file refresh. This is a complete stopping decision and
produces no shared business-knowledge maintenance work.

## Probe Existing Business Knowledge

1. Read the task contract and repository instructions. Resolve the repository
   root and keep all commands in the task's assigned worktree.
2. Choose one distinctive business term from the user-visible behavior. Prefer
   an exact business name or stable task vocabulary over a framework, folder,
   class, or method name.
3. Before broad source discovery, run the Skill's identity- and
   contract-checking adapter whether or not map documents are present:

   ```bash
   node "<skill-directory>/scripts/query-context.mjs" \
     "<business-term>" --repo "<absolute-repository-root>"
   ```

   A package-bundled adapter invokes that package's CLI directly. A managed
   user Skill first requires the PATH CLI version recorded by `setup`, then
   verifies the v1 `context` envelope. This prevents an older command with the
   same executable name from being interpreted as the current product.

4. Preserve the selector and bounded outcome for the task observation. When a
   context is returned, record the selected stable IDs as hypotheses.

## Build The Business Model With Or Without A Map

Route the probe result into one current-evidence investigation:

- A successful context result supplies likely business scope and source entry
  points. It can also return related business flows in `context.data.flows`.
  Open the most decisive anchors first. Query another returned stable ID only
  when an owner, upstream action, downstream consumer, shared data concept,
  invariant, interface, or business-relevant path could change the
  implementation scope.
- `CONCEPT_AMBIGUOUS` supplies explicit candidates. Compare their stable IDs,
  names, kinds, and task meaning, then query the matching ID. Use bounded source
  evidence when current behavior is needed to choose.
- `CONCEPT_NOT_FOUND` means the repository has a map without this vocabulary.
  Search current product documents and source using the task term, likely
  business synonyms, and directly observed collaborators.
- `MAP_NOT_FOUND` means the repository has no configured shared business map.
  When the map is absent, build the smallest source-supported business model needed for the task.
  Start from the user-visible outcome, identify only the owning business scope,
  actions, data, rules, and interfaces that current evidence requires, and stop
  when the engineering boundary is source-confirmable. Limit this model to
  business meaning supported by the current task rather than repository-folder
  structure or a complete taxonomy.
- `MAP_DOCUMENT_INVALID`, an unavailable CLI, or an infrastructure failure
  makes map knowledge unavailable for this task. Preserve the failure, build
  the same bounded current-evidence model, and report observation recording as
  unavailable when the CLI boundary cannot accept it.
- A node without anchors still supplies business vocabulary and relations.
  Search its name, aliases, neighboring concepts, and interface terms, then
  follow current code structure.
- A missing or stale anchor weakens only that navigation hint. Use current
  evidence to find the replacement location without discarding unrelated
  stable business meaning.

For a mapless task, the observation query records the bounded outcome:

```json
{
  "selector": "<business term>",
  "outcome": "map_not_found"
}
```

## Confirm The Current-Evidence Model

For every statement that could control the change:

1. Open current source or tests that implement or exercise the behavior.
2. Open the tracked product document when it owns the durable rule or outcome.
3. Confirm both endpoints of an invocation, shared-data, invariant, publish, or
   consume relation when that relation expands the required scope.
4. Use runtime evidence when the conclusion depends on deployed state rather
   than repository behavior.
5. Classify relevant map hypotheses as confirmed, missing, stale,
   contradicted, or unresolved. Let confirmed current evidence control the
   task. Keep unresolved statements out of decisive conclusions.

Trace a downstream symptom toward its confirmed upstream cause before editing.
For shared data or interfaces, inspect every confirmed producer and consumer
needed to preserve the contract. Keep unrelated neighbors outside the change.

## Check Relevant Business Flows

Use each returned flow as a compact hypothesis about the business-relevant
actions, decisions, branches, and outcomes in one scenario. Follow only the
flows and paths that intersect the task; ordinary relation context remains
sufficient when no flow is relevant.

1. Before editing, trace each relevant path from `startsAt` through its labeled
   decisions to the outcomes that could change. Give special attention to paths
   controlling durable data, provider usage or cost, authorization or tenant
   isolation, interfaces, and user-visible results.
2. Confirm every step or branch that controls the engineering decision in
   current source, tests, tracked product documents, or required runtime
   evidence. Flow order is an investigation lead rather than current execution
   truth.
3. After implementation or review, trace the affected paths again. Check that
   preserved branches still reach their intended outcomes and that an intended
   product change has a clear durable meaning.
4. Classify a discrepancy before changing either side:
   - repair source when implementation accidentally breaks the confirmed
     business path;
   - propose a flow update when confirmed product intent changed the durable
     business path;
   - propose a flow correction when decisive current evidence establishes that
     the retained path was already stale;
   - preserve the discrepancy as unresolved when available evidence cannot
     choose the durable behavior;
   - keep the flow unchanged when only implementation structure changed.

Keep routine parameter validation, DTO conversion, helpers, framework wiring,
and Service or Queue names in source rather than flow steps.

## Implement And Verify

Continue through the repository's normal engineering workflow after the
current-evidence model is clear. Implement the confirmed cause and affected
collaborators, add regression coverage at the public behavior boundary, run
the repository's required checks, and review the final diff against the task
scope.

Final engineering conclusions identify the business boundary, decisive current
evidence, implementation or review scope, and verification. Phrase map-only
statements as leads or uncertainty rather than current behavior.

## Decide Post-Task Business-Knowledge Maintenance

After the engineering or review result is known, choose one maintenance disposition:

- `candidate`: current evidence establishes stable business meaning that the
  shared map omits or represents incorrectly. Record one or more domain-owned
  map-update candidates with decisive evidence. Use `kind: "flow"` when the
  durable correction concerns a scenario's actions, decisions, labeled
  branches, or outcomes.
- `already_represented`: the shared map still expresses the stable business
  meaning needed by the task. Record no candidate.
- `implementation_local`: the result changes only helpers, framework wiring,
  source organization, tests, or another non-durable implementation detail.
  Record no candidate.
- `unresolved`: available evidence cannot establish durable business identity,
  ownership, or relation direction. Preserve the uncertainty without proposing
  a canonical edit.

A no-change disposition is a complete result when current shared knowledge
already represents the durable meaning or the change is implementation-local.
Add concepts, relations, and flows only when current evidence supports their
accuracy. When no relevant flow changed, record no flow candidate.

For a repository without a map, use `candidate` only when current evidence
establishes a stable business domain and a bounded reusable concept, relation,
or business path. Use `unresolved` when one task cannot support that identity.
Limit bootstrap knowledge to the stable meaning established by the current
task.

## Record Accuracy Evidence

For business-changing work, read
[references/observations.md](references/observations.md) after the engineering
or review result and verification are known.

- For engineering and analysis work, record one task observation. It contains
  the map-query outcome, selected concepts, current-evidence dispositions,
  map-update candidates from a `candidate` maintenance disposition, and any
  explicit human correction.
- For independent review, record one review observation that references the
  existing task observation and contains the accuracy verdict. Keep the task
  observation immutable. When no task observation is available, report the
  missing accuracy-evidence link separately from the review verdict.

Independent review owns accuracy judgments, so task observations contain
investigation evidence rather than correctness verdicts. Generate one stable
observation ID for the run and reuse the same complete document when retrying an
interrupted submission.

Submit the matching complete JSON document through the installed CLI:

```text
semantic-atlas observe task --stdin [--repo <repository-root>]
semantic-atlas observe review --stdin [--repo <repository-root>]
```

Report the recorded or idempotent outcome with the engineering result. When
the observation command fails, the engineering result remains unchanged;
report the observation failure separately so review can distinguish delivery
evidence from missing accuracy evidence.

## Hand Off Canonical Maintenance

Keep canonical map editing in a separate maintenance change after stable reviewed source is available.
The `semantic-atlas-maintenance` Skill rechecks retained candidates by business
domain, edits one owning YAML surface, validates the complete graph, renders the
changed neighborhood, and submits the Git diff for independent review.

A post-integration maintenance run can examine retained candidates from
business-changing results; an empty or no-change run is successful. Periodic
reconciliation remains a fallback for accumulated drift, missed observations,
and changes outside the normal engineering workflow. The understanding and
maintenance contracts run independently of task orchestrators.

## Report The Result

Report the business boundary, decisive current evidence, engineering scope,
verification, accuracy-observation outcome, and maintenance disposition. For
`candidate`, include the business domain, proposed durable correction, and
evidence. For `already_represented`, `implementation_local`, or `unresolved`,
state the evidence-based reason and record no map-update candidate.
