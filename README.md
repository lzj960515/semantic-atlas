# Semantic Atlas Next

Semantic Atlas Next is a Git-native business map for coding agents. It gives an
agent a durable but advisory view of business boundaries, relationships, data,
rules, interfaces, and likely source entry points before the agent confirms
current behavior in source code and tests.

The project is currently at its accepted documentation baseline. Product code
starts with one narrow flow: load tracked map files, validate the graph, query a
business neighborhood, and render the same graph for human inspection.

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
