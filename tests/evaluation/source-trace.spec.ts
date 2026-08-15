import { describe, expect, it } from "vitest";

import { parseEvaluationSourceTrace } from "../../scripts/evaluation/source-trace.js";
import { parseEvaluationSkillTrace } from "../../scripts/evaluation/skill-trace.js";

describe("evaluation source trace normalization", () => {
  it("orders concurrently appended observations by their JSONL record order", () => {
    const trace = [
      { sequence: 8, file: "src/first.ts", sourceTokens: 20 },
      { sequence: 8, file: "src/second.ts", sourceTokens: 30 },
      { sequence: 9, file: "src/third.ts", sourceTokens: 40 },
    ].map((event) => JSON.stringify({
      ...event,
      sourceTokenMethod: "tiktoken-o200k_base-v1",
    })).join("\n");

    expect(parseEvaluationSourceTrace(trace)).toEqual([
      { sequence: 1, file: "src/first.ts", sourceTokens: 20 },
      { sequence: 2, file: "src/second.ts", sourceTokens: 30 },
      { sequence: 3, file: "src/third.ts", sourceTokens: 40 },
    ]);
  });
});

describe("evaluation Skill trace normalization", () => {
  it("records only the candidate main file and conditional references", () => {
    const trace = [
      { sequence: 4, file: ".agents/skills/semantic-atlas/SKILL.md" },
      {
        sequence: 9,
        file: ".agents/skills/semantic-atlas/references/result-routing.md",
      },
    ].map((event) => JSON.stringify(event)).join("\n");

    expect(parseEvaluationSkillTrace(trace)).toEqual([
      { sequence: 1, file: ".agents/skills/semantic-atlas/SKILL.md" },
      {
        sequence: 2,
        file: ".agents/skills/semantic-atlas/references/result-routing.md",
      },
    ]);
  });
});
