# Framework Evaluation Fixture

The `framework-evaluation/` source tree implements the frozen
`framework-evaluation@fixture-v1`
oracle in `evaluation/cases/plan.json`. It supplies representative NestJS,
GraphQL, TypeORM, and BullMQ location and dependency/impact paths without
requiring external services or installed framework packages.

The evaluation runner copies this directory into a fresh Git repository,
commits it with a fixed identity and timestamp, and tags the commit
`fixture-v1`. `validateEvaluationFixture` parses every planned required file and
symbol with the TypeScript Compiler API before any measured run. The resulting
deterministic fixture commit for the published result is
`5a7bf9ec5c4a52148410b71c68d753a7f74ff47d`.

The fixture's `AGENTS.md` is identical in both modes. It routes all source text
through the source observer, keeps the fixture read-only, and uses Semantic
Atlas only when the runner makes its Skill and CLI available.
