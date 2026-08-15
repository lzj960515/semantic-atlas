# Fresh Agent Evaluation Protocol

## Goal

The evaluation compares an ordinary Fresh Agent source workflow with the same agent using Semantic Atlas. It measures whether Atlas preserves answer correctness and necessary dependency recall while reducing source context. The gate and metrics are fixed in the product contract before results are collected.

## Artifacts

The protocol separates three responsibilities:

1. An evaluation plan defines the prompt, immutable fixture revision, framework/category labels, and an oracle of acceptance criteria, required files, and required symbols.
2. A run record captures the agent identity, mode, timing, source observations, Atlas calls, complete answer text, answer references, and adjudication.
3. The validator checks the contracts and derives recall, unique opened files, source token usage, and Atlas call count.

Normative schemas are:

- `schemas/evaluation-plan-v1.schema.json`;
- `schemas/evaluation-run-v1.schema.json`.

The official planned cases are in `evaluation/cases/plan.json`. `evaluation/examples/no-atlas-run.json` demonstrates the run format and is not a measured product result.

## Reproducible run procedure

For each case and mode:

1. Check out the exact fixture revision recorded by the case.
2. Start a new agent conversation with no prior task or repository context. Record the agent product and model. Disable host Skills, plugins, apps, hooks, MCP servers, memory, multi-agent delegation, and Skill search while preserving the local Codex authentication and model-provider configuration needed to execute the run.
3. Give the agent the case prompt and repository only. Keep the oracle, the other mode's result, the Semantic Atlas Skill name, and the Skill body out of the task prompt.
4. Keep model, agent instructions, tool policy, fixture revision, and task prompt identical for the paired runs. In `atlas` mode, install the candidate under the fixture's ignored `.agents/skills/semantic-atlas` directory and expose the packaged CLI; in `no-atlas` mode, provide neither. Codex must select the candidate through its repository Skill discovery and description matching.
5. In `no-atlas` mode, use normal source and shell tools and record zero Atlas calls. In `atlas` mode, record each Semantic Atlas command.
6. Record candidate `SKILL.md` and conditional-reference reads separately as `skillLoads`. Record a `sourceOpens` event whenever repository source text is returned to the agent, including file reads and search snippets. Bind each source event to the successful observer command's global sequence and exit status; failed commands cannot establish source confirmation. Skill instruction text does not count as source context.
7. Record the number of source tokens exposed by each event using the execution environment's source-input accounting. Put the stable method/version in `sourceTokenMethod`. Count repeated reads again in token totals.
8. Save the agent's reported files and symbols. An evaluator who did not guide the run compares the answer with the oracle and records correctness plus notes.
9. Audit the complete Codex shell-command sequence. An Atlas run is valid only when it loads the repository Skill, runs `status` before source reads, queries the map before source reads, and opens decisive source afterward. A decisive source file must come from a successful trace-backed observer read or search and occur in the final reported evidence and hidden oracle. Retain each Atlas JSON envelope at its global command sequence and retain the ordered conditional-reference loads. Every matching state trigger, including one observed after an earlier source read, requires the reference procedure to be loaded; when later source fallback occurs, the load must precede that fallback.
10. Publish the complete command and discovery evidence, then validate and summarize the baseline with `pnpm evaluation:validate` or pass additional run paths to `scripts/validate-evaluation.ts --baseline`.

A run is invalid when it lacks exact source-token accounting, is not a fresh context, uses a different fixture revision, sees its oracle, contains an Atlas call in `no-atlas` mode, reads a host instruction, or uses a shell command outside the versioned allowlist. Invalid runs are repeated rather than estimated.

The published `fresh-agent-v1` run uses the repository-owned source observer and
`tiktoken-o200k_base-v1`. Every observer invocation appends one JSONL record per
returned file. The runner normalizes those atomically appended records to a
strict event sequence. The `fresh-agent-shell-allowlist-v4` policy accepts only
observer reads/searches, read-only Semantic Atlas status/map/changes commands,
bounded file-name listings, and content-free availability probes. Atlas commands
must satisfy the product CLI's complete argument grammar, and `--repo` is
prohibited because each process already runs from its measured fixture. The
policy rejects alternative readers, arbitrary executables and wrappers, external
instruction paths, command substitution, redirection, unsupported command
composition, and unquoted shell word generation such as brace, parameter, tilde,
or filename expansion. The fixed `$EVALUATION_OBSERVER` parameter is the only
permitted shell expansion. The runner rejects failed audits before adjudication,
and published-result validation re-audits every recorded command sequence and
its derived Atlas calls.

Runner v5 adds repository-native Skill discovery evidence. It copies the
candidate Skill into only the Atlas fixture through a Git-local ignore rule,
never injects its body into the task prompt, separates `skillLoads` from measured
source, binds every retained Atlas envelope and source observation to the complete
command timeline, and derives the status-map-source workflow audit in
`protocol.skillDiscovery`. Discovery uses only successful trace-backed source
commands, and state-triggered references remain mandatory after source inspection
as well as before the first source fallback.
The runner and published-artifact validator use the same derivation, compare the
stored proof exactly, and require state-triggered references between the matching
Atlas result and source fallback. The source command allowlist remains unchanged.

