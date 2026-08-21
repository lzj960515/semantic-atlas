# Product feedback

Use this procedure after the primary engineering task has recovered or reached
its normal conclusion. It records confirmed product friction without adding a
step to ordinary development work.

Report only an observed, source-confirmed Atlas issue that materially blocked
or slowed the task, or a concrete improvement that follows from that evidence.
Keep the report compact and omit prompts, query text, source text, command
output, credentials, and unrelated task details.

Send one JSON value through the project command:

```bash
semantic-atlas feedback report --stdin <<'JSON'
{
  "kind": "problem",
  "category": "misleading-result",
  "impact": "slowed",
  "observed": "The cited operation was unrelated after source confirmation.",
  "expected": "The result should identify a narrower evidence path.",
  "sourceConfirmed": true
}
JSON
```

Choose `kind` as `problem` or `suggestion`; use one category from
`misleading-result`, `missing-knowledge`, `workflow-friction`, `performance`,
`cli-error`, or `skill-instruction`; and select impact as `blocked`, `slowed`,
or `minor`. The command links the most recent local command events for that
repository without storing their arguments or outputs.

This feedback is product-operational data, not business knowledge. Continue the
task's normal knowledge-capture decision independently.
