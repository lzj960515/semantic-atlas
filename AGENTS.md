# Semantic Atlas Agent Guide

Semantic Atlas is a standalone public TypeScript repository for an AI-agent-only project world model.

## Product boundaries

- Keep source code as the authority and Atlas data as a revision-aware projection.
- Keep the runtime local, deterministic, and free of model or network dependencies.
- Expose agent workflows through the `semantic-atlas` CLI and a Codex Skill.
- Keep durable repository knowledge under `~/.semantic-atlas` and disposable CodeGraph state inside the target worktree's ignored `.atlas/` directory. Leave tracked source and project configuration unchanged.
- Represent unresolved dynamic behavior with explicit unknown boundaries.
- Leave natural-language reasoning, source editing, tests, Git operations, and review to the calling agent.

## Engineering

- Use TypeScript ESM with Node.js 24 for development and support Node.js 22.12 through 24.
- Use pnpm 11 and the scripts defined in this repository's `package.json`.
- Use the pinned `@colbymchenry/codegraph` SDK behind an Atlas-owned adapter for structural indexing, resolution, and queries.
- Use `node:sqlite` for persistence and Git CLI for repository state.
- Store Atlas-owned `atlas_*` business, evidence, snapshot, validity, and worktree publication state in the user-level repository database. Keep `.atlas/codegraph.db` worktree-local and CodeGraph-only.
- Compose one Atlas world graph without copying CodeGraph nodes and edges into parallel structural tables.
- Keep CodeGraph CLI, MCP, destructive database recreation, and backend-specific types behind the adapter boundary.
- Organize modules around repository inspection, structural-backend integration, snapshots, business knowledge, evidence rebinding, world-graph queries, changes, and CLI presentation.
- Keep public CLI output machine-readable and versioned.
- Add tests for behavioral changes and verify packaged CLI behavior before completion.

## Git

- Use English single-line Conventional Commits.
- Keep worktrees under `.worktrees/`.
- Keep task-internal notes under `tmp/`; preserve product documentation only when it belongs in the public repository.
