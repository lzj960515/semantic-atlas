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

## AI 查询验收

以真实业务问题检查首次查询能否支持下一步调查：命中有当前维护位置，相关概念有
源码入口、规则与备注，关系类型和业务说明能解释关联原因，流程引用能定位可能需要
核对的图与步骤。保留 YAML 作为持久来源；查询仅在当前调用派生摘要与位置。

对同一候选分别检查概念搜索、流程搜索、`context` 和指定 `flows`：

- 搜索最多列五个候选，各自有维护位置；摘要只属于 `contextFor` 的第一候选，不把
  其他候选的邻域混入。调用者选择其他业务时，应按 ID 取得其资料，而非默认第一项。
- `concepts` 按 ID 唯一提供详情；`context.selected` 不重复放入概念表。关系和步骤
  使用 ID 引用，完整本层步骤只在明确读取流程时展开；普通流程摘要保留引用位置。
- 关联覆盖直接关系，以及共享数据、接口、规则的其他已记录使用方；无关业务不因
  普通动作邻接而递归加入。`scope: "recorded"` 不得被当作影响范围已经完整的证明。
- YAML 行列能定位当前声明，并在文件移动声明后跟随变化。代码符号仍是文件与声明
  提示，缺失路径可识别，不以猜测的行号或 `located` 证明业务正确性。
- 查询使用紧凑 JSON，`repository` 只含 `root`；不重复全库地图目录。概念、业务规则、
  关系原因、维护位置和必要入口仍完整可得，不能只以响应变短证明查询质量。

CLI 断言与代表性实际调用证明字段、定位和扩展契约。还需在新上下文中给予自然业务
请求，让 AI 自行选入口、打开当前源码、判断关联与需同步的图，再由独立验收核实
结论。字段齐全不证明 AI 已正确使用；未执行新上下文或长期试用时，明确保留该边界。
跨项目线索需要分别查询和查源码，不以本轮结果证明已建立跨仓关系模型。

2026-11-24 当前源码候选完成了一次新上下文的真实业务调查。执行者只接收自然业务
请求，自行使用 `search --flows`、`flows`、`context` 与当前源码，找出请求所涉的既有
复用路径，并区分需要核实的协作与只有业务规则变化时才需维护的关联图。搜索把较宽
的场景排在更贴合问题的细图之前；执行者按业务含义选择了后一个候选，没有把第一
候选的 `contextFor` 摘要当作已确认目标。维护行号与文件绑定符号帮助定位资料和
实现，地图中未记录的关系仍通过源码补齐。

同一候选的完整 `release:verify` 通过，包含 173 项测试及构建、渲染、打包与安装后
产品验证。自动检查证明当前字段与产品回归，新上下文调查证明该任务中实际发生了
自主候选选择、源码核实与有边界的维护判断。该任务没有实施业务修改，不能据此证明
图更新后的实际效果、所有查询的排序质量或长期调查收益；一次成功也不构成稳定性
统计结论。私有业务资料与原始运行证据保留在所属任务中，公共记录只保留脱敏结果。

## 讲解质量验收

先读取实际顶层目录及各流程源文件，核对每个入口服务谁、为何发生、对象怎样改变、
结果怎样使用。独立接口、管理角色或返回记录不是独立顶层业务的充分理由。相关主线
应完整，多个独立业务可以平级，不强制全项目父图，也不以图数、节点数或层数判断质量。

作者写完一个业务分块后主动自审，新证据改变理解时立即重构；交付前再从头检查整组
资料。直接检查 `startsAt`、`steps` 与 `transitions` 中的孤立节点、弱连通分量、分支与结果去向。
多分量只是诊断线索：补清真实联系或调整图的范围，不能为连通而编造先后。逐句检查
主体、动作、对象、条件和结果，用自然中文讲不清就重写；再按当前业务代码核实事实。

