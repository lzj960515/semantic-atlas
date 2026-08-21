# HTTP API Contract v1

This page defines the loopback, read-only HTTP interface served by
`semantic-atlas web`. It applies to the bundled desktop Web application and
local API consumers. Status: implemented in the current package.

## Transport and lifecycle

- The server binds to `127.0.0.1` and serves HTTP only for the local machine.
- The default port is `4310`; `--port` selects another available TCP port.
- Every API route is under `/api/v1`.
- API responses use UTF-8 JSON and `Cache-Control: no-store`.
- Static browser assets are outside `/api/v1` and use GET or HEAD.
- v1 defines no mutation method or remote-host mode.

Every successful API response has this envelope:

```json
{
  "schemaVersion": 1,
  "data": {}
}
```

Every handled error has this envelope:

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "The requested project is not available."
  }
}
```

Error codes are stable within v1. Messages are display text and may improve
without changing the code.

## Project identity

The API accepts only opaque Atlas repository IDs returned by the project
catalog. It never accepts a filesystem path from an HTTP request.

`GET /api/v1/projects` returns at most one item per repository. Each item is the
primary working tree currently attached to `main` or `master`; linked worktrees
are excluded before presentation.

```json
{
  "schemaVersion": 1,
  "data": {
    "projects": [
      {
        "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "name": "semantic-atlas",
        "root": "/workspace/semantic-atlas",
        "branch": "main",
        "headCommit": "0123456789abcdef0123456789abcdef01234567",
        "snapshotId": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "freshness": "current",
        "status": "current"
      }
    ]
  }
}
```

The local root is intentionally visible because the viewer is a local
developer product and direct source evidence may use that root. It is never
sent to a remote service by Semantic Atlas.

## Operations

### List projects

```http
GET /api/v1/projects
```

Returns eligible primary-branch repositories sorted by display name and then
root. Missing, stale, building, and failed publication state remains visible in
the project summary; only branch and primary-working-tree eligibility filters
the catalog. A `stale` freshness means source has changed since the last
successful primary-branch publication; it does not prevent map, search, or
node reads from serving that latest published map.

### Read project status

```http
GET /api/v1/projects/{repositoryId}/status
```

Returns repository identity, primary branch, current revision, publication
freshness, languages, backend completeness, and warnings. It does not expose
the Atlas database path.

### Read a map view

```http
GET /api/v1/projects/{repositoryId}/map
GET /api/v1/projects/{repositoryId}/map?focus={businessKey}
```

Returns the existing `BusinessMapView`: focus, breadcrumbs, root/child/context
regions, child counts, expandability, and projected business connections. The
API does not add layout coordinates or persist a projection.

### Search business knowledge

```http
GET /api/v1/projects/{repositoryId}/search?q={query}&limit={limit}
```

`q` is required and trimmed. `limit` defaults to `20` and must be an integer
from `1` through `100`. Results contain only business nodes and lexical ranking
scores. v1 exposes no structural search route.

### Read one business node

```http
GET /api/v1/projects/{repositoryId}/node?key={businessKey}
```

Returns the existing business assertion and its direct relationships, including
direct structural evidence already exposed by `map show`. It does not traverse
the structural graph or accept a depth.

## Errors

| HTTP status | Code | Meaning |
| --- | --- | --- |
| `400` | `INVALID_REQUEST` | Query or path input is missing, malformed, or outside a declared bound. |
| `404` | `PROJECT_NOT_FOUND` | The ID is not in the eligible primary-branch catalog. |
| `404` | `BUSINESS_NODE_NOT_FOUND` | The requested business key is absent. |
| `409` | `ATLAS_STATE_UNAVAILABLE` | The primary publication is missing, building, failed, or structurally incomplete. |
| `409` | `PUBLICATION_CHANGED` | The repository publication changed during a read. |
| `405` | `METHOD_NOT_ALLOWED` | The resource does not support the requested method. |
| `500` | `INTERNAL_ERROR` | An unexpected local failure occurred. |

Responses do not include stack traces, backend database paths, linked-worktree
paths, or candidate repository paths.

## Compatibility

Additive fields may appear inside successful data objects within v1. Clients
ignore fields they do not understand. Removing a field, changing field meaning,
adding a mutation, widening project eligibility, or changing an enum
incompatibly requires a new API version.

## Related pages

- [Desktop Web viewer](../architecture/web-viewer.md)
- [CLI v1](cli-v1.md)
- [Graph model](graph-model.md)
