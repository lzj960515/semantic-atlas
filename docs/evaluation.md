# Semantic Atlas Evaluation

This page defines how the initial product proves that an advisory business map
improves engineering accuracy and reduces routine human supervision. It applies
to the CLI, renderer, Agent Skill, and real-project evaluation.

**Status: accepted initial protocol; controlled relationship fixtures and the
private real-project evaluation pass. Business-flow behavior is covered by the
current source candidate and still needs longitudinal real-task evidence.**

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

## 当前持续建图试用边界

2026-11-20 的新上下文私有项目试用按三个源码分块逐步保存 3、6、9 条身份业务流程。
后读到的消费者与管理入口证据促使 AI 修改已经写出的凭据交付边界和账户来源，而非
只追加流程。最终 14 个概念、25 条关系、9 条流程的校验、业务词搜索、指定流程读取、
概念读取和渲染通过。另从父工作空间查询子仓库流程及真实源码锚点，确认项目结果隔离。

这次结果证明该局部任务实际执行了渐进落图、证据驱动回改和直接业务定位。它不证明
全库覆盖、长期稳定收益或所有业务的表达质量；本次生成图的浏览器阅读检查因工具问题
尚未完成。首次全库重建和日常工程中的后续证据应分别记录。

同日修订画图指导后，另一次新上下文试用只接收多业务样本和候选 Skill 的路径，自行
调查订单、履约、销售核算并生成 3 份文件、6 条具体流程。它保留独立业务入口与共享
下单通知，没有增加统一接收／选择／返回总流程，也没有把履约和销售登记串行化。
文件校验、业务查询、渲染和六图浏览器阅读通过；源码缺少持久化、投递调用方和日报
日期筛选的部分被明确记为证据缺口。词面搜索“取消订单”仍把收入汇总排在取消流程
之前，AI 需按业务含义选择候选；这次试用不证明语义搜索或长期可靠性。

随后用户进一步明确：所有项目的资料都应有能解释整体业务的总览，业务缺口还应驱动
跨仓库调查。上述六条独立流程的试用只证明具体路径的表达与核实，不再作为项目整体
建图已完成的证据。后续验收还需检查能否从总览讲清全貌、再进入相关细图，以及可访问
的前端／其他服务证据是否因仓库边界被遗漏；不要求固定图数、层数或虚构共同起止。

按这一指导进行的新上下文整理试用，把已有六个接口级入口组织为购买交接、客户取消、
财务报表三个入口，通过购买旅程展开独立的仓库和财务处理，保留原业务所有者。4 份
文件、9 条流程的校验、渲染与导航检查通过，未做浏览器阅读验证。该试用确认当时的
流程格式与阅读器无法在同图表达多入口、事件扇出和跨流程状态联系，仍需分图与说明。
这证明指导能促使 AI 聚合业务，也暴露软件能力缺口，不能作为完整视觉表达已达标的
证据。该限制随后成为本轮软件改动的依据：多入口列表与动作多后继由同一图模型表达，
不要求编写者扭曲业务来适应格式。新版本的实际图与阅读验证分别记录。

4.0.0 的新上下文试用从原始材料自行建立一张完整总览与四张规则细图；总览保留下单、
取消、收入报告三个入口和已下单事件的两个独立消费者。4 文件／5 流程的校验、搜索、
上下层直读、上下文与渲染通过，副本源码未变。该样本没有运行持久化、事件接线或日期
筛选；这些缺口均明确保留，试用图本身未做浏览器阅读。

软件的实际浏览另用公开订单样例核对两入口与并行后继，并在私有项目抽查整体总览、
多入口触发、细图、返回和菜单选择，页面错误为空。161 项检查及完整发布源门禁通过，
源码与业务图分别独立审查。以上不代表所有业务或屏幕尺寸都已运行验收。

## Accuracy Dimensions

### Business-boundary accuracy

