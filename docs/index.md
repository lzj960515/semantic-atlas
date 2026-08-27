# Semantic Atlas Next Documentation

This index routes product, implementation, and evaluation questions to their
authoritative pages. The initial queryable map, renderer, repository Agent
Skill, private real-task evaluation, and local-product acceptance are integrated
at `decac0c`. The approved v1 rollout remains divided into separately verified
setup, observation, release, target-repository, and real-use gates.

## Product

- [Product contract](product-contract.md): why the product exists, who uses it,
  what the first release contains, and how completion is judged.
- [Architecture](architecture.md): stable responsibilities, lifecycle,
  dependency direction, collaboration model, and failure semantics.
- [Map format](map-format.md): tracked graph documents, concepts, relations,
  anchors, validation, and query projections.
- [Evaluation](evaluation.md): real-task accuracy, stale-map recovery, code
  quality, and human-intervention evidence.
- [Delivery plan](delivery-plan.md): integrated initial slices and the ordered,
  separately verified v1 delivery gates.

## Maintenance

- [Documentation log](log.md): durable changes to product knowledge and their
  reasons.
- [Commerce example](../examples/commerce.yaml): illustrative map data only; it
  does not define the normative schema independently of `map-format.md`.
