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

Every command writes one JSON envelope to standard output. The normative schema is `schemas/cli-envelope-v1.schema.json`.

```json
{
  "schemaVersion": 1,
  "repository": {
    "id": "repo_local-123",
    "root": "/workspace/example",
    "headCommit": "0123456789abcdef0123456789abcdef01234567"
  },
  "snapshot": null,
  "status": "ok",
  "data": {
    "command": "status",
    "freshness": "missing"
  },
  "warnings": []
}
```

- `repository` is `null` only when repository discovery fails.
- `snapshot` is `null` before the first successful index. Otherwise it includes the snapshot ID, Git HEAD, creation time, and `current` or `stale` freshness.
- `status` is `ok`, `partial`, or `error`. `partial` means usable data contains explicit unsupported or unknown boundaries.
- `data` is the command-specific JSON result. On a handled failure it contains a stable error `code`, human-readable `message`, and optional JSON `details`.
- `warnings` contains stable codes and descriptions for non-fatal conditions. Consumers must use codes rather than parsing messages.

Standard output contains only the envelope. Human diagnostics and unexpected internal stack information go to standard error. Pretty formatting never changes the schema.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Command completed with `ok` or `partial` data |
| `1` | Unexpected internal failure |
| `2` | Invalid command, option, stdin, or schema version |
| `3` | Repository discovery or unsupported-repository failure |
| `4` | Required Atlas state is missing or stale for the requested operation |
| `5` | GraphPatch concurrency, evidence, or repository-boundary rejection |

Handled nonzero failures still emit a versioned `error` envelope when a repository-independent response can be formed. Diagnostics never replace the machine-readable response.

## Compatibility

Additive fields may appear within version 1 command data. A breaking field, meaning, enum, or operation change requires a new `schemaVersion`. Unknown fields in input contracts are rejected; callers may ignore unknown additive fields in output data.
