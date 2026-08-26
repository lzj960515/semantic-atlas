# Semantic Atlas Next Documentation

This index routes product, implementation, and evaluation questions to their
authoritative pages. The documentation baseline, queryable map, rendering, and
repository Agent Skill are implemented; private real-task evaluation remains.

## Product

- [Product contract](product-contract.md): why the product exists, who uses it,
  what the first release contains, and how completion is judged.
- [Architecture](architecture.md): stable responsibilities, lifecycle,
  dependency direction, collaboration model, and failure semantics.
- [Map format](map-format.md): tracked graph documents, concepts, relations,
  anchors, validation, and query projections.
- [Evaluation](evaluation.md): real-task accuracy, stale-map recovery, code
  quality, and human-intervention evidence.
- [Delivery plan](delivery-plan.md): ordered vertical slices, dependencies, and
  observable acceptance for the initial product.

## Maintenance

- [Documentation log](log.md): durable changes to product knowledge and their
  reasons.
- [Commerce example](../examples/commerce.yaml): illustrative map data only; it
  does not define the normative schema independently of `map-format.md`.
