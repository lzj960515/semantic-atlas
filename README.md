# Semantic Atlas Next

Semantic Atlas Next is a Git-native business map for coding agents. It gives an
agent a durable but advisory view of business boundaries, relationships, data,
rules, interfaces, and likely source entry points before the agent confirms
current behavior in source code and tests.

The first product slice now loads tracked YAML files, validates the complete
repository graph, and returns a local business neighborhood through a stable
CLI contract. Rendering, the repository Agent Skill, and real-task accuracy
evaluation remain later delivery slices.

## CLI

Repositories place map documents in `docs/business-map/*.yaml` and can query
them without creating durable runtime state:

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas context "Checkout" --repo /path/to/repository
```

Both commands return versioned JSON envelopes and meaningful exit codes. A
missing or stale map remains an advisory discovery result; current source,
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
