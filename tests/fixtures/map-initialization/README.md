# Map initialization Agent acceptance

This suite protects issue #8. Run `evals.json` through the skill-creator
`codex_skill_eval.py` workflow in independent contexts. Give the execution Agent
only its natural prompt, a copy of the named fixture, the bundled understanding
and maintenance Skills, and the candidate CLI. Keep this suite and all grading
criteria outside the execution workspace. Fixtures contain no maps or retained
observations. Use the same CLI, model, tool configuration and fixture for baseline
and candidate; retain the actual versions and transcripts.

Grade artifact behavior, not particular IDs, filenames, prose, or command counts.
Check each expectation against source, all generated YAML and the actual Viewer
model. Treat the one-project-domain/one-large-file result from the reported
failure as a failure of case 1 even when schema validation passes. Equally,
partitioning case 2 by HTTP/rules/storage fails despite having several files.
These controls ensure that file count alone cannot pass the suite.

Use `semantic-atlas validate` and `render` on the generated directory. Inspect
that every relation is declared beside its source node, every flow beside its
scenario, and shared concepts have a single identity. Inspect domain views for
external connected nodes. A CLI/environment failure is inconclusive; a valid
single oversized project map in case 1 is a behavioral failure. Preserve failed
runs as well as subsequent repairs.

The fixture has known business branches so the evaluator can judge completeness;
no specific flow count is prescribed. Independent review and integration may
remain pending in the isolated run. Report that boundary rather than inventing
approval, merged commits, task origins, or maintenance observations.
