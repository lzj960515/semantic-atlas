import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";

import { evaluationPlanSchema } from "../../src/evaluation/contracts.js";

export interface EvaluationFixtureValidation {
  readonly revision: string;
  readonly caseCount: number;
  readonly requiredFileCount: number;
  readonly requiredSymbolCount: number;
}

export function validateEvaluationFixture(
  rawPlan: unknown,
  fixtureRoot: string,
): EvaluationFixtureValidation {
  const plan = evaluationPlanSchema.parse(rawPlan);
  const root = resolve(fixtureRoot);
  const revisions = new Set(plan.cases.map((evaluationCase) => evaluationCase.fixture.revision));
  if (revisions.size !== 1) {
    throw new Error("The published evaluation fixture must have one revision");
  }
  const revision = [...revisions][0]!;
  const actualRevision = readFileSync(resolve(root, "REVISION"), "utf8").trim();
  if (actualRevision !== revision) {
    throw new Error(`Fixture revision ${actualRevision} does not match plan revision ${revision}`);
  }

  const requiredFiles = new Set(plan.cases.flatMap((evaluationCase) => (
    evaluationCase.oracle.requiredFiles
  )));
  const requiredSymbols = new Map<string, Set<string>>();
  for (const evaluationCase of plan.cases) {
    for (const symbol of evaluationCase.oracle.requiredSymbols) {
      const symbols = requiredSymbols.get(symbol.file) ?? new Set<string>();
      symbols.add(symbol.name);
      requiredSymbols.set(symbol.file, symbols);
    }
  }

  for (const file of requiredFiles) {
    const source = readFixtureSource(root, file);
    const expectedSymbols = requiredSymbols.get(file);
    if (expectedSymbols === undefined) continue;
    const declarations = declaredSymbols(file, source);
    for (const symbol of expectedSymbols) {
      if (!declarations.has(symbol)) {
        throw new Error(`Fixture ${file} does not declare required symbol ${symbol}`);
      }
    }
  }

  return {
    revision,
    caseCount: plan.cases.length,
    requiredFileCount: requiredFiles.size,
    requiredSymbolCount: [...requiredSymbols.values()].reduce(
      (total, symbols) => total + symbols.size,
      0,
    ),
  };
}

function readFixtureSource(root: string, file: string): string {
  const path = resolve(root, file);
  if (!path.startsWith(`${root}/`)) {
    throw new Error(`Fixture path escapes its root: ${file}`);
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Fixture is missing required file ${file}`, { cause: error });
  }
}

function declaredSymbols(file: string, source: string): Set<string> {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const declarations = new Set<string>();
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      declarations.add(statement.name.text);
    }
    if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      const className = statement.name.text;
      declarations.add(className);
      for (const member of statement.members) {
        if (
          (ts.isMethodDeclaration(member) || ts.isPropertyDeclaration(member))
          && member.name !== undefined
        ) {
          const memberName = declarationName(member.name);
          if (memberName !== undefined) declarations.add(`${className}.${memberName}`);
        }
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
      declarations.add(statement.name.text);
    }
  }
  return declarations;
}

function declarationName(name: ts.PropertyName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}
