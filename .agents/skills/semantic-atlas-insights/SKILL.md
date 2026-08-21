---
name: semantic-atlas-insights
description: "Review Semantic Atlas local usage statistics and triage evidence-backed Agent feedback during routine product maintenance, daily operational review, or an Atlas effectiveness evaluation."
compatibility: "Requires Node.js 22.12 through 24 and the semantic-atlas CLI."
---

# Semantic Atlas Insights

Review the local, installation-scoped evidence that shows whether Semantic
Atlas is being used and where it creates confirmed friction. This maintenance
workflow is independent of a normal engineering task's business-understanding
loop, so load it for a deliberate review rather than routine development work.

The store records command name, outcome, exit code, warning codes, duration,
repository identity, and snapshot identity. It never records command arguments,
prompts, source text, or command output. Feedback text is explicit Agent input,
so keep it concise and free of sensitive or unrelated task details.

## Daily review

1. Start with `semantic-atlas insights summary --period yesterday` to inspect
   total commands, outcomes, warning-code counts, and feedback categories.
2. Run `semantic-atlas insights feedback --period yesterday --status new` to
   read untriaged reports with their linked local command-event IDs.
3. Classify each report from its stated evidence. Start a normal engineering
   investigation only when the report needs reproduction or source confirmation.
4. Record the maintenance decision with `semantic-atlas insights feedback update
   --stdin`. Use `triaged` for a confirmed follow-up, `resolved` for a completed
   improvement, and `dismissed` when the evidence does not establish a product
   issue. Include a brief reason in `note`.

Use `--period today`, `yesterday`, `7d`, `30d`, or `all` for a scoped review.
The default period is `today`; `--pretty` formats the versioned JSON envelope.

## Triage input

```bash
semantic-atlas insights feedback update --stdin <<'JSON'
{
  "id": "00000000-0000-4000-8000-000000000000",
  "status": "triaged",
  "note": "Reproduce against the reported snapshot before changing the map query."
}
JSON
```

## Evaluation boundary

Treat the metrics as product signals, not a recall or task-quality score by
themselves. Correlate trends with fresh-agent task evaluation, source-confirmed
reports, and the relevant repository's tests before making product claims.

Semantic Atlas Insights owns local review and feedback triage. The normal
`semantic-atlas` Skill owns business understanding, source confirmation, and
knowledge capture during engineering work.
