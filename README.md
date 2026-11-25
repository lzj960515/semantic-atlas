# Semantic Atlas

[![CI](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/semantic-atlas.svg)](https://www.npmjs.com/package/semantic-atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

**Business flows are a first-class part of building software with AI.**

Semantic Atlas gives people and their coding agents a shared place to understand,
discuss, and maintain how a business works. People read interactive flow diagrams.
AI edits the underlying files, finds the relevant code, and keeps both together
as the business changes.

Use it with a coding agent such as Codex or Claude Code. The product provides a
read-only flow viewer, a local CLI, and one bundled Skill that guides the agent's
business investigation, drawing, and maintenance.

## Start With The Business

As AI writes more code, people need a way to agree on its intended behavior.
Business flows make the actors, actions, conditions, and outcomes visible so
engineers and business teams can review the same decisions.

**Confirmed flows define the business specification. Code implements it. Tests
and runtime evidence check whether the implementation delivers it.**

When code and a flow disagree, the agent checks the business decision behind the
rule. The difference may be an implementation defect, an error in the diagram,
or a change in requirements. Existing code alone is insufficient reason to
rewrite an agreed rule. Unresolved differences stay explicit.

For a project without flows, the agent investigates the existing implementation
and drafts them progressively. It distinguishes confirmed requirements from
current behavior and open questions, revising earlier work as it learns more.

## People Read, AI Maintains

| People | AI |
| --- | --- |
| Read and explain the business | Investigate the business and its implementation |
| Follow branches and open local details | Write and reorganize flow source files |
| Discuss rules and decide intended behavior | Find relevant code and related business flows |
| Review changes against the agreed flows | Update flows and code in the same branch |

The browser is a read-only canvas. Distinct node styles identify starting
points, decisions, outcomes, and steps with deeper flows. Click a step's corner
icon to enter a deeper flow, then use **Previous level** to return. A small
information marker identifies notes; click the node body to read them.
Each declared entry has a **Start** badge and a blue outline so readers can find
where to begin, including flows with multiple entries.
**Other flows** opens a cascading menu for direct navigation.

Business readers see the process and its explanations. Code file and method
references remain available to AI through the source files and CLI.

## Install

Requires Node.js 24 or later.

```bash
npm install --global semantic-atlas --allow-scripts=semantic-atlas
semantic-atlas --version
```

Global installation also installs the unified `semantic-atlas` Skill. Codex and
Claude share its entry at `~/.agents/skills/semantic-atlas`; recognized older
maintenance Skills are removed during setup. The npm 12 `--allow-scripts` option
allows this package's installation step without changing global npm settings.

## Create And Read Your First Flows

Ask your coding agent:

> Use Semantic Atlas to map this project's business so I can explain it to a new
> teammate.

The agent uses the bundled Skill to investigate and write flow source files in
`docs/business-map/*.yaml`, alongside the project's code and Git history.
The [Skill](.agents/skills/semantic-atlas/SKILL.md) contains the drawing and
maintenance guidance; the [file format](docs/map-format.md) defines the fields.

After the files exist, register the project and open the viewer:

```bash
semantic-atlas project add /path/to/my-app
semantic-atlas project list
semantic-atlas web
```

Registered projects are available by name or ID from any working directory.
Names come from checkout directory names: the example above becomes `my-app`.
For duplicate names, use the ID returned by `project list`. A misspelled project
name returns suggestions for the agent to assess and retry explicitly.

You can also open repositories for a temporary session:

```bash
semantic-atlas web --repo /path/to/api /path/to/frontend --port 4310 --no-open
```

Temporary paths are not merged with registered projects and are not saved.
Each project loads its own files. Reselect or refresh a project to read its latest
flows; press `Ctrl+C` to stop the server. To read an existing flow collection,
start here; generating new files is only needed when the relevant flows are absent.

To try a fictional flow from a source checkout, see the
[order-management example](examples/订单管理/README.md).

### Open A Specific Flow

```bash
semantic-atlas web --project my-app --flow "<flow-id>" --no-open
```

The command validates the target and returns its full local URL in `data.url`,
including `#project=<project-id>&flow=<flow-id>`. The agent gives you that link
to open the exact diagram. For an unregistered project, use a single
`--repo /path/to/my-app`. With several registered projects, select one explicitly.

Switching projects or flows updates the URL. Copy it to reopen the same diagram;
refresh and browser back/forward restore the target. Unknown targets show a
clear message. Exported HTML uses the same fragment format with its embedded
project ID.

## Let The Business Decide The Diagram

Each diagram should explain a meaningful business process: who wants what,
which actions and conditions matter, and how the result is used. A project may
have several peer flows. Keep a coherent process together, and move a complex
local part into a deeper flow when that helps the reader understand it.

The agent chooses boundaries and depth from the business. A flow may cross a
frontend, backend, background job, and another repository; missing parts of the
story guide the next investigation. Multiple entry points and parallel paths
can be expressed when the business has them.

Node text states the concrete action or condition concisely. Notes carry longer
explanations, lists, and the business reasons behind a rule. The agent reviews
the source files for complete paths, misplaced fragments, unclear language, and
agreement with the business before handing them over.

Semantic Atlas manages, searches, validates, and renders these files. The Skill
teaches how to use those capabilities. The agent decides what to draw and how to
organize it, using the [flow-design guidance](.agents/skills/semantic-atlas/references/diagram-design.md).

## Change The Business And Its Implementation Together

1. Locate the relevant business flow and related code.
2. Express a changed business rule in the flow before implementing it. When fixing
   code that violates an existing rule, preserve the correct flow.
3. Implement and verify the behavior. Check related flows when their conditions,
   outcomes, or collaborators are affected.
4. Review and commit the flow and code changes in the same branch.

Internal refactoring or a comment change can leave the business flow unchanged.
During a merge, establish the combined business rules first, then check that the
merged implementation satisfies them.

## Query Business Context For AI

<a id="query-and-render"></a>

An agent can enter through a known flow or concept ID, or search by business
intent. It chooses the relevant entry directly; the viewer's hierarchy is for
human navigation.

```bash
semantic-atlas search "cancel an order before shipment" --flows --project my-app
semantic-atlas flows "<flow-id>" --project my-app
semantic-atlas context "<concept-id>" --project my-app
```

Use the IDs returned by the query. Results are compact JSON with business rules,
recorded relationships, related flow references, flow-file locations, and code
file or symbol anchors. These help the agent find the implementation and the
flow files affected by a change. Recorded links describe known relationships;
the agent still traces any missing callers or consumers needed for the task.

Search ranks up to five candidates using words in business names, aliases,
steps, and descriptions. The attached context belongs to the first candidate;
the agent assesses it and fetches another candidate by ID when appropriate.
Code symbols are navigation hints, while flow-file line locations point to the
current declarations to maintain. See the [query contract](docs/map-format.md#context-projection).

Use `--repo /path/to/my-app` instead of `--project my-app` for an unregistered
checkout. To validate or export a self-contained interactive HTML file:

```bash
semantic-atlas validate --project my-app
semantic-atlas render --project my-app --output ./business-flows.html
```

## Upgrade

```bash
semantic-atlas upgrade
```

This installs the current stable package, verifies the CLI version, and updates
the bundled Skill together. If an older CLI cannot complete its version check,
run the global installation command again.

<details>
<summary>Skill installation and conflicts</summary>

### Skill conflicts

If installation scripts were disabled, run `semantic-atlas setup`. Installing as
a project dependency leaves user-level Skills unchanged.

`MANAGED_SKILL_CONFLICT` means the destination cannot be identified as a Semantic
Atlas Skill. Move the reported directory outside agent Skill discovery paths,
then run `semantic-atlas setup` again. If `upgrade` fails at `step: "setup"`, the
CLI is already installed; resolve the directory conflict and rerun setup.

</details>

## Local Data And Privacy

Flow source files stay in their project repositories. Project registration
stores local checkout paths in `~/.semantic-atlas/projects.json`. The viewer
listens on `127.0.0.1`; repository paths stay server-side. Export writes a local
HTML file to the requested destination. Semantic Atlas works locally without
an account or telemetry uploads.

The CLI follows the terminal's language environment. The viewer and exported
HTML follow browser language preferences. English and Simplified Chinese are
supported; see [language selection](docs/architecture.md#internationalization).

<details>
<summary>Optional historical observations and reconciliation</summary>

These tools read or record explicit engineering observations. Use them when
working with retained evidence; ordinary maintenance keeps flows and code
together in the development branch.

```bash
semantic-atlas observe task --stdin --repo /path/to/my-app
semantic-atlas reconcile status --repo /path/to/my-app
semantic-atlas reconcile candidates --repo /path/to/my-app
```

See the [observation contract](docs/observations.md) for record formats and
historical-tool behavior.

</details>

## Development

Read the [contribution guide](https://github.com/lzj960515/semantic-atlas/blob/main/CONTRIBUTING.md)
for the upstream repository and PR workflow.

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

The candidate check covers lint, formatting, tests, types, build, rendering, and
packaged installation. Public releases use an immutable GitHub Release and the
protected npm workflow, with npm provenance and independent public-package
verification. See the [release procedure](https://github.com/lzj960515/semantic-atlas/blob/main/.claude/commands/release.md).

## Further Reading

- [Unified Skill](.agents/skills/semantic-atlas/SKILL.md)
- [Flow-design guidance](.agents/skills/semantic-atlas/references/diagram-design.md)
- [Flow source format and query contract](docs/map-format.md)
- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Evaluation and its evidence limits](docs/evaluation.md)

## License

[MIT](LICENSE)
