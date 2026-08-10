# CLI Contract v1

## Invocation

The npm package and executable are both named `semantic-atlas`. Development uses Node.js 24; the published CLI supports Node.js 22.12 and newer.

Global options:

- `--repo <path>` selects a directory within the target repository; the default is the current directory.
- `--pretty` indents JSON without changing fields or values.

Commands:

| Command | Contract |
| --- | --- |
| `status` | Report repository identity, current revision, latest snapshot, freshness, external store location, and language support. |
| `index` | Create or reuse the content-derived snapshot and report added, changed, reused, and removed facts and unknowns. |
| `map roots` | Return top-level capabilities or structural module roots before learning. |
| `map children <node-id>` | Follow `part_of` and `contains` children. |
| `map search <query> [--limit <n>]` | Lexically rank labels, aliases, summaries, symbols, and paths; the default limit is 20. |
| `map show <node-id> [--depth <n>]` | Return locations, evidence-rich neighbors, invariants, tests, validity, and unknowns; depth defaults to 1 and is limited to 3. |
| `learn --stdin` | Read one complete GraphPatch v1 JSON value from standard input and apply it atomically. |
| `changes [--from <snapshot-id>] [--to <snapshot-id>]` | Report semantic graph changes between Atlas snapshots, not a raw Git diff. Defaults compare the previous and current snapshots. |

`map` commands are graph access primitives. The calling agent extracts concepts, reformulates searches, reads source, and judges impact.

## Response envelope

Every command writes one JSON envelope to standard output. The normative discriminated schema is `schemas/cli-envelope-v1.schema.json`.

```json
{
  "schemaVersion": 1,
  "repository": {
    "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "root": "/workspace/example",
    "headCommit": "0123456789abcdef0123456789abcdef01234567"
  },
  "snapshot": null,
  "status": "ok",
  "data": {
    "command": "status",
    "currentRevision": {
      "headCommit": "0123456789abcdef0123456789abcdef01234567",
      "changes": { "staged": 0, "unstaged": 0, "untracked": 0 }
    },
    "freshness": "missing",
    "storeLocation": "/user-data/semantic-atlas/repository.sqlite",
    "languages": [
      { "language": "typescript", "support": "supported" }
    ]
  },
  "warnings": []
}
```

- Successful responses have `status: "ok" | "partial"`, a non-null repository, and command data selected by `data.command`.
- `snapshot` is `null` before the first successful index. Otherwise it includes the snapshot ID, Git HEAD, creation time, and `current` or `stale` freshness.
- `partial` means usable data contains explicit unsupported, stale, or unknown boundaries.
- Business map nodes and relations always include `certainty`, derived `validity`, and evidence. Structural nodes expose validity and source locations; unknown boundaries expose `unknown`, their reason, location, and candidates. Unsupported languages include a reason instead of an approximate analysis.
- `warnings` contains stable codes and descriptions for non-fatal conditions. Consumers use codes rather than parsing messages.

## Command data

The schema requires these fields while allowing additive fields inside command data:

| `data.command` | Required result fields |
| --- | --- |
| `status` | `currentRevision`, `freshness`, `storeLocation`, `languages` |
| `index` | `snapshotId`, fact counts, unknown-boundary counts |
| `map.roots` | top-level `Capability` or structural `Module` nodes |
| `map.children` | `nodeId`, `children` |
| `map.search` | `query`, `limit`, scored `results` |
| `map.show` | `node`, `depth`, evidence-aware `neighbors`, `Invariant` nodes, structural `Test` nodes, `unknowns` |
| `learn` | `baseSnapshotId`, `snapshotId`, applied operation counts |
| `changes` | source and target snapshot IDs, node/relation change sets, stale assertions |

Map node and relation objects preserve their evidence lifecycle. When a source hash changes, a business node can remain addressable by key but its `summary` is returned with `validity: "stale"`; callers therefore cannot confuse vocabulary identity with a current fact.

## Errors

Handled failures have `status: "error"` and structured data:

```json
{
  "command": null,
  "error": {
    "code": "INVALID_INPUT",
    "message": "The command arguments are invalid."
  }
}
```

`command` is null when parsing fails before a public command is identified. Scalar or command-success data is invalid in an error envelope. Standard output contains only the envelope; human diagnostics and unexpected stack information go to standard error. Pretty formatting never changes the schema.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Command completed with `ok` or `partial` data |
| `1` | Unexpected internal failure |
| `2` | Invalid command, option, stdin, or schema version |
| `3` | Repository discovery or unsupported-repository failure |
| `4` | Required Atlas state is missing or stale for the requested operation |
| `5` | GraphPatch concurrency, evidence, or repository-boundary rejection |

Handled nonzero failures still emit a versioned error envelope when a response can be formed. Diagnostics never replace the machine-readable response.

## Compatibility

Top-level envelope fields, command discriminants, and required command fields are closed within version 1. Additive fields may appear inside command data and map result objects; callers ignore fields they do not understand. A removed field, changed meaning, enum incompatibility, or operation change requires a new `schemaVersion`. GraphPatch and other input objects remain strict and reject unknown fields.
