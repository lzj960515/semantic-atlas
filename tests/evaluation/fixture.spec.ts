import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateEvaluationFixture } from "../../scripts/evaluation/fixture.js";

describe("framework evaluation fixture", () => {
  it("implements every frozen oracle file and symbol at fixture-v1", () => {
    const plan = JSON.parse(readFileSync("evaluation/cases/plan.json", "utf8"));

    expect(validateEvaluationFixture(
      plan,
      "evaluation/fixtures/framework-evaluation",
    )).toEqual({
      revision: "fixture-v1",
      caseCount: 12,
      requiredFileCount: 25,
      requiredSymbolCount: 23,
    });
  });
});
