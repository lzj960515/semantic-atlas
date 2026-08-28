---
name: semantic-atlas-maintenance
description: Reconcile retained Semantic Atlas map-update candidates for one business domain into a source-supported, normally reviewed docs/business-map YAML change, with or without an existing business map. Use for post-integration maintenance, initial-domain bootstrap, drift cleanup, candidate triage, and domain-scoped reconciliation in repositories with local observations.
compatibility: Requires Node.js 24+, Git, the current semantic-atlas CLI, retained local observations, and repository source access.
---

# Semantic Atlas Maintenance

Turn retained investigation leads into one bounded, current-evidence map change.
The candidate report preserves why a correction was proposed; current source,
tests, tracked product documents, and required runtime evidence decide whether
the canonical map changes.

## Prepare The Candidate Set

1. Resolve the repository root and keep the maintenance work in its assigned
   worktree.
2. Run the read-only report:

   ```bash
   semantic-atlas reconcile candidates --repo <absolute-repository-root>
   ```

3. Confirm the response is the v1 `reconcile candidates` envelope. Read each
   candidate's business-domain ownership, task evidence, `confirmed`,
   `contradicted`, or `unresolved` disposition, duplicate provenance, and
   linked independent reviews.
4. When the report contains no candidates, finish with a no-change result. An
   empty report is a complete maintenance outcome.

## Select One Business Domain

Choose one business domain for the run. Keep candidates from other domains in
the retained report for later maintenance. Within the selected domain, use
linked approved reviews and repeated provenance to prioritize investigation;
they strengthen the trail but remain evidence to verify rather than automatic
map authority.

Read [references/reconciliation.md](references/reconciliation.md) before
classifying candidates. It defines the evidence meaning, durable-content test,
duplicate handling, and clean stopping conditions.

## Confirm Current Business Meaning

1. Determine whether the selected domain already has an owning
   `docs/business-map/*.yaml` file. Preserve a `MAP_NOT_FOUND` result as the
   explicit bootstrap state.
2. Open every decisive current source, test, or tracked product document named
   by the candidate origins. Follow current callers or collaborators when the
   proposed relation changes both business endpoints.
3. Classify each candidate for this maintenance run:
   - `accepted`: current evidence supports the proposed durable correction;
   - `refined`: current evidence supports a narrower or differently worded
     durable correction;
   - `discarded`: the observation is implementation-local, stale in a way that
     no longer matters, or unsupported by current evidence;
   - `unresolved`: available evidence cannot decide stable business meaning.
4. Keep discarded and unresolved candidates outside the canonical map. Record
   their evidence-based reason in the maintenance result.

## Resolve One Owning YAML

Use the selected business domain as the ownership boundary:

- When the domain already has an owning YAML file, edit that file.
- When the graph exists but the selected domain has no owning file, create one
  domain-owned YAML file that participates in complete-graph validation.
- When no map documents exist, create one initial business-domain YAML under
  `docs/business-map/`. Establish its stable domain ID, title, summary, root
  node, and bounded accepted concepts from current evidence.

Limit the initial map to stable meaning supported by the selected candidates and current evidence.
Retain cross-domain relations as unresolved until both durable endpoints and
their owning domains can participate in one valid graph. The first map is a
reviewable business-domain seed rather than a taxonomy inferred from repository
structure.

## Edit One Owning YAML

Apply accepted and refined corrections to one owning YAML surface for the
selected business domain. This surface can be an existing domain file or the
new initial domain file. Preserve stable node IDs when business identity is
unchanged, use the source concept's owning file for directed relations, and keep
anchors as navigation hints rather than current-behavior claims.

Repeated origins for one duplicate candidate produce one map edit. Preserve
all originating task and review IDs in the maintenance result so independent
review can trace why the edit exists.

## Validate The Normal Git Change

Run the supported product boundaries after the edit:

```bash
semantic-atlas validate --repo <absolute-repository-root>
semantic-atlas render --repo <absolute-repository-root> \
  --output <repository-root>/tmp/semantic-atlas-<business-domain>.html
git diff --check
git diff -- docs/business-map/<owning-file>.yaml
```

Inspect the rendered projection for the changed neighborhood. For an initial
map, confirm that the Viewer presents one bounded business domain rather than a
repository structure. Confirm the Git diff changes one owning YAML surface and
leaves retained observations unchanged. Submit the ordinary map change for
independent review; the reviewer checks durable business meaning, relation
direction, evidence support, complete graph validity, and the one-domain
boundary.

## Report The Result

Report the selected business domain, candidate origins, each maintenance
classification and decisive evidence, the owning YAML file, validation and
render results, whether this is an initial map or an update, the Git diff, and
any discarded or unresolved leads. Separate the proposed map change from
independent-review approval and later merge.
