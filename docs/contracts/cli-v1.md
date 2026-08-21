# CLI Contract v1

## Invocation

The npm package and executable are both named `semantic-atlas`. Development uses Node.js 24; the published CLI supports Node.js 22.12 through 24.

Repository-independent lifecycle commands run before Git, Atlas storage, or
SQLite is opened:

| Command | Contract |
| --- | --- |
| `setup` | Atomically install or update the exact bundled `semantic-atlas` and `semantic-atlas-insights` Skills at `~/.agents/skills/`. A recognized legacy `~/.codex/skills/semantic-atlas` copy is removed after the shared installation succeeds. |
| `upgrade` | Resolve npm's `latest` tag, install that exact release globally, verify the new executable, and invoke the new package's `setup`. An already-current package still verifies and repairs its bundled Skills. |
| `web` | Start the loopback, desktop-only, read-only Web viewer and HTTP API. The project catalog contains only primary working trees on `main` or `master` and excludes linked worktrees. |
| `-h`, `--help` | Print top-level usage and command help. |
| `--version` | Print the installed package version. |

These commands write conventional text to standard output and diagnostics to
standard error. `setup` records the package version and a content fingerprint;
repeated execution verifies the installed files and restores a changed managed
copy. A directory that does not identify itself as the Semantic Atlas Skill is
reported as a conflict and left unchanged.

`upgrade` resolves a version before mutation and installs
`semantic-atlas@<resolved-version>` rather than leaving the install step bound to
a moving tag. It locates the new package through npm's global root and starts its
CLI through the current Node executable, so Skill synchronization is owned by
the package that was actually installed. Registry lookup, package installation,
new-version verification, and Skill synchronization are one fail-closed command:
any failed step returns exit code `1` and does not report the upgrade as ready.
`setup` and `upgrade` do not discover a Git repository or open Atlas storage.
`web` discovers existing Atlas repository stores, validates their primary Git
working trees, starts on `127.0.0.1`, and remains active until interrupted. It
does not write a project JSON envelope because its output is the local server
address and lifecycle diagnostics. The browser uses [HTTP API v1](http-api-v1.md),
not CLI subprocesses.
Installation-scoped `insights` commands also avoid Git and repository Atlas
storage, while opening the separate local insights store described in
[Insights v1](insights-v1.md).

Global project options:

- `--repo <path>` selects a directory within the target repository; the default is the current directory.
- `--pretty` indents a project or insights JSON envelope without changing fields or values.

Web options:

- `--port <n>` selects a TCP port from `1` through `65535`; the default is
  `4310`.
- `--no-open` starts the server without opening the default browser.
- `--repo <path>` selects the initial project only when the path resolves to an
  eligible primary working tree on `main` or `master`. It does not add or expose
  a linked worktree.

Project commands:

| Command | Contract |
| --- | --- |
| `status` | Report worktree identity, current revision, latest world snapshot, freshness, local store location, language support, and additive structural-backend metadata. |
| `index` | Build or synchronize the embedded structural index, reconcile Atlas evidence, publish the completed world snapshot, and report changed facts and unknowns. |
| `map view [business-key]` | Return the world business frontier, or zoom one level into a selected business region with breadcrumbs, child/context regions, and projected cross-boundary connections. An empty world returns `regions: []` with `BUSINESS_KNOWLEDGE_EMPTY`. |
| `map search <business-term> [--limit <n>]` | Lexically rank business labels, aliases, summaries, and attached evidence vocabulary; every result is a business node and the default limit is 20. |
| `map show <business-key>` | Return one business assertion plus its direct business relations and direct structural evidence links. The command does not recursively traverse CodeGraph. |
| `code search <structural-term> [--limit <n>]` | Return bounded structural symbols and source locations when business knowledge is absent or insufficient; the default limit is 20. |
| `learn --stdin` | Read one complete GraphPatch v1 JSON value from standard input and apply it atomically. |
| `changes [--from <snapshot-id>] [--to <snapshot-id>]` | Report net semantic graph changes between persisted Atlas snapshot endpoints, not a raw Git diff. The source must be an ancestor of the target in the publication chain; defaults compare the previous and current snapshots. |
| `feedback report --stdin` | Store an explicit, evidence-contextual product problem or suggestion after source confirmation. The report links nearby local command-event IDs without storing arguments or output. |

`map` commands expose business navigation. `code search` is the explicit structural fallback. The calling agent extracts concepts, reformulates searches, opens returned source locations, and judges impact.

## Response envelope

