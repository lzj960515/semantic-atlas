# Result routing

Use this reference when a Semantic Atlas command produces missing, stale,
partial, unsupported, unknown, ambiguous, empty, or error results.

## Envelope discipline

Every handled CLI command writes one JSON envelope to standard output. Read:

- `schemaVersion` before interpreting fields;
- `status` as `ok`, `partial`, or `error`;
- `repository.root` to confirm the intended worktree;
- `snapshot.id` and `snapshot.freshness` for the published world;
- `data.command` before consuming command-specific fields;
- `warnings[].code` as the stable warning identity.

Treat additive command fields as optional. Use the command discriminant and
documented fields rather than matching prose messages.

## Freshness and availability

| Observation | Route |
| --- | --- |
| `data.freshness: "current"`, complete backend | Query the map. |
| `data.freshness: "missing"` | Run `index`, then inspect its envelope before querying. |
| `data.freshness: "stale"` | Run `index`; use old business identities only as vocabulary until publication completes. |
| Backend `missing`, `building`, `failed`, or `incomplete` | Run or retry `index` when appropriate; use source while no complete publication exists. |
| `ATLAS_STATE_MISSING` or `ATLAS_STATE_STALE` | Refresh with `status` and `index`; repeat the query only against a current publication. |
| `UNSUPPORTED_REPOSITORY` | Record the unsupported repository boundary and use the normal source workflow. |

An index result can be `partial` while still publishing useful current data.
Route its unsupported-language, stale-assertion, and unknown-boundary warnings
individually.

## Query results

### Empty or weak search

1. Reduce the task to business vocabulary, exact symbol fragments, paths,
   interface names, data names, and framework-owned terms.
2. Try up to two materially different lexical formulations rather than many
   cosmetic variants.
3. Inspect `map roots` and the closest owning hierarchy.
4. Use any returned locations as bounded source seeds.
5. Classify the map as `insufficient` for this task when no relevant node or
   relationship emerges, then switch to bounded source fallback.

Lexical scores rank results only. A high score does not establish correctness,
certainty, or business meaning.

### Unknown and ambiguity

For every `UnknownBoundary`, retain:

- its structural owner;
- unresolved operation and reason;
- source location;
- finite candidate list;
- structural support status and provenance.

Inspect the owner and candidates in source. Promote a relationship in the
Agent's conclusion only when the execution or assignment path is uniquely
established. Preserve the boundary when multiple candidates remain plausible.

### Stale assertions

A stale business node keeps useful key, label, and aliases while its summary or
relations lack current evidence. Reindex first. Then inspect the changed or
missing evidence and either use current source for the task or submit a new
GraphPatch after verification.

### Unsupported structure

Continue using supported nodes and relations as partial context. Inspect the
unsupported file, language, runtime behavior, reflection, or generated contract
through normal source tools. Keep the unsupported portion separate from exact
Atlas facts.

## Error outcomes

| Exit code | Meaning and route |
| --- | --- |
| `0` | Consume `ok` or `partial` data. |
| `1` | Treat as an internal failure; preserve diagnostics and use source. |
| `2` | Correct command, option, stdin, or schema input before retrying. |
| `3` | Confirm repository discovery and supported languages; use source for a genuinely unsupported repository. |
| `4` | Refresh missing/stale state or select a persisted change range. |
| `5` | Refresh the current snapshot/evidence, rebuild the GraphPatch, and retry only when the patch still represents verified knowledge. |

Handled errors still use JSON envelopes. Unexpected diagnostics belong to
standard error and remain troubleshooting evidence rather than map facts.
