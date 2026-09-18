# Design Business Boundaries

Use this reference before creating or changing a business partition, or when a
mapped owner, missing lifecycle or collaborator could change an engineering
conclusion. It owns boundary judgment; `map-authoring.md` owns YAML expression.
Apply it at the requested scale: a project map covers evidenced project
responsibilities, a local map covers one complete requested neighborhood, and an
engineering task establishes only the boundary needed for its decision.

## Start With The Responsibility, Then Draw It

A useful business area is a coherent responsibility: someone relies on its
result, it owns decisions that make that result true, and its supported lifecycle
explains how the result is established, changed and ended. A user journey may
cross several such areas. Calling another action, sharing a table, or appearing
in the same execution path proves collaboration; ownership requires evidence
about who decides the rule, authoritative state or outcome.

Before choosing domains or files, describe each plausible owner in working
notes using this compact shape. A short local task can keep the same reasoning
in its answer; no separate tracked document is required.

| Responsibility | Required evidence |
| --- | --- |
| Result and beneficiary | What user, operator or dependent capability can rely on this area to accomplish |
| Owned decisions and state | Rules it decides, records whose meaning/lifecycle it controls, and meaningful changes it permits |
| Supported lifecycle | How the responsibility starts, is used or changed, and ends; include alternative entries and consequential failure/refusal paths that actually exist |
| Collaborators and limits | Inputs/outputs it exchanges, who owns the other decisions, and what current repository evidence can establish |
| Source support and uncertainty | Decisive entry points, state/rule owners and tests; unresolved ownership that could alter the partition |

Use the card to test candidate boundaries, not to invent missing product
features. A library can own recording, revising, withdrawing and making its
knowledge available while a chat consumer owns answering a conversation. Those
activities can remain one library responsibility even when different modules or
entry points implement them. If source supports only retrieval, retain only that
supported scope and state the missing ownership evidence.

## Discover Coverage Independently Of The Existing Map

Build a bounded list of supported scenarios from current evidence before using
the map's node list as a completeness checklist. Start with product promises and
public/user/operator entry points. Cross-check durable state and its writers,
configuration and authorization owners, event/job/callback entries, and tests
that exercise consequential decisions. Follow only surfaces capable of changing
the requested business meaning. Technical directories help locate evidence;
their number and shape do not prescribe the business partition.

For each supported scenario, record its responsible owner and decisive source.
A compact table is sufficient: `scenario or lifecycle responsibility -> owner ->
source -> mapped concept/flow or reason omitted`. Use explicit collaborator,
implementation-detail or unresolved dispositions when those explain the result.
An omitted scenario needs such a reason; a node already drawn is not evidence
that the supported responsibility is complete.

Completeness means that a reader can find the important supported outcomes,
rules and lifecycle changes under the right owner. Several equivalent HTTP,
event or tool entries may share a single scenario and multiple anchors. Create a
separate scenario or operation when it has independently meaningful decisions
or outcomes. Method counts, generic CRUD lists and one flow per endpoint are not
completion measures. A project map accounts for its evidenced responsibilities;
a local request finishes at its relevant collaborator contracts.

## Challenge Cohesion And Ownership

Use the following questions on the provisional partition before encoding it:

| Possible defect | Evidence that decides the correction |
| --- | --- |
| Too broad | Can two groups deliver separately meaningful outcomes and change their rules or authoritative state for different reasons? Give each an owner and retain their collaboration. |
| Too fragmented | Do the fragments establish, change or end the same promised result under the same rules and lifecycle? Keep them together as capabilities/scenarios; use source anchors for technical layers. |
| Incomplete | Does an independently found entry, state transition, configuration or exit path have meaningful behavior with no represented owner? Include it at the right granularity, or identify the evidence still missing. |
| Misplaced | Is a concept nested under its caller, consumer or source directory even though another responsibility decides its meaning? Move containment to that owner and express the usage as a relation. |

Treat these as evidence tests, not requirements for a fixed number of domains.
One area may have many scenarios; many callers may share one action. A shared
record has one primary business owner even when other areas read or write it.
Determine ownership from the rules and lifecycle authority, and represent each
confirmed writer's collaboration explicitly. Shared identity follows business
meaning: one physical table can support distinct responsibility-specific
concepts, while equivalent concepts share one identity across callers.

Shared technical capabilities can be independently meaningful. For example, a
reusable execution system may own definition/instance separation, cancellation,
resumption and completion contracts across several products. Represent that
supported responsibility at its own level when relevant. An adapter, conversion
helper or queue wrapper usually supplies evidence behind another operation;
its callable methods alone do not establish a new business area. Product
configuration belongs to the result it configures; generic execution lifecycle
belongs to the execution responsibility. Inspect who owns each decision.

## Preserve The Repository Boundary

Distinguish business ownership from where a call is made. For a remote parser,
commerce service or third-party channel, map the local integration responsibility
and the evidenced interface or external collaborator. State external ownership
in its name, summary or notes and link the relevant contract anchors. Expand
that collaborator's internal business only when it belongs to the requested
scope and current evidence supports it. An interface can be shown without
inventing an external domain or an internal implementation.

A local orchestration flow can reference independently owned actions to explain
an end-to-end result. Each concept keeps its owner; flow participation does not
transfer containment. Preserve separate owners when a business process spans
repositories, and state which part the current repository actually implements.

## Decide And Stop

Choose the partition when each retained owner has a source-supported promise
and decision/state responsibility, important supported scenarios have an owner,
and dependencies are expressed at their evidenced boundaries. Then translate
that partition into the existing domain/capability/scenario model and owning
files. Preserve stable IDs when identity remains the same.

When uncertainty would change ownership, retain it explicitly and continue only
the supported portion. Finish a local investigation when the task's behavior,
owner and necessary collaborator contracts are established. Complete map work
when source-to-map coverage explains the requested responsibility and the
boundary challenge reveals no material omission or misplaced ownership. Schema
validity and a readable diagram are separate checks; neither proves that this
business partition is correct.
