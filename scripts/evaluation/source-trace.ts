import { z } from "zod";

import type { EvaluationRun } from "../../src/evaluation/contracts.js";

export const EVALUATION_SOURCE_TOKEN_METHOD = "tiktoken-o200k_base-v1";

const traceEventSchema = z.strictObject({
  sequence: z.number().int().positive(),
  file: z.string().min(1),
  sourceTokens: z.number().int().positive(),
  sourceTokenMethod: z.literal(EVALUATION_SOURCE_TOKEN_METHOD),
});

export function parseEvaluationSourceTrace(
  contents: string,
): EvaluationRun["observations"]["sourceOpens"] {
  if (contents.trim().length === 0) {
    throw new Error("Fresh Agent produced no observed source reads");
  }
  return contents.trim().split("\n").map((line, index) => {
    const event = traceEventSchema.parse(JSON.parse(line));
    return {
      sequence: index + 1,
      file: event.file,
      sourceTokens: event.sourceTokens,
    };
  });
}
