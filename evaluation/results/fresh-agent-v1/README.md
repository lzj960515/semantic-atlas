# Fresh Agent v1 Result

This directory contains the measured 12-case no-Atlas/Atlas comparison defined
by `evaluation/cases/plan.json`.

- `report.json` contains per-case summaries, medians, reductions, and the fixed
  gate decision.
- `runs/` contains one normalized, independently adjudicated record for each
  case and mode, including its complete audited shell-command sequence.
- Raw Codex JSONL, observer traces, rejected attempts, and adjudication working
  files remain task-internal under the runner's temporary directory. They are
  excluded because normalized run records contain the reproducibility and
  measurement evidence without transient local paths or model transport logs.

The official run used:

- fixture `framework-evaluation@fixture-v1`, deterministic commit
  `5a7bf9ec5c4a52148410b71c68d753a7f74ff47d`;
- Codex CLI 0.146.0 and `gpt-5.6-sol` in one ephemeral context per run;
- `fresh-agent-shell-allowlist-v2` and `tiktoken-o200k_base-v1` per-file
  source accounting for every published run;
- 22 retained `fresh-agent-runner-v1` records re-audited from preserved raw
  command logs, plus an isolated `fresh-agent-runner-v2` rerun of the affected
  `impact-nestjs-provider-contract` pair;
- host Skills, plugins, apps, hooks, MCP servers, memory, multi-agent
  delegation, and Skill search disabled for the replacement pair;
- one separate fresh adjudication context that received the frozen oracle only
  after all task contexts finished.

The result passes: all pairs retain full file recall, symbol recall, and answer
correctness; median opened files fall 38.46 percent and source tokens fall 49.07
percent; 61 recorded Atlas uncertainty events are routed to source without a
failure classification.

Run `pnpm evaluation:results` from the repository root to validate every record
and command sequence, then recompute the report comparison.
