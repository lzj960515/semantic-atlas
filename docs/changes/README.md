# Documentation Maintenance Records

This directory records why durable product knowledge, ownership boundaries, or
documentation navigation changed, and where the supporting evidence lives.
Starting on 2026-09-17, each maintenance task writes its own record so unrelated
branches can contribute without editing the same log. The seven earlier daily
sections are retained as `history` records with their original dates and text.

## Record A Change

1. Update the authoritative page and affected cross-references first, then add
   one record here. Wiki maintenance follows the same workflow.
2. Use `YYYY-MM-DD-topic-task-id.md`: the date is the first recording date, the
   topic is a short English kebab-case name, and the suffix is a task ID or its
   final eight characters. When no task ID is available, generate eight random
   hexadecimal characters. Before merge, update the same file for the same task
   and topic; independent tasks use independent files.
3. Explain the change, reason, evidence, affected pages, and actual verification.
   Use the template below. `ingest` records new source material, `query` records
   reusable investigation results, `revise` records changed conclusions or
   rules, and `lint` records documentation consistency repairs. Keep the full
   business explanation in its authoritative page.
4. When a topic is added, renamed, moved, or removed, update its owning directory
   entry point and affected inbound links. Update `docs/index.md` when directory
   responsibilities change. Records are discovered through this directory and
   search; this README changes only when its rules or lookup guidance change.
5. Check that the record matches the delivered change, evidence and page links
   resolve, and necessary navigation updates are complete. Changes to the same
   business fact still require substantive reconciliation across branches.

```markdown
# [YYYY-MM-DD] <ingest | query | revise | lint> | <Topic>

- Change: what changed and why.
- Evidence: source links and their relevant date or version.
- Affected pages: links to the owning pages and changed navigation.
- Verification: checks actually performed and any remaining uncertainty.
```

## Find Records

Browse the dated files in this directory, or run these commands from the
repository root:

```sh
rg --files docs/changes | sort -r
rg -n 'search term' docs/changes
```

Records describe knowledge and decisions at the time they were written. Current
product behavior is defined by its authoritative documents and source. To
correct a merged record, update the current authoritative page and add a new
record that links the earlier one. Historical daily records retain their
original grouping because the previous log did not identify individual tasks.

Return to the [documentation index](../index.md).
