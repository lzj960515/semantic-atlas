# [2026-09-17] revise | Upstream contribution workflow

- Change: added a contribution guide for people and coding agents. It identifies
  the canonical product repository and distinguishes product fixes from a
  consuming project's business maps, then explains fork remotes, the upstream
  base branch, explicit PR destinations, verification, and delivery state.
- Evidence: the repository identity in `package.json`, GitHub's canonical
  `lzj960515/semantic-atlas` repository and `main` branch, existing source-gate
  scripts, and the maintainer's report that agents were treating local forks as
  the product owner without locating upstream.
- Affected pages: [contribution guide](../../CONTRIBUTING.md),
  [Agent guide](../../AGENTS.md), [English README](../../README.md), and
  [Chinese README](../../README.zh-CN.md).
- Verification: independent review approved the contribution workflow; local
  Markdown targets and `git diff --check` pass. README links use the canonical
  GitHub guide so published package documentation reaches the same source.
