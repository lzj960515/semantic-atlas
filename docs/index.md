# Semantic Atlas Documentation

This index routes product, implementation, and evaluation questions to their
authoritative pages. The queryable map, renderer, package-managed understanding
and maintenance Agent Skills, managed setup, observations, reconciliation, and
public release are implemented.
Target-repository sharing and longitudinal real-use acceptance remain separate
verified gates.

## Product

- [Product contract](product-contract.md): why the product exists, who uses it,
  what the first release contains, and how completion is judged.
- [Architecture](architecture.md): stable responsibilities, lifecycle,
  dependency direction, collaboration model, and failure semantics.
- [Map format](map-format.md): tracked graph documents, concepts, relations,
  anchors, validation, and query projections.
- [Accuracy observations](observations.md): task and independent-review
  evidence schemas, immutable local persistence, replay, privacy, derived
  summaries, and read-only reconciliation candidate reports.
- [Evaluation](evaluation.md): real-task accuracy, stale-map recovery, code
  quality, and human-intervention evidence.
- [Delivery plan](delivery-plan.md): integrated initial slices and the ordered,
  separately verified release and real-use gates.

## Maintenance

- [Documentation log](log.md): durable changes to product knowledge and their
  reasons.
- [Commerce example](../examples/commerce.yaml): illustrative map data only; it
  does not define the normative schema independently of `map-format.md`.
