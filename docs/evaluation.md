# Semantic Atlas Evaluation

This page defines how the initial product proves that an advisory business map
improves engineering accuracy and reduces routine human supervision. It applies
to the CLI, renderer, Agent Skill, and real-project evaluation.

**Status: accepted initial protocol; controlled Skill fixtures and the private
real-project evaluation pass.**

## Evaluation Question

The primary question is:

> Does the business-understanding Skill lead an agent to a correct,
> source-supported engineering conclusion and maintenance decision without
> routine human direction, including when the map is absent, stale, or
> incomplete?

A paired map comparison remains useful for measuring whether existing shared
knowledge improves accuracy over ordinary discovery. It is one evaluation mode,
not the Skill's activation boundary.

The evaluation observes investigation cost, but cost does not substitute for
correctness.

## Accuracy Dimensions

### Business-boundary accuracy

The answer identifies the capability, scenario, operation, data, invariant, and
interface boundaries required by the task. Repository folders or framework
components do not replace business ownership.

### Root-cause accuracy

The agent distinguishes where a symptom appears from the business behavior that
causes it. It follows an upstream relation when the fix belongs outside the
initially named module.

### Impact accuracy

The agent identifies required incoming and outgoing collaborators, affected
data, invariants, interfaces, tests, and asynchronous consumers. It avoids
unsupported expansion into unrelated areas.

### Evidence accuracy

Every claim that controls the change is confirmed in current source, tests,
tracked product documents, or required runtime evidence. Map statements are not
reported as current implementation facts without confirmation.

### Implementation accuracy

The delivered behavior fixes the confirmed cause, covers the required scope,
passes appropriate tests, and preserves repository contracts.

### Design quality

Independent review can follow the main flow, identify each module's stable
responsibility, and extend the design without working around task-specific
branches or duplicated mechanisms.

### Human intervention

The run records every point where a person must correct product direction,
business meaning, investigation scope, implementation design, or acceptance.
Routine progress reporting does not count as intervention; a required decision
or correction does.

## Required Case Types

The first real-project suite contains at least:

1. A downstream symptom whose correct fix belongs to an upstream business
   action.
2. A cross-capability feature involving one shared data concept.
3. An API, event, queue, or webhook boundary with a downstream consumer.
4. A durable invariant that constrains more than one implementation point.
5. A missing-map case where the Skill still activates and builds a bounded,
   source-supported business model.
6. A stale-anchor case where the business meaning remains useful but the source
   location changed.
7. A contradicted-relation case where current evidence must override the map.
8. A code-quality case where the first runnable implementation would create an
   unclear responsibility or unnecessary mechanism.

Cases use real repository structure and behavior. Private business facts stay
inside the private evaluation workspace and are summarized publicly only in
de-identified form.

## Controlled Skill Fixtures

The public repository contains a de-identified miniature engineering system at
`tests/fixtures/agent-skill/repository`. Its case contract covers an upstream
root cause, an interface with a downstream consumer, missing map knowledge, an
ambiguous term, a node without anchors, a stale anchor, and a relation that
current source contradicts.

Automated checks prove that each initial selector produces the intended public
CLI outcome and that every acceptance oracle points to present source, test, or
tracked product evidence. Fresh Agent runs then judge both mapped and mapless
workflow behavior: the Agent must activate from business task meaning, use the
bounded map outcome, reach the current-evidence conclusion, and report one
maintenance disposition separately. Mechanical controls must end without
manufactured business knowledge. These fixtures protect the Skill contract;
they do not replace the private real-project paired evaluation defined in this
page.

## Paired Execution

When practical, run each case in two fresh contexts with the same model,
repository revision, task wording, tool availability, and acceptance oracle:

- `ordinary`: normal repository discovery without the map or its Skill;
- `map-assisted`: the package-managed Skill with the tracked advisory map.

The task oracle remains unavailable to both task agents. An independent review
compares their source-supported conclusions and implementation candidates.

