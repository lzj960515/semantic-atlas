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
2. Start a new agent conversation with no prior task or repository context. Record the agent product and model. Do not reuse source summaries between runs.
3. Give the agent the case prompt and repository only. Keep the oracle and the other mode's result outside the agent context.
4. Keep model, agent instructions, tool policy, fixture revision, and task prompt identical for the paired runs. The only workflow difference is whether the Semantic Atlas Skill and CLI are available.
5. In `no-atlas` mode, use normal source and shell tools and record zero Atlas calls. In `atlas` mode, record each Semantic Atlas command.
6. Record a `sourceOpens` event whenever repository source text is returned to the agent, including file reads and search snippets. Split multi-file tool output into one event per file.
7. Record the number of source tokens exposed by each event using the execution environment's source-input accounting. Put the stable method/version in `sourceTokenMethod`. Count repeated reads again in token totals.
8. Save the agent's reported files and symbols. An evaluator who did not guide the run compares the answer with the oracle and records correctness plus notes.
9. Validate and summarize the published baseline with `pnpm evaluation:validate` or pass additional run paths to `scripts/validate-evaluation.ts --baseline`.

A run is invalid when it lacks exact source-token accounting, is not a fresh context, uses a different fixture revision, sees its oracle, or contains an Atlas call in `no-atlas` mode. Invalid runs are repeated rather than estimated.

## Metrics

- Required-file recall is the fraction of oracle files present in `answer.reportedFiles`.
- Required-symbol recall is the fraction of `(file, symbol name)` oracle pairs present in `answer.reportedSymbols`.
- Final-answer correctness is the independent boolean adjudication against the case prompt and oracle.
- Opened source files count unique paths in `observations.sourceOpens`.
- Source input tokens sum every source-open event, including repeated reads.
- Atlas call count is the number of recorded Atlas commands.

The comparative report shows per-case results and medians by mode. It also classifies failures such as missed dependency, incorrect answer, stale knowledge, unknown boundary mishandling, unsupported source, or protocol violation.

The release passes this evaluation portion only when every Atlas-assisted case has no lower required-file recall, required-symbol recall, or answer correctness than its paired no-Atlas run; no stale, hypothesis, or unknown fact is represented as exact; and either median unique opened source files or median source input tokens falls by at least 30 percent.

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