检查指导能否独立生效时，让新上下文作者只接收普通用户的自然业务请求与必要定位
信息，从 Skill 读取方法。具体画法、预期分组、节点、图数与验收答案留在评估端。
验收者独立审查完整产物与必要源码，不代画后声称指导成功。需要返修时保留初稿问题、
指导变化与作者后续修正的区别；不只核对用户圈出的几个节点。

逻辑主审基于流程源文件，网页或导出核对渲染布局、线条、文本显示及必要导航，已有
证据仍有效时复用，不要求每次逐页操作。格式、业务事实、语义表达和呈现分别核验。
独立任务通过只证明该次行为，不推断所有业务的长期效果。私有业务文件与原始证据
保留在所属仓库，公共产品只保留脱敏方法与结果。

2026-11-23 的一次私有持续监控业务试用，作者的新上下文仅接收一条简短业务请求，
从已安装的候选 Skill 获取指导，自行核实前端和后端并重整主图。主要过程、重要入口
和结果使用已能在同图读到。初稿仍有实现术语暴露、详图跳回已有概述的问题；独立
验收分别反馈后，由原作者收口文案并整理跳转，验收者没有编辑业务图。整图结构、
代表性跳转与实际讲解检查通过。该结果证明本次指导改善了主线表达，也保留了需要
人工验收修正的事实。现有自动布局仍使大图完整缩放时文字较小、跨入口连线较长，
当前格式缺少同图区域；没有将此试用描述为阅读器已全面达标。

该次试用随后由用户重新打开项目链接发现范围遗漏：子业务主图已经更新，默认项目
“业务全貌”仍是原有两格封面，验收停在选中的子图而漏掉了首次进入路径。因此前述
结果只证明该子业务的改善，不能作为项目入口已达标的证据。后续整体验收须从实际
交付链接和默认图开始，再核对下层与返回，保留这次用户纠正记录。

随后用另一名新上下文作者检查项目整体，只给出一条自然建图请求。作者自行读取已
安装的指导并核实跨项目证据，将默认封面展开为主要业务过程。首稿仍把跨多次操作的
旅程断开，并把未成功的请求读取接到可用结果；独立验收反馈后，由作者修正条件、
交接、业务用语及来源路径。连接指导也据此补充：业务旅程不限于一次接口调用，
多个真实入口可以带已有状态进入后续，纯资料依赖仍不补成执行箭头。此结果包含
验收反馈后的返修，不能作为零干预的独立成功。

最终从原交付地址重新加载，确认默认图已更新；结构、代表性源码与来源文件、从主图
进入生成规则及返回、页面错误检查通过。没有由验收者编辑业务图，也没有逐张重验
全部旧细图。当前缺少同图业务分区和资料依赖的独立表达，窄面板整图缩放仍不能逐字
阅读，长距离连接和留白仍影响讲解。内容改善与这些阅读器限制分别保留，不据此宣称
项目整体阅读体验已经完全达标。

用户随后指出了更根本的错误：多个独立业务被放进同一张默认图，并无必要存在一个
覆盖项目的“业务全貌”。当时仅将主要问题归为缺少分区与布局能力，判断不成立。
现有 `FlowNavigation.roots` 本来支持多个平级流程；指导与验收过度要求项目总图，
才导致这次错误合并。上述整体试用按业务组织失败记录，不能据结构和跳转检查视为
方向通过。当前指导从业务边界重新编写，取消强制项目总图，另以新上下文检查重整
结果；阅读器是否仍有必要缺口，以纠正边界后的实际证据判断。

最新一次新上下文整理移除了项目拼盘与重复封面，将独立业务安排为平级图。过程中
独立目录检查仍发现许多接口级条目；反馈后作者保留可查询的概念、规则与源码锚点，
移除没有独立阅读价值的透传、兼容和历史维护图，并把生命周期环节整理回相应业务。
指导据此明确保留知识不等于必须保留旧图。实际阅读又发现一张恢复详图暴露实现枚举，
由作者改为中文业务状态，保留其真实失败和恢复边界。这次试用包含上述验收反馈。