A paired comparison is useful evidence, not a requirement to manufacture a
statistical claim from too few real tasks. Every individual map-assisted case
must still be safe and explainable.

## Stale And Missing Knowledge

The suite deliberately mutates map usefulness:

- move or rename an anchor while preserving business behavior;
- omit one required collaborator;
- retain one relation that current source contradicts;
- use a task term absent from node names but present in an alias or neighbor;
- remove the complete map for one Skill-enabled mapless case.

A passing agent notices the limitation, opens current evidence, corrects its
task-specific model, and avoids presenting the stale statement as current fact.
The map file does not have to be repaired inside the engineering task.

## Review Record

Each run records:

- selected map nodes and relationships;
- map statements used as investigation leads;
- current files, tests, documents, or runtime evidence opened;
- confirmed and contradicted map statements;
- identified business boundary and root cause;
- required and unrelated impact surfaces;
- implementation or proposed change;
- verification performed;
- post-task maintenance disposition and any durable candidate;
- independent review findings;
- human decisions or corrections;
- optional observations for tokens, opened files, elapsed time, compute cost,
  and map-maintenance effort.

## Initial Acceptance

The initial product passes when:

- every map-assisted case reaches a correct source-supported conclusion;
- stale, missing, and contradicted knowledge routes to current evidence without
  an unsupported final claim;
- a mapless business task still activates the Skill, records `map_not_found`,
  and limits bootstrap knowledge to stable meaning supported by the task;
- mapped and mapless business tasks choose one maintenance disposition, while a
  mechanical control produces no business-maintenance work;
- required business boundaries and impact surfaces are identified in every
  case;
- implementation cases pass their behavioral tests and independent code-quality
  review;
- map-assisted runs require no routine human correction after the task contract
  is established;
- the paired evidence demonstrates at least one material accuracy improvement,
  such as finding an upstream owner or affected consumer missed by the ordinary
  run;
- any map-caused regression blocks acceptance and produces a concrete product or
  Skill correction before another measured run.

The first acceptance does not require lower token usage, fewer source files,
shorter runtime, cheaper map maintenance, public publication, or automatic map
updates.

## Private Real-Project Result

The first private evaluation completed on 2026-08-26 against one fixed revision
of a real service repository. The isolated workspace retained the frozen
tasks, source-supported oracles, private map, command traces, answers, candidate
changes, and independent reviews. None of those private artifacts or target
repository changes entered this repository.

The measured suite used four paired cases and eight fresh task-agent contexts.
Cases combined related concerns while covering all eight required types. Every
pair used the same model, source revision, task wording, shell tools, and output
contract; only the ordinary or package-managed map workflow differed.

The de-identified acceptance results are:

- all four map-assisted runs and all four ordinary runs reached the correct,
  source-supported business and engineering conclusion;
- the map-assisted runs detected the deliberately missing concept, stale source
  anchor, and contradicted relation, then let current evidence control the
  result;
- no map-assisted run introduced a correctness regression or unsupported final
  business claim;
- one pair produced a material accuracy improvement: the map-assisted run found
  a tenant-specific volume invariant in a shared-work reuse path that the
  ordinary run missed, expanding the required implementation and regression-test
  scope;
- both candidates for the implementation case passed the focused behavioral
  suite and received independent code-quality approval;
- no task agent required a human product, business, investigation, design, or
  acceptance correction after the frozen task contract was established.

One provider-routing failure occurred before any measured task work and was
excluded. Independent adjudication then exposed a mode-scope defect that asked
the ordinary control to report unavailable map state. The evaluator retained
that invalid adjudication, applied a general mode-aware correction, and reran
all four comparisons without changing the measured task inputs or answers.
These evaluation-harness events do not count as task-agent human intervention.

## Delivery Stages

Keep these results separate:

1. deterministic schema, graph, query, and renderer verification;
2. packaged CLI and repository Skill verification;
3. private real-project accuracy evaluation;
4. local integration of accepted changes;
5. public release or installation, when separately authorized.

An earlier result provides evidence for its own stage and does not imply a later
stage has completed.
