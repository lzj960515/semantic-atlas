# Desktop Web Viewer

This page answers how people browse Semantic Atlas business knowledge without
changing the Agent workflow, graph model, or repository state. It applies to
the `semantic-atlas web` command, its local HTTP API, and the bundled desktop
browser interface. Status: implemented in the current package.

## Product role

The Web viewer is a human-facing, read-only surface over the same Semantic
Atlas business world used by coding agents. It helps a person select a project,
read summarized business knowledge, move through the established `part_of`
hierarchy, search business vocabulary, and inspect direct relationships and
evidence.

The viewer presents business knowledge as a real spatial node map. The map
metaphor defines topology and interaction rather than a game theme: users see
business regions positioned on a canvas, follow visible hierarchy and business
relationship lines, pan and zoom the canvas, and enter a region to reveal its
next level. The surrounding interface remains a restrained product-development
UI with project selection, breadcrumb, search, and a detail panel. It does not
introduce game roles, presentation-specific node kinds, decorative world
semantics, or a mobile experience.

## Stable boundary

```text
semantic-atlas web
        |
        v
LocalWebServer -------- bundled desktop Web application
        |
        v
AtlasReadService
   |-- PrimaryRepositoryCatalog
   `-- WorldGraphQuery
        |
        v
existing Atlas repository knowledge and current structural publication
```

- `LocalWebServer` owns loopback HTTP, static assets, request validation, and
  API presentation.
- `AtlasReadService` owns the read use cases shared by HTTP and future CLI
  presentation refactoring. The server calls it directly and never executes
  `semantic-atlas map ...` as a subprocess.
- `PrimaryRepositoryCatalog` discovers Atlas repositories through Atlas-owned
  storage and Git inspection. It never exposes backend tables to the browser.
- `WorldGraphQuery` remains the authority for business views, search, direct
  node details, publication consistency, certainty, and validity.

The Web slice adds no graph table, node kind, relation kind, evidence format,
or presentation coordinate to durable Atlas knowledge. Layout is derived in
the browser for the visible frontier and is disposable.

## Primary-branch project scope

The Web viewer deliberately ignores linked worktrees. A project is visible
only when Atlas can resolve its primary working tree and that working tree is
currently attached to a branch named exactly `main` or `master`.

Repository discovery therefore follows these rules:

1. Group durable state by Atlas `repositoryId`.
2. Select only the state whose Git directory is the common Git directory; this
   is the repository's primary working tree.
3. Inspect that working tree's current branch and retain only `main` or
   `master`.
4. Return at most one project entry for each repository.
5. Never return linked-worktree roots, branches, or publication choices through
   the Web project catalog.

When a primary working tree moves away from `main` or `master`, the project is
absent until it returns. The viewer reads the most recent successfully published
business map for that primary working tree even when newer source changes make
the publication freshness `stale`. This is a browsing surface, not an indexing
gate: it never indexes or repairs the repository merely to answer a map request.
Missing, building, failed, or structurally incomplete publications remain
unavailable because there is no complete published map to read.

## Read-only lifecycle

`semantic-atlas web` starts one local server on `127.0.0.1`, optionally opens
the default browser, and remains active until interrupted. The server exposes
only the GET operations defined by [HTTP API v1](../contracts/http-api-v1.md).

The viewer never:

- invokes `index`, `learn`, GraphPatch, feedback mutation, or Git mutation;
- edits source, tests, configuration, Skills, or generated project state;
- accepts an arbitrary repository path from an HTTP client;
- returns linked worktrees or permits branch selection;
- exposes CodeGraph APIs, storage schema, structural search, or unrestricted
  source traversal.

Reads for one repository are serialized. Every map, search, and node request
uses the most recent complete publication for the current primary `main` or
`master` working tree and retains the existing publication-change check. A
publication change during a query fails the request instead of combining two
snapshots.

## Desktop information architecture

The first release targets desktop browsers only.

```text
+------------------+-----------------------------------------------+
| Projects         | Breadcrumb                         Search     |
|                  +-----------------------------------------------+
| semantic-atlas   |                                               |
| sample-project   | Visible business regions and relationships    |
|                  |                                               |
|                  |                               Detail panel    |
+------------------+-----------------------------------------------+
```

- The left rail lists eligible `main` or `master` projects and their current
  publication state.
- The header contains the current business breadcrumb and project-scoped
  business search.
- The main surface starts with the top-level `BusinessMapView`, then reads a
  focused map only when the user enters that region or semantic zoom reaches
  its next level. It does not request or draw the full graph.
- Selecting a region opens its business summary and direct relationships.
- Entering an expandable region requests its focused map view. Breadcrumb
  selection returns to an established ancestor.
- Search ranks existing business vocabulary. Selecting a result focuses its
  map view and node details.

Business `kind` remains existing Atlas data. It informs the node color and the
concise detail panel without adding a competing label to the map. Certainty and
validity remain part of the read model, while this human browsing surface keeps
the map focused on business names and available child counts.

### Spatial map interaction contract

- The project hub is a virtual center. Top-level regions occupy a complete
  deterministic ring; children expand in the outward-facing sector of their
  parent. Existing positions never move when another branch is loaded.
- Each selected project owns an in-memory map cache containing loaded focused
  maps, parentage, asserted connections, coordinates, camera state, and pending
  reads. It is cleared when the project changes and is never written to Atlas.
- Hierarchy paths connect a node to its parent using neutral solid lines.
  Asserted or projected business relationships use a distinct highlighted line
  treatment without exposing raw relation labels on the map, so navigation
  topology is not presented as a stored business assertion.
- Business regions are compact graph nodes, not content cards. Their label,
  and, when present, child count remain visible. Existing `kind`, validity,
  summaries, and evidence stay in the data model or concise detail panel rather
  than competing with business labels on the map. A leaf node has no secondary
  map text; an expandable node shows only its `N 项` child count.
- Selecting a node opens its details. Selecting an expandable node loads its
  focused map once, moves the camera to it, and zooms to the next semantic
  level; selecting a leaf only centers it and reads its details. Breadcrumbs
  move the camera to loaded ancestors rather than switching a page.
- Pointer drag pans the canvas. The wheel and controls zoom between `0.2` and
  `4.8`; wheel zoom remains anchored to the pointer. A fit control restores the
  complete loaded map.
- The map toolbar offers an immersive desktop mode. It hides the project rail,
  surrounding navigation, and detail panel while preserving the selected node,
  loaded map cache, and camera context; the same control or `Escape` restores
  the normal product view.
- Roots remain visible at every scale. Deeper levels appear at
  `0.55 * 1.6^(depth - 1)` and disappear visually below that threshold without
  deleting their cached maps, nodes, or coordinates. A relationship line is
  visible only while both of its endpoint regions are visible, so semantic
  zoom never leaves a line pointing to a hidden region. Crossing a threshold
  can load the nearby or selected expandable region.
- Search selection fills any missing focused-map path, then moves the camera to
  the matching node and opens its details; it does not create a separate
  list-based navigation model.

A card grid, tree list, or dashboard tile collection does not satisfy the map
surface contract. Cards may appear in search results or supporting details,
but they do not replace the spatial node-and-connection canvas.

The visual language is a light, neutral product interface with strong
typography, restrained color, legible topology, thin relationships, and short
state transitions. It does not use game styling, character metaphors,
decorative map textures, elaborate animation, or mobile-specific layouts.

The desktop viewer uses Simplified Chinese for its fixed interface copy. It
keeps authored business labels and summaries in their recorded language rather
than attempting an unreliable browser-side translation. The normal view keeps
only the project selector, compact path, search, map, camera controls, and a
small business-detail panel. Decorative branding, project diagnostics, map
legends, and instructional copy stay outside the primary viewing surface.

The detail panel describes the selected business region with its summary, the
existing business kind in the viewer locale, and nearby business names. It does
not expose aliases, evidence files, source symbols, certainty or validity
chips, raw relationship names, or incoming/outgoing direction. Those concepts
remain part of the read API and Agent evidence model; the human viewer does not
need them to browse business knowledge. Detail text and related-business names
wrap within the panel so long recorded labels cannot overflow the layout.

## Empty and unavailable states

- No eligible repositories: explain that the viewer lists only primary
  `main`/`master` working trees with Atlas state.
- Missing business knowledge: show the existing
  `BUSINESS_KNOWLEDGE_EMPTY` state without substituting code directories.
- Stale repository publication: continue to show the most recent complete
  primary-branch map. A later CLI or Agent index can refresh it, but browsing
  remains available in the meantime.
- Stale assertion: retain the node vocabulary and label the summary or relation
  as stale.
- Unknown project or node: return a typed not-found response without revealing
  filesystem candidates.

## Acceptance boundary

The slice is complete when a packaged installation can start
`semantic-atlas web`, list only primary `main`/`master` repositories, navigate a
current world and focused views through a pannable and zoomable spatial map,
search business nodes, inspect one node, serve no mutation endpoint, and leave
source, Git state, Atlas knowledge, and the Agent CLI behavior unchanged.

## Related contracts

- [Product contract](../product-contract.md)
- [Graph model](../contracts/graph-model.md)
- [CLI v1](../contracts/cli-v1.md)
- [HTTP API v1](../contracts/http-api-v1.md)
- [Continuous business learning](continuous-business-learning.md)