Every project command writes one JSON envelope to standard output. The normative discriminated schema is `schemas/cli-envelope-v1.schema.json`.

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
    "storeLocation": "/home/agent/.semantic-atlas/repositories/0123456789abcdef/atlas.db",
    "languages": [
      { "language": "typescript", "support": "supported" }
    ]
  },
  "warnings": []
}
```

- Successful responses have `status: "ok" | "partial"`, a non-null repository, and command data selected by `data.command`.
- `snapshot` is `null` before the first successful index. Otherwise it includes the snapshot ID, Git HEAD, creation time, and `current` or `stale` freshness.
- `partial` means usable data is accompanied by a warning or contains stale or otherwise bounded knowledge. An empty business map and an index with unresolved structural counts are usable `partial` results, not indexing failures.
- Business map nodes and direct relations always include `certainty`, derived `validity`, and evidence. Projected connections report contributor counts and certainty/validity distributions without becoming stored assertions. Structural code-search nodes preserve normalized backend provenance and support. Unsupported languages include a reason instead of an approximate analysis.
- `warnings` contains stable codes and descriptions for non-fatal conditions. Consumers use codes rather than parsing messages.
- `storeLocation` identifies the repository-wide Atlas knowledge database. The current worktree's `.atlas/codegraph.db` path remains an internal structural-backend detail.

## Command data

The schema requires these fields while allowing additive fields inside command data:

| `data.command` | Required result fields |
| --- | --- |
| `status` | `currentRevision`, `freshness`, `storeLocation`, `languages` |
| `index` | `snapshotId`, fact counts, unknown-boundary counts; backend version and evidence-rebinding counts are additive metadata until promoted by a later schema version |
| `map.view` | nullable `focus`, root-to-focus `breadcrumbs`, `regions`, and projected `connections` |
| `map.search` | `query`, `limit`, scored business-only `results` |
| `map.show` | business `node` and direct evidence-aware `relations` |
| `code.search` | `query`, `limit`, scored structural-only `results` with source locations and support |
| `learn` | `baseSnapshotId`, `snapshotId`, applied operation counts |
| `changes` | source and target snapshot IDs, node/relation change sets, stale assertions |
| `feedback.report` | created report ID, classification, source-confirmed flag, status, and linked-event count |

`index.facts` uses one structural-fact unit across every publication: one backend node or
relation is one fact. `added`, `changed`, and `reused` partition the facts in the newly
published graph; `removed` counts facts present only in the previous publication. A fact
is changed when its stable node identity or relation endpoints remain while its structural
content, location, or support changes.

Map node and direct relation objects preserve their evidence lifecycle. When evidence cannot uniquely rebind after indexing, a business node can remain addressable by key while its `summary` is returned with `validity: "stale"`; callers therefore cannot confuse vocabulary identity with a current fact.

In a world view, `focus` is null, `breadcrumbs` is empty, and every region has role `root`. In a focused view, `focus` is the selected business node, breadcrumbs run from its current root to the focus, direct children have role `child`, and related external branches have role `context`. Every region reports `childCount` and `expandable`.

Each connection identifies visible business endpoints and groups summaries by relation type. `directCount` counts stored relations whose endpoints are already visible at this level; `aggregatedCount` counts stored deeper relations lifted to the visible frontier. Certainty and validity objects count the underlying contributors. A relation projected to the same visible region is hidden until the agent zooms further in.

`BUSINESS_KNOWLEDGE_EMPTY` is the stable warning code for a current indexed world with no learned business nodes. World `map.view` returns an empty `regions` array in this state. Structural modules and symbols remain discoverable through `code.search`; they are never emitted as business regions.

`feedback report --stdin` accepts one strict JSON object with `kind`, `category`,
`impact`, `observed`, `expected`, optional `suggestion`, and `sourceConfirmed`.
The report itself is explicit feedback; the surrounding passive command event
contains only objective metadata. It is operational product data and never a
GraphPatch or business-world assertion.

Change ranges follow the current publication history and fold the requested endpoints into one content comparison. When a content-addressed snapshot was published more than once, `--to` selects its latest occurrence in that history and `--from` selects the latest matching occurrence at or before the target; equal IDs compare the selected occurrence with itself. Paths that have the same presence and content at both endpoints are omitted even if they changed in between, while `staleAssertions` reports the selected target occurrence's final validity state. An unknown target has no change result.

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

## Contract stability

This pre-adoption revision directly replaces the earlier roots/children/mixed-search/depth-traversal command set. It exposes no aliases or dual response shapes. The generated schema is the current v1 authority.

After adoption, top-level envelope fields, command discriminants, and required command fields are closed within version 1. Additive fields may appear inside command data and result objects; callers ignore fields they do not understand. A future removed field, changed meaning, enum incompatibility, or operation change requires a new `schemaVersion`. GraphPatch and other input objects remain strict and reject unknown fields.
