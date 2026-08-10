# Semantic Atlas Agent Guide

Semantic Atlas is a standalone public TypeScript repository for an AI-agent-only project world model.

## Product boundaries

- Keep source code as the authority and Atlas data as a revision-aware projection.
- Keep the runtime local, deterministic, and free of model or network dependencies.
- Expose agent workflows through the `semantic-atlas` CLI and a Codex Skill.
- Preserve the target repository as read-only; store Atlas data in the operating system user data directory.
- Represent unresolved dynamic behavior with explicit unknown boundaries.
- Leave natural-language reasoning, source editing, tests, Git operations, and review to the calling agent.

## Engineering

- Use TypeScript ESM with Node.js 24 for development and support Node.js 22.12 or newer.
- Use pnpm 11 and the scripts defined in this repository's `package.json`.
- Build exact TypeScript and JavaScript relationships with the TypeScript Compiler API.
- Use `node:sqlite` for persistence and Git CLI for repository state.
- Organize modules around repository inspection, snapshots, indexing, graph storage, knowledge validation, map queries, changes, and CLI presentation.
- Keep public CLI output machine-readable and versioned.
- Add tests for behavioral changes and verify packaged CLI behavior before completion.

## Git

- Use English single-line Conventional Commits.
- Keep worktrees under `.worktrees/`.
- Keep task-internal notes under `tmp/`; preserve product documentation only when it belongs in the public repository.
