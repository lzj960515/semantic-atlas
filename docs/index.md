# Semantic Atlas Documentation

This index routes product, implementation, and evaluation questions to their
authoritative pages. The queryable map, renderer, a package-managed unified
business Agent Skill, managed setup, observations, reconciliation, and
public release are implemented.
Target-repository sharing and longitudinal real-use acceptance remain separate
verified gates.

## Product

- [Product contract](product-contract.md): why the product exists, who uses it,
  what the first release contains, and how completion is judged.
- [Architecture](architecture.md): stable responsibilities, lifecycle,
  dependency direction, collaboration model, and failure semantics.
- [Map format](map-format.md): tracked graph documents, concepts, relations,
  business flows, anchors, validation, and query projections.
- [Accuracy observations](observations.md): task, independent-review, and
  maintenance evidence schemas, immutable local persistence, replay, privacy,
  derived summaries, and read-only actionable candidate reports.
- [Evaluation](evaluation.md): real-task accuracy, stale-map recovery, code
  quality, and human-intervention evidence.
- [Delivery plan](delivery-plan.md): integrated initial slices and the ordered,
  separately verified release and real-use gates.

## Product Proposals

- [分层业务图与只读 Viewer 方案](proposals/2026-11-19-layered-business-viewer.md)：
  记录流程图阅读器重写与统一 Skill：总览和细图均为显式流程，业务内容仅由 AI 编辑。
  现役契约以上述 Product 页面为准。

## Maintenance

- [Maintenance records](changes/README.md): durable changes to product knowledge,
  historical records, and the rules for independent documentation updates.
- [订单业务示例](../examples/订单管理/README.md)：逐层进入、备注和返回的本地演示。
- [Commerce example](../examples/commerce.yaml): illustrative map data only; it
  does not define the normative schema independently of `map-format.md`.
