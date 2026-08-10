# Semantic Atlas

Semantic Atlas is a local project world model for AI coding agents. It turns compiler-derived code structure and agent-verified business knowledge into a revision-aware map that agents can query through a CLI.

The project is under active development toward v0.1. The first release focuses on TypeScript and JavaScript repositories, ships as the `semantic-atlas` npm CLI, and integrates with coding agents through a Skill rather than MCP.

## Contracts

- [Product contract](docs/product-contract.md)
- [Graph model](docs/contracts/graph-model.md)
- [CLI v1](docs/contracts/cli-v1.md)
- [GraphPatch v1](docs/contracts/graph-patch-v1.md)
- [Fresh Agent evaluation](docs/evaluation.md)

## Product boundaries

- Source code remains the source of truth.
- Structural knowledge is derived from compiler evidence.
- Business knowledge is stored with revision and content-hash evidence.
- Stale or unresolved knowledge is explicit.
- Code editing, testing, Git operations, and natural-language reasoning remain the agent's responsibility.

Atlas runtime code is not implemented yet. This repository currently fixes the v0.1 product, graph, CLI, learning, and evaluation contracts that downstream implementation must satisfy.

## License

MIT
