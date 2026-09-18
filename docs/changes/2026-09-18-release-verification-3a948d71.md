# [2026-09-18] revise | Independent publication verification

- Change: separate successful npm publication from anonymous public registry
  verification so delayed registry visibility can be checked again without
  repeating publication. Document the five-minute verification deadline and
  recovery boundary for historical combined publish jobs.
- Evidence: the [release workflow](../../.github/workflows/release.yml),
  [publication verifier](../../scripts/verify-published-package.mjs), and
  [release contract tests](../../tests/release/release-contract.test.ts)
  establish the exact-tag, read-only verification job and protected publication
  boundary on 2026-09-18.
- Affected pages: [architecture](../architecture.md#release-automation),
  [release command](../../.claude/commands/release.md#failure-semantics),
  [English README](../../README.md#development), and
  [Chinese README](../../README.zh-CN.md#开发).
- Verification: the new job contract failed against the original workflow and
  all six release contract tests passed after the split. Targeted Oxfmt and
  Git diff checks passed. Live workflow execution remains a future release
  boundary; historical workflow results are preserved.
