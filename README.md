# Semantic Atlas

Semantic Atlas is a local project world model for AI coding agents. It turns compiler-derived code structure and agent-verified business knowledge into a revision-aware map that agents can query through a CLI.

The project is under active development toward v0.1. The first release focuses on TypeScript and JavaScript repositories, ships as the `semantic-atlas` npm CLI, and integrates with coding agents through a Skill rather than MCP.

## Product boundaries

- Source code remains the source of truth.
- Structural knowledge is derived from compiler evidence.
- Business knowledge is stored with revision and content-hash evidence.
- Stale or unresolved knowledge is explicit.
- Code editing, testing, Git operations, and natural-language reasoning remain the agent's responsibility.

## License

MIT