## Metrics

- Required-file recall is the fraction of oracle files present in `answer.reportedFiles`.
- Required-symbol recall is the fraction of `(file, symbol name)` oracle pairs present in `answer.reportedSymbols`.
- Final-answer correctness is the independent boolean adjudication against the case prompt and oracle.
- Opened source files count unique paths in `observations.sourceOpens`.
- Source input tokens sum every source-open event, including repeated reads.
- Atlas call count is the number of recorded Atlas commands.

The comparative report shows per-case results and medians by mode. It also classifies failures such as missed dependency, incorrect answer, stale knowledge, unknown boundary mishandling, unsupported source, or protocol violation.

The release passes this evaluation portion only when every Atlas-assisted case has no lower required-file recall, required-symbol recall, or answer correctness than its paired no-Atlas run; no stale, hypothesis, or unknown fact is represented as exact; and either median unique opened source files or median source input tokens falls by at least 30 percent.

## Published result

The measured `fresh-agent-v1` artifacts are in
`evaluation/results/fresh-agent-v1/`. They contain 24 independently adjudicated
runs over the frozen 12-case matrix. Both modes use Codex CLI 0.146.0 with
`gpt-5.6-sol`, fresh ephemeral contexts, the same fixture commit and task input,
and the same command policy. Atlas mode differs only by the availability of the
Semantic Atlas Skill, CLI, and current worktree-local index. The retained 22
`fresh-agent-runner-v1` records were re-audited from preserved raw command logs;
the affected NestJS provider-contract pair was replaced under
`fresh-agent-runner-v2` with host capabilities explicitly disabled. All 24
published command sequences were subsequently re-audited under the v3
fixture-local Atlas grammar.

All 12 pairs retained 100 percent required-file recall, required-symbol recall,
and answer correctness. Median unique opened source files fell from 6.5 to 4
(38.46 percent), and median source tokens fell from 1,351 to 688 (49.07
percent). Atlas runs recorded 61 routed partial, unknown, or related boundary
events and no uncertainty-handling failure. The fixed gate passed without being
changed after results were collected.

These retained artifacts establish the frozen comparative gate; they predate
runner v5 and do not by themselves prove implicit Skill discovery. New candidate
runs must also carry the v5 discovery evidence described above.

The separately retained
`evaluation/results/fresh-agent-discovery-v5/location-nestjs-provider-atlas.json`
is a complete runner-v5 Atlas run over the same synthetic fixture. A fresh
ephemeral Codex context discovered the repository Skill without prompt-body
injection, completed the status-map-source workflow, and bound two decisive
source observations to successful global commands. Snapshot bootstrap, result
routing, and GraphPatch authoring each have a matching timeline proof. A second
fresh context independently adjudicated the answer correct with no failure
classification. This artifact proves the discovery protocol; it does not replace
or alter the frozen 24-run comparative metrics.

Validate the published records with:

```sh
pnpm evaluation:results
```

Validate the retained runner-v5 discovery artifact with:

```sh
pnpm evaluation:discovery
```

`pnpm evaluation:run` rebuilds the deterministic fixture repositories, runs 24
new ephemeral Codex contexts plus an independent adjudication context, and
replaces the published run records and report. It requires a working local
Codex login and incurs model usage.

A protocol repair can replace one independently adjudicated pair and recompute
the complete report while retaining only records that pass the current schema
and command audit:

```sh
pnpm evaluation:run -- --case <case-id> --publish-selected
```

## Planned case matrix

| Category | Case | Frameworks |
| --- | --- | --- |
| Location | Locate a NestJS operation provider | NestJS |
| Location | Locate a GraphQL query implementation | GraphQL |
| Location | Locate a TypeORM entity relation | TypeORM |
| Location | Locate a BullMQ job consumer | BullMQ |
| Location | Trace a GraphQL mutation to a NestJS provider | NestJS, GraphQL |
| Location | Trace a BullMQ job to a TypeORM write | TypeORM, BullMQ |
| Dependency/impact | Assess a NestJS provider contract change | NestJS |
| Dependency/impact | Assess a GraphQL output field change | GraphQL |
| Dependency/impact | Assess a TypeORM column change | TypeORM |
| Dependency/impact | Assess a BullMQ job payload change | BullMQ |
| Dependency/impact | Assess a NestJS and TypeORM transaction change | NestJS, TypeORM |
| Dependency/impact | Assess a GraphQL to BullMQ workflow change | GraphQL, BullMQ |

The synthetic fixture described by this plan is implemented by later indexing and framework-adapter work. Its stable paths and oracle symbols are already fixed so the gate cannot be tailored after product results are known.

## Private real-project cases

Real-repository prompts, paths, revisions, or answers may be sensitive. Store their plan and run records outside the published repository, or under the ignored `evaluation/private/` directory. The evaluation schema supports a `private` fixture with an opaque `repositoryAlias`; validate such a plan without the `--baseline` flag. The private operator mapping from that alias to a local repository never enters published fixtures. Aggregated reports may publish counts and metrics only after removing identifying paths and answers.