The answer identifies the capability, scenario, operation, data, invariant, and
interface boundaries required by the task. Repository folders or framework
components do not replace business ownership. Evaluate cohesion, lifecycle
coverage and external responsibility limits against independently discovered
source entry points and state/rule owners. A partition fails when it absorbs a
collaborator, splits one responsibility into technical pieces, omits supported
business behavior or places it under another owner, even when graph validation
passes.

### Root-cause accuracy

The agent distinguishes where a symptom appears from the business behavior that
causes it. It follows an upstream relation when the fix belongs outside the
initially named module.

### Impact accuracy

The agent identifies required incoming and outgoing collaborators, affected
data, invariants, interfaces, tests, and asynchronous consumers. It avoids
unsupported expansion into unrelated areas.

### Business-path accuracy

For a task that intersects a retained flow, the agent identifies the affected
actions, decisions, labeled branches, and outcomes. A refactor preserves every
confirmed branch that remains part of the product behavior, while a deliberate
business change produces an explicit flow-maintenance decision.

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
9. A branch-sensitive refactor where a broad implementation still appears to
   work but violates a retained business decision or outcome.

Cases use real repository structure and behavior. Private business facts stay
inside the private evaluation workspace and are summarized publicly only in
de-identified form.

## Controlled Skill Fixtures

The public repository contains a de-identified miniature engineering system at
`tests/fixtures/agent-skill/repository`. Its case contract covers an upstream
root cause, an interface with a downstream consumer, missing map knowledge, an
ambiguous term, a node without anchors, a stale anchor, and a relation that
current source contradicts. The controlled Commerce map also contains one
authorization flow so contract tests prove that `context` returns relevant
scenario paths without treating them as current-source truth.

Automated checks prove that each initial selector produces the intended public
CLI outcome and that every acceptance oracle points to present source, test, or
tracked product evidence. Fresh Agent runs then judge both mapped and mapless
workflow behavior: the Agent must activate from business task meaning, use the
bounded map outcome, reach the current-evidence conclusion, and report one
same-branch business-flow updates separately; observation tools are optional. Mechanical controls must end without
manufactured business knowledge. These fixtures protect the Skill contract;
they do not replace the private real-project paired evaluation defined in this
page.

## Business Ownership Regression

`tests/fixtures/map-authoring/evals.json` retains the natural requests and
artifact criteria from the repeated issue #8 failure. One fixture has separate
order, fulfillment and revenue responsibilities within technical source files;
the control has three technical directories serving one cancellation business.
A maintenance case starts from a valid order map and asks for the newly
implemented delivery behavior to be incorporated.
A local library correction case starts with retrieval misplaced under its chat
consumer. Source independently exposes material intake, revision, asynchronous
extraction, withdrawal and removal, plus unrelated neighboring features. It
checks complete responsibility coverage, correct external ownership and a
clean stop at the requested business boundary rather than a node or file count.
Execution receives only the request and source fixture, while expected results
remain with the evaluator. Use the bundled unified business Skill
in fresh contexts, with equivalent baseline and candidate environments.

Acceptance checks actual business-owned files, shared concept identity,
relation/flow ownership, complete-graph validation and selectable Viewer domains.
A schema-valid oversized project domain fails the multi-business case; artificial
HTTP/rules/storage domains fail the small-project control. A later update must
preserve the valid order identities while establishing the independent
fulfillment owner. Direct authoring must proceed without fabricated retained
candidates and report actual Git review and integration status. Static Skill contract tests and the runnable authoring
example protect packaging and format coherence; only Fresh Agent execution
provides evidence about autonomous partitioning behavior.

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
- related business flows and affected paths;
- map statements used as investigation leads;
- current files, tests, documents, or runtime evidence opened;
- confirmed and contradicted map statements;
- identified business boundary and root cause;
- required and unrelated impact surfaces;
- implementation or proposed change;
- verification performed;
- same-branch flow update and its correspondence with the final code;
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
- mapped and mapless business tasks update changed business meaning alongside code, while a
  mechanical control produces no business-maintenance work;
- required business boundaries and impact surfaces are identified in every
  case;
- each relevant flow is traced before and after the task, with confirmed
  branches preserved or classified for maintenance;
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
