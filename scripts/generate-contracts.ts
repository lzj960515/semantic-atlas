import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  cliEnvelopeSchema,
  graphPatchV1Schema,
} from "../src/contracts/public-contracts.js";
import {
  evaluationPlanSchema,
  evaluationRunSchema,
} from "../src/evaluation/contracts.js";

const checkOnly = process.argv.includes("--check");
const contracts = [
  {
    path: "schemas/cli-envelope-v1.schema.json",
    id: "https://raw.githubusercontent.com/lzj960515/semantic-atlas/main/schemas/cli-envelope-v1.schema.json",
    title: "Semantic Atlas CLI envelope v1",
    schema: cliEnvelopeSchema,
  },
  {
    path: "schemas/graph-patch-v1.schema.json",
    id: "https://raw.githubusercontent.com/lzj960515/semantic-atlas/main/schemas/graph-patch-v1.schema.json",
    title: "Semantic Atlas GraphPatch v1",
    schema: graphPatchV1Schema,
  },
  {
    path: "schemas/evaluation-plan-v1.schema.json",
    id: "https://raw.githubusercontent.com/lzj960515/semantic-atlas/main/schemas/evaluation-plan-v1.schema.json",
    title: "Semantic Atlas evaluation plan v1",
    schema: evaluationPlanSchema,
  },
  {
    path: "schemas/evaluation-run-v1.schema.json",
    id: "https://raw.githubusercontent.com/lzj960515/semantic-atlas/main/schemas/evaluation-run-v1.schema.json",
    title: "Semantic Atlas evaluation run v1",
    schema: evaluationRunSchema,
  },
] as const;

for (const contract of contracts) {
  const generated = z.toJSONSchema(contract.schema, {
    target: "draft-2020-12",
    reused: "ref",
    unrepresentable: "any",
  });
  const { $schema: _generatedDialect, ...body } = generated;
  const content = `${JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: contract.id,
      title: contract.title,
      ...body,
    },
    null,
    2,
  )}\n`;
  const outputPath = resolve(contract.path);

  if (checkOnly) {
    const existing = await readFile(outputPath, "utf8").catch(() => undefined);
    if (!matchesGeneratedContent(existing, content)) {
      throw new Error(
        `${contract.path} is stale; run pnpm contracts:generate`,
      );
    }
    continue;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content);
}

process.stdout.write(
  checkOnly
    ? `Verified ${contracts.length} generated contracts.\n`
    : `Generated ${contracts.length} contracts.\n`,
);

function matchesGeneratedContent(
  existing: string | undefined,
  generated: string,
): boolean {
  return existing !== undefined
    && normalizeLineEndings(existing) === normalizeLineEndings(generated);
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n?/gu, "\n");
}
