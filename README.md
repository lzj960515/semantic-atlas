# Semantic Atlas Next

Semantic Atlas Next is a Git-native business map for coding agents. It gives an
agent a durable but advisory view of business boundaries, relationships, data,
rules, interfaces, and likely source entry points before the agent confirms
current behavior in source code and tests.

The first two product slices load tracked YAML files, validate the complete
repository graph, return a local business neighborhood, and render the same
normalized graph as a deterministic static HTML artifact. The repository Agent
Skill and real-task accuracy evaluation remain later delivery slices.

## CLI

Repositories place map documents in `docs/business-map/*.yaml` and can query
them without creating durable runtime state:

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas context "Checkout" --repo /path/to/repository
semantic-atlas render --repo /path/to/repository --output ./business-map.html
```

All commands return versioned JSON envelopes and meaningful exit codes.
`render` writes static HTML after the same complete-graph validation used by
`context`; when `--output` is omitted, it writes `semantic-atlas.html` in the
selected repository. The artifact keeps labels readable on narrow screens with
horizontal scrolling and contains no editing or mutation path.

A missing or stale map remains an advisory discovery result; current source,
tests, and tracked product documents control engineering conclusions.

## Authority

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Map format](docs/map-format.md)
- [Evaluation](docs/evaluation.md)
- [Documentation index](docs/index.md)

## Current Status

The previous Semantic Atlas implementation remains a separate, frozen
experiment. This repository starts from the new product model and imports no
runtime code or persistence lifecycle from that implementation.
