# [2026-08-31] history | Documentation changes

- Defined `semantic-atlas@2.2.0` as the scenario-owned business-flow and linked
  relationship/flow Viewer release.
- Defined `semantic-atlas@2.1.3` as the public-package recovery after the
  immutable `v2.1.2` Release stopped before npm publication.
- Made packed-product acceptance perform a credential-free public-registry
  install under its isolated user home instead of depending on the runner's
  pnpm metadata and tarball cache containing the same dependency versions.
- Defined `semantic-atlas@2.1.2` as the reviewed maintenance-result and narrow
  orchestration-status release.
- Added immutable `MaintenanceObservation` artifacts for reviewed
  post-integration candidate outcomes, with exact source positions, explicit
  business-domain validation, current evidence, and merged-map identity.
- Made reconciliation return current actionable candidates: accepted, refined,
  and discarded sources terminate; unresolved sources wait for a new origin in
  the same candidate group before becoming actionable again.
- Split the maintenance Skill into Work, independent Review, and Integration
  phases so work-stage proposals cannot consume candidates and uncertain record
  retries reuse one idempotent document.
- Added the read-only `reconcile status` contract for orchestration. It returns
  one `required` boolean from task and maintenance observations while keeping
  candidate details, Review evidence, and business-domain selection internal.
- Added scenario-owned business flows with action, decision, and outcome steps,
  labeled transitions, stable concept references, complete-map validation, and
  deterministic context projection.
- Kept relationships and flows as separate semantics: relationships describe
  durable collaboration while flows describe business-relevant paths and
  branch-controlled outcomes.
- Extended the shared Viewer with linked relationship and flow views. Related
  flows are derived from stable business IDs rather than a second manual link.
- Updated the understanding and maintenance Skills to trace affected paths,
  classify source/flow discrepancies, and record domain-owned `flow`
  maintenance candidates only for durable business changes.
- Added a generic Commerce inventory-availability flow as the public example;
  existing private or product-specific diagrams remain outside this change.
