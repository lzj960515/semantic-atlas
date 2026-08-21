# Semantic Atlas Documentation Index

This index routes product, architecture, contract, and evaluation questions to
their authoritative pages. Current implementation details remain verifiable in
source and tests.

## Product and learning model

- [Product contract](product-contract.md): product boundary, responsibility
  split, lifecycle, storage, and release gates.
- [Continuous business learning](architecture/continuous-business-learning.md):
  how business knowledge grows during real work, how provisional roots evolve,
  how hierarchy reparenting remains safe, and how one graph projects into
  semantically zoomable world and focused views.

## Architecture

- [CodeGraph backend](architecture/codegraph-backend.md): ownership and
  consistency boundaries between durable Atlas knowledge and disposable
  structural projections.
- [Desktop Web viewer](architecture/web-viewer.md): the human-facing read-only
  browser, primary `main`/`master` repository scope, application boundary, and
  desktop information architecture.
- [Semantic Atlas overview mind map](mindmaps/semantic-atlas-overview.png):
  visual overview; editable sources are available in the same directory.

## Public contracts

- [Graph model](contracts/graph-model.md): node, relation, evidence, certainty,
  validity, hierarchy, and traversal semantics.
- [GraphPatch v1](contracts/graph-patch-v1.md): atomic business-knowledge write
  contract.
- [CLI v1](contracts/cli-v1.md): deterministic commands, envelopes, warnings,
  and exit codes.
- [HTTP API v1](contracts/http-api-v1.md): loopback GET endpoints used by the
  bundled desktop Web viewer.
- [Insights v1](contracts/insights-v1.md): local product signals, explicit
  feedback, triage, storage boundary, and interpretation.

## Evaluation

- [Evaluation protocol](evaluation.md): fixed Fresh Agent comparison and
  evidence requirements.

## Maintenance

- [Knowledge-base scope and rules](README.md)
- [Knowledge maintenance log](log.md)
