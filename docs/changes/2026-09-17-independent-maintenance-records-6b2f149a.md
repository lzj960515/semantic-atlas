# [2026-09-17] revise | Independent documentation maintenance records

- Change: each documentation maintenance task now writes its own dated file in
  `docs/changes/`, reducing unrelated edits to a shared log. The seven original
  daily sections were migrated without changing their dates, grouping, or text.
- Evidence: the accepted request to use independent records and the
  [previous documentation log](https://github.com/lzj960515/semantic-atlas/blob/2967edfe93fd829081e69c1038baa20de673d71f/docs/log.md)
  establish the migration scope and preserved history.
- Affected pages: [repository rules](../../AGENTS.md), the
  [documentation index](../index.md), and the
  [maintenance record rules](README.md). Directory listing and search provide
  record discovery; adding a record does not require editing a shared index.
- Verification: compared every migrated section with the original log, checked
  inbound references and relative links, and ran the repository formatting
  check. Current product contracts and runtime behavior are unchanged.