从原链接重新打开，默认展示一张具体业务图；平级选择、局部规则进入与返回、页面
错误检查通过。代表性业务搜索和概念查询仍能直达具体源码方法，图结构、文档链接、
既有Skill资源检查和无关文件保护核验通过。验收者没有代画，没有修改运行代码或
数据字段；多个顶层图由既有模型与导航承载。未逐张重验所有旧细图，也不以目录图数
证明边界正确；本次结果支持当前组织方式的改善，后续业务仍按实际内容判断。

2026-11-24，用户重新检查上述产物，发现多项内部操作仍直接成为顶层入口，没有解释
它们服务谁、结果如何使用；主图又混入多段没有交代联系的局部流程。节点措辞把内部
处理词拼在一起，业务人员难以理解。前轮代表性检查通过不足以证明整体交付达标，
本次按业务组织与表达验收失败记录，不能继续把旧结论当作全部业务图已完成的证据。

直接分析原流程源文件即可识别多块不相连的内容。对照业务代码还发现权限和配置生效
时点的误述，说明结构诊断不能代替业务核实。原指导已有画后检查要求；此次失误同时
暴露了顶层业务判定含糊和验收执行不足。候选修订将业务目标、源文件自审、连通片的
逐项解释、自然语言复述与独立语义审查合入原方法。

随后以一条普通业务请求启动新上下文作者，只提供候选 Skill 与必要仓库环境。首块
自审后仍只移除零碎入口，必要运营参与只在备注中点名；独立审查未通过。作者重新
核实实际管理页面及客户使用方，补回接入、积分和后续使用的联系，并重审其余业务。
此过程包含验收反馈，不能当成零干预的独立成功。

进一步直接审查整组流程源文件与业务代码，发现共用结束节点把单分支跳过误述为整轮
停止、配置权限与邮件触发范围混写，以及账期起点、采购资格和授权有效性被误述。
另一个上下文通读所有可见文字和继承备注，发现实现对象及参数直接进入正文。原作者
负责返修，验收者未代画。复核还发现，删去细图后有必要时间规则只剩在不可见的概念
摘要中，以及本店现成分析和共享分析被错误合为同一保存路径；这些问题由作者继续
修正，文件编写指导也补清了实际可见字段和裁图后的规则保留责任。

最终候选的顶层目标、全组可见文字、已报告问题及关键源码路径复核通过，格式、引用、
代表性业务查询和渲染检查通过。结构诊断帮助发现不相连片段，未被用作业务质量阈值；
本轮没有新增正式检查命令、持久结构或业务运行代码。没有运行真实供应商或逐项验证
全部辅助接口，较大流程仍需要缩放阅读。此结果证明本次产物在包含独立反馈的返修后
满足既定范围，不能证明作者初稿可靠、指导零干预成功或长期稳定收益。发布与安装
状态仍单独报告。

同日针对节点文字与详情继续改进：标题与可见补充采用写作预算，具体动作和决定路径
的条件保持可见，清单与解释放既有备注。阅读器根据实际备注显示信息标识。原作者在
已有上下文中定向调整一组连接流程，验收核对实际业务代码与文字分工；这次没有再次
运行新的自然任务，不能推断指导已能独立稳定约束所有节点。既有30项相关检查、构建
与独立审查通过；实际页面检查了说明发现、正文打开、子流程进入与返回和标识不重叠。
较大图整体适应后仍需放大阅读，信息标识不能消除这个限制。

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

后续曾将整体理解要求落实为“各项目都要有总览”；这项组织要求已按上节用户纠正
取消。上述六条流程只证明其覆盖的具体路径，项目级完成还需检查业务边界与指定范围
是否覆盖、各图是否可讲解，以及可访问的前端／其他服务证据是否被仓库边界遗漏。

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
