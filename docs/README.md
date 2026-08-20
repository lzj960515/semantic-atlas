# Semantic Atlas Knowledge Base

This directory is the maintained knowledge layer for Semantic Atlas product
contracts, architecture, graph semantics, evaluation, and agent workflows. It
answers how the product behaves and why its boundaries exist; source code,
tests, generated schemas, and released artifacts remain the authority for the
current implementation.

Use [the documentation index](index.md) to find the owning page for a topic.
When a design changes, revise that owning page, update affected contracts and
incoming links, and record the knowledge change in [the maintenance log](log.md).

## Source boundary

- Product decisions come from accepted design discussions and are expressed in
  the product and graph contracts.
- Runtime claims are verified against source, tests, packaged CLI behavior, and
  generated schemas.
- CodeGraph documentation describes an internal structural dependency; Semantic
  Atlas public behavior remains owned by this repository.
- Unknown behavior and planned work stay explicitly marked rather than being
  presented as implemented capability.

## Maintenance rules

- Keep one authoritative page for each stable topic and link to it elsewhere.
- Start pages with the question they answer, their scope, and current status.
- Revise current conclusions in place; use `log.md` for chronology.
- Keep public documentation free of private repositories, internal operational
  measurements, and maintainer-only delivery details.
