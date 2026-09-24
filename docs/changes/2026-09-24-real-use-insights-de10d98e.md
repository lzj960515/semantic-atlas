# 2026-09-24 revise | Real-use task insights

- Change: Added a task-level, chronological insight report and a version 2 independent-review assessment for verifiable map leads. Revised longitudinal acceptance to use natural tasks and their reviews without repeating each task in a second mode. Existing version 1 reviews remain readable.
- Reason: Real EX and Creator Workbench tasks showed that a task can acquire context after an earlier rework, while the previous summary counts observations rather than engineering tasks. Existing observations did not establish positive map contribution.
- Evidence: [Observation contract](../observations.md), [evaluation criteria](../evaluation.md), source implementation and tests in this change; private 2026-09-24 task and review observations were examined outside Git.
- Affected pages: [Product contract](../product-contract.md), [architecture](../architecture.md), [observation contract](../observations.md), [evaluation](../evaluation.md), and the bundled understanding Skill.
- Verification: `pnpm release:verify` passed after the final code and Skill changes: 194 tests, typecheck, build, packaged CLI and Skill smoke checks, package dry run, and Git diff check. A private retrospective report was checked against retained observations; it is outside the package and Git diff.
