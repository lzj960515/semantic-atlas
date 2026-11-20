# 候选校准

仅在用户明确要求处理已有历史观察、候选或漂移时读取。它说明旧记录工具的结果契约，不是正常工程的维护流程；新的业务变化在代码分支同步修改流程并一起提交合入，不先创建候选或等主分支后才维护。

使用时先运行 `semantic-atlas reconcile candidates --repo <repository-root>`，读取版本化结果并选择一个业务领域，再按[业务边界](boundary-design.md)核实当前归属。历史候选是调查线索，现有观察不会因流程调整自动修改或删除。

## 读取来源

一组候选按确切领域、种类与摘要分组，保留每条来源的：

- 任务观察 ID、任务／运行身份和从零开始的 `candidateIndex`；
- 该候选的证据与任务时的 `confirmed`、`contradicted`、`unresolved` 判断；
- 地图查询、当前证据分类、用户纠正和所有关联独立审查；
- 重新变成可行动候选时，先前待补证据的维护结论。

任务时的 `confirmed` 说明当时证据支持修正，`contradicted` 说明要替换的图中说法被证据否定，`unresolved` 只保留线索。校准时重新确认稳定含义，不能直接复制任务判断。

## 判断长期价值并分类

未来任务可以独立命名、定位、依赖或修改的业务结果、规则、数据、接口和流程，才进入共享资料。方法、辅助函数、SQL 细节、技术目录、临时迁移和一次运行状态留作实现证据。

产品决定说明长期意图，当前源码和测试证明实现的协作，部署状态通过运行证据确认。来源冲突且无法判定时保持缺口，不代替业务所有者决定规则。

逐条来源选择：

| 状态 | 含义 |
| --- | --- |
| `accepted` | 当前证据支持这项稳定修正 |
| `refined` | 当前证据支持更准确或更小的修正 |
| `discarded` | 属于实现细节、已过时或没有进入共享资料的依据 |
| `unresolved` | 当前证据不足以确定稳定含义 |

正确地丢弃或保留待核实可以没有文件改动。过期锚点在找到当前入口后修正；矛盾关系先核对两端和方向；缺失概念先确认身份与所有者；流程修正先核实动作、判断、分支和结果。`MAP_NOT_FOUND` 时可以从当前证据支持的一个领域开始，不自动扩为全仓库分类。

重复候选保留全部来源，只产生一次 YAML 修改。这些既有候选结果按一个领域的所属文件记账；真实归属调整需要多文件时，按统一 Skill 的直接编写分支组织完整审阅，分别保留候选。单个 `owningMapPath` 不能代表多文件结果。原始观察不修改。

## 审阅与记录结果

文件变更完整校验、实际看图并经独立审查后，按所属仓库的授权合入。直接画改图没有保留来源时，用 Git 审阅和交付证据说明结果，不伪造候选维护观察。

候选维护观察按确切 `taskObservationId` 与 `candidateIndex` 标识来源；摘要相同不能替代身份，跨领域来源也不能混用。只在审查和实际合入完成后提交：

```json
{
  "schemaVersion": 1,
  "id": "maintenance-observation-id",
  "recordedAt": "2026-11-19T08:00:00.000Z",
  "maintenance": {
    "taskId": "maintenance-task-id",
    "runId": "integration-run-id"
  },
  "businessDomainId": "commerce",
  "results": [
    {
      "candidate": {
        "taskObservationId": "task-observation-id",
        "candidateIndex": 0
      },
      "status": "accepted",
      "reason": "当前源码证实这项业务规则。",
      "evidence": [
        { "kind": "source", "reference": "src/orders/place-order.ts" }
      ]
    }
  ],
  "mapChange": {
    "owningMapPath": "docs/business-map/commerce.yaml",
    "mergedCommit": "实际合入提交的完整十六进制编号"
  }
}
```

示例中的提交号必须替换为真实值。`accepted`、`refined` 要求 `mapChange`；全部为 `discarded`、`unresolved` 时省略。每条来源只出现一次，带明确理由和至少一条当前证据。

通过标准输入提交 `semantic-atlas observe maintenance --stdin --repo <repository-root>`。首次成功为 `recorded`，同一完整文档重试为 `idempotent`；ID 相同但内容变化为冲突。合入已成功但观察失败时保留合入结果，用同一文档重试，不能声称这项历史记录已完成校准；该状态不阻断已经验证的代码与流程交付。

最后按需要重读候选结果：`accepted`、`refined`、`discarded` 来源不再可行动；`unresolved` 保留为待新证据，不立即重复处理。`waitingForEvidenceOccurrences` 统计这些来源；相同领域、种类与摘要出现新来源后，再连同旧历史进入行动集合。
