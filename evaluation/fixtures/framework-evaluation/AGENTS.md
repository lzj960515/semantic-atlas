# Framework Evaluation Fixture

This repository is an immutable Fresh Agent evaluation fixture. Inspect it read-only and answer only the supplied task.

- List paths with `rg --files`, `find`, or `ls` when useful.
- Obtain source text only through `$EVALUATION_OBSERVER search <pattern> [path ...]` and `$EVALUATION_OBSERVER read <file> [start-line] [end-line]`. Direct source-output commands invalidate the run.
- Use Semantic Atlas before broad source exploration when its Skill and CLI are available. Confirm answer-controlling behavior through the same source observer.
- Use ordinary source discovery when Semantic Atlas is unavailable.
- Report the exact repository-relative files and qualified symbols that support the answer. Preserve stale, hypothesis, unknown, unsupported, ambiguous, or insufficient boundaries instead of presenting them as exact.
- Do not edit files, install packages, run tests, or inspect evaluation or oracle material outside this repository.
