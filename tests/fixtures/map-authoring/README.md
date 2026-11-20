# Business map authoring Agent acceptance

This suite protects issue #8. Run `evals.json` through the skill-creator
`codex_skill_eval.py` workflow in independent contexts. Give the execution Agent
only its natural prompt, a copy of the named fixture, the bundled understanding
and maintenance Skills, and the candidate CLI. Keep this suite and all grading
criteria outside the execution workspace. Cases 1 and 2 start without maps; case 3 has a valid order map and newly
implemented delivery behavior. All fixtures have no retained observations. Use the same CLI, model, tool configuration and fixture for baseline
and candidate; retain the actual versions and transcripts.

Grade artifact behavior, not particular IDs, filenames, prose, or command counts.
Check each expectation against source, all generated YAML and the actual Viewer
model. Treat the one-project-domain/one-large-file result from the reported
failure as a failure of case 1 even when schema validation passes. Equally,
partitioning case 2 by HTTP/rules/storage fails despite having several files.
Case 3 checks ongoing maintenance: appending all delivery concepts beneath the
existing orders domain fails even when validation passes. Existing valid order
IDs and behavior must remain intact while fulfillment obtains its own business
owner. These controls ensure that file count alone cannot pass the suite.

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

画法依据 2026-11-20 用户纠正，以真实业务含义和阅读结果评分。项目初始化应有可讲清
整体业务的一张或几张总览，相关细图能按真实环节深入；零散接口的目录不算项目全貌。
简单项目的一张完整业务图可以承担这项作用，不预设图数、层数、统一骨架或选择问题。
调查沿业务缺口查找前端及其他项目，仓库边界不构成忽略可访问证据的理由。
检查节点与连线能否解释具体业务事实；有连线的分类目录、空泛的
请求处理步骤、独立业务被伪造为串行，均未满足画图目标。案例 1 的下单事件分别交给
配送与销售入账，两者不互为前置；顾客取消订单和财务查询日收入分别按真实入口执行。
按源码检查这些路径，不为单一根增加共同触发或汇合。具体且有依据的接收、判断和返回
仍是合理业务步骤，不能按词语本身判错。

Case 4 captures a different failure: a map created from a chat journey includes
only retrieval and puts it under the caller. Current source has note/file intake,
revision and asynchronous extraction, withdrawal/removal, and multiple consumer
entries. Grade coverage from these source responsibilities, allowing aggregated
scenarios and multiple anchors. The local request must also stop at assistant
and extraction contracts, leaving unrelated subscription/digest behavior alone.
A map that merely adds more files, enumerates CRUD methods, or claims the remote
parser as library-owned fails its boundary criteria. Schema validation alone
cannot evaluate these results. Preserve the valid assistant identities and
shared retrieval identity during correction.
