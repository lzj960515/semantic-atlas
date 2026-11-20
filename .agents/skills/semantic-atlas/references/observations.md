# 观察记录契约

这是可选的既有记录契约，仅在用户明确要求准确性记录，或需要读取和处理已有历史观察时使用。正常工程直接在同一分支同步代码与相关流程，不要求生成观察、候选或等待主分支后维护。

需要写入时，`id` 生成一次，`recordedAt` 保持稳定；提交结果不确定时重试完全相同的文档。现有历史数据保持原样，不因工作流调整自动清理或迁移。

## 任务观察

任务 Agent 记录调查证据，不填写正确性、返工或图导致回归的审查评分。当前任务观察使用 `schemaVersion: 2`：

```json
{
  "schemaVersion": 2,
  "id": "task-observation-unique-id",
  "recordedAt": "2026-08-27T03:00:00.000Z",
  "task": {
    "taskId": "engineering-task-id",
    "runId": "engineering-run-id"
  },
  "map": {
    "queries": [
      {
        "selector": "提交订单",
        "outcome": "context",
        "selectedConceptIds": ["commerce.orders.place-order"]
      }
    ],
    "dispositions": [
      {
        "status": "stale",
        "summary": "当前源码位置已变化，资料中的业务含义保持稳定。",
        "evidence": [
          {
            "kind": "source",
            "reference": "src/orders/place-order.ts"
          }
        ]
      }
    ]
  },
  "mapUpdateCandidates": [
    {
      "businessDomainId": "commerce",
      "kind": "anchor",
      "disposition": "confirmed",
      "summary": "校准时替换过期的源码锚点。",
      "evidence": [
        {
          "kind": "source",
          "reference": "src/orders/place-order.ts"
        }
      ]
    }
  ]
}
```

查询结果为 `context`、`concept_not_found`、`concept_ambiguous`、`map_not_found` 或 `unavailable`；只有 `context` 包含非空 `selectedConceptIds`。当前证据结论为 `confirmed`、`missing`、`stale`、`contradicted` 或 `unresolved`；证据类型为 `source`、`test`、`document` 或 `runtime`。

每项 `mapUpdateCandidates` 保留稳定 `businessDomainId`。`confirmed` 表示当前证据支持候选，`contradicted` 表示候选替换了被当前证据否定的图中说法，`unresolved` 只作为待核实线索。种类为 `node`、`relation`、`anchor`、`flow`；业务流程的动作、条件或结果改变时用 `flow`，实现内部控制流调整不自动产生候选。

处理历史候选时，保留记录当时的原始判断与独立审查，再核实当前稳定含义。旧版本或不支持的本地观察会明确读取失败，不自动迁移成可行动候选。

用户明确纠正了任务时，可以添加：

```json
{
  "humanCorrection": {
    "summary": "用户纠正了业务边界。",
    "dimensions": ["business_boundary"]
  }
}
```

纠正维度为 `business_boundary`、`upstream_cause`、`impact`、`map_use`。从标准输入提交：

```text
semantic-atlas observe task --stdin --repo <repository-root>
```

首次成功返回 `recorded`；精确重试返回 `idempotent`；同一 ID 修改内容返回 `OBSERVATION_CONFLICT`。失败单独报告，不改变已经验证的工程结果。

## 独立审查观察

独立审查者引用同仓库的任务观察并拥有准确性判断：

```json
{
  "schemaVersion": 1,
  "id": "review-observation-unique-id",
  "recordedAt": "2026-08-27T03:30:00.000Z",
  "taskObservationId": "task-observation-unique-id",
  "review": {
    "taskId": "review-task-id",
    "runId": "review-run-id",
    "verdict": "approved",
    "businessBoundary": "correct",
    "upstreamCause": "correct",
    "impactCompleteness": "complete",
    "requiredRework": false,
    "mapCausedRegression": false
  }
}
```

通过 `semantic-atlas observe review --stdin --repo <repository-root>` 提交。`approved` 不能包含错误维度、需要返工或图导致回归；`changes_requested` 的 `requiredRework` 为 `true`，可记录未通过的维度。

找不到任务观察时，审查结论仍按当前代码与证据给出，单独说明缺少准确性记录关联，不伪造任务来源。候选维护结果另见[候选校准](reconciliation.md)。
