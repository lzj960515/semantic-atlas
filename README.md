# Semantic Atlas

[![CI](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml/badge.svg)](https://github.com/lzj960515/semantic-atlas/actions/workflows/ci.yml)

Semantic Atlas gives coding agents a compact map of the business before they
change the code. A repository describes stable domains, capabilities,
operations, data, rules, interfaces, and their relationships in tracked YAML.
The CLI validates that map, returns a small neighborhood for investigation, and
renders the same graph for people.

The map is deliberately advisory. It helps an agent enter through the right
business boundary; current source, tests, tracked product documents, and
required runtime evidence still decide what the system does now.

## Install

Semantic Atlas requires Node.js 24.

```bash
npm install --global semantic-atlas
semantic-atlas setup
semantic-atlas --version
```

`setup` installs the package's exact engineering and maintenance Skills under
`~/.agents/skills/`. Repeating it verifies the installed payloads, repairs a
modified managed copy, and upgrades a recognized Semantic Atlas v0.4 Skill. It
refuses to replace an unrelated same-named directory.

## Upgrade

```bash
semantic-atlas upgrade
```

`upgrade` resolves npm's current stable version, installs that exact package,
verifies the installed CLI identity, and asks the new CLI to synchronize both
managed Skills. The executable and Skills therefore move as one versioned
product.

## Add A Business Map

A target repository owns only its Git-tracked map documents:

```text
docs/business-map/*.yaml
```

Start with one file per stable business domain:

```yaml
schemaVersion: 1
map:
  id: commerce
  title: Commerce
  summary: Customer-facing product discovery and purchase.

nodes:
  - id: commerce
    kind: domain
    name: Commerce
    summary: Customer-facing product discovery and purchase.
    aliases: []
    anchors:
      - kind: directory
        value: src/commerce
        description: Likely source entry point for Commerce behavior.

relations: []
```

The [map format](docs/map-format.md) defines supported concepts, relations,
anchors, validation rules, and lookup behavior.

## Query And Render

```bash
semantic-atlas validate --repo /path/to/repository
semantic-atlas context "Checkout" --repo /path/to/repository
semantic-atlas render --repo /path/to/repository --output ./business-map.html
```

`validate` checks every map document as one graph. `context` returns the
selected concept, containment, direct incoming and outgoing relationships,
related concepts, and source-navigation anchors in a versioned JSON envelope.
`render` produces deterministic static HTML from that same normalized graph.

## Evidence Order

For a business-changing engineering task:

1. Query the smallest useful map neighborhood.
2. Treat concepts, relations, summaries, and anchors as investigation leads.
3. Confirm every change-controlling claim in current source and tests.
4. Use tracked product documents for durable intent and runtime evidence for
   state-dependent behavior.
5. Let current evidence override missing, stale, or contradicted map knowledge.
6. Implement and verify through the repository's normal engineering workflow.

The final engineering conclusion is expected to be more accurate than the map
that helped locate it.

## Agent Skills

`semantic-atlas setup` installs two package-owned Skills:

- `semantic-atlas` guides business-changing work from a bounded context query
  into current-source confirmation.
- `semantic-atlas-maintenance` reviews retained candidates for one business
  domain and prepares a normal reviewed YAML change.

Target repositories do not copy these Skills. They share only their business
maps through Git.

## Accuracy Observations

Normal engineering work can retain task evidence and independent review
evidence without changing the business map:

```bash
semantic-atlas observe task --stdin --repo /path/to/repository
semantic-atlas observe review --stdin --repo /path/to/repository
semantic-atlas insights summary --repo /path/to/repository --period 4w
```

A task observation records queries, current-evidence classifications, candidate
map corrections, and explicit human corrections. It never grades its own
accuracy. An independent review observation owns correctness, impact,
required-rework, and map-regression judgments. IDs are immutable: an exact
replay is idempotent and changed content conflicts.

See [accuracy observations](docs/observations.md) for the schemas and evidence
semantics.

## Reconciliation

```bash
semantic-atlas reconcile candidates --repo /path/to/repository
```

The command groups retained candidates by explicit business-domain ownership
while preserving each origin, evidence disposition, and linked independent
review. It is read-only. The maintenance Skill then confirms one domain against
current evidence and submits any accepted map correction through an ordinary
Git diff and independent review.

## Local Data And Privacy

Business maps stay in the target repository. Accuracy observations stay in
immutable JSON files under a hashed user-local repository partition:

```text
~/.semantic-atlas/observations/v1/repositories/<repository-id>/
```

Observation files contain neither repository paths nor remote URLs. Semantic
Atlas has no remote observation service, account, telemetry upload, persistent
graph database, or automatic source/map mutation. `setup` and observation
commands do not add files to a target repository; `render` writes only the
explicitly requested local output.

## Development

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

The release-candidate gate runs contract and source tests, typecheck, build,
rendering checks, packed-tarball privacy checks, an anonymous installed-product
flow, a real public v0.4-to-v1 transition rehearsal, package dry-run, and Git
diff validation.

Publication is a separate operation. After the repository's immutable-release
setting is enabled, a non-prerelease GitHub Release for an annotated version tag
triggers the protected npm workflow. The workflow verifies the specific Release
is immutable in a read-only job before any tag checkout or npm credential
boundary. Only then does the protected publish job repeat the candidate gate
and publish with npm provenance.

## Documentation

- [Product contract](docs/product-contract.md)
- [Architecture](docs/architecture.md)
- [Map format](docs/map-format.md)
- [Accuracy observations](docs/observations.md)
- [Evaluation](docs/evaluation.md)

## License

[MIT](LICENSE)
