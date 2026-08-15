import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

describe("published evaluation validation", () => {
  const directories: string[] = [];

  afterEach(() => {
    for (const directory of directories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("rejects a runner-v5 record whose retained Skill read is late", () => {
    const directory = mkdtempSync(join(tmpdir(), "atlas-evaluation-validator-"));
    directories.push(directory);
    const planPath = join(directory, "plan.json");
    const runPath = join(directory, "run.json");
    writeFileSync(planPath, `${JSON.stringify(plan)}\n`);
    writeFileSync(runPath, `${JSON.stringify(lateSkillRun)}\n`);

    expect(() => execFileSync(
      "corepack",
      ["pnpm", "exec", "tsx", "scripts/validate-evaluation.ts", planPath, runPath],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
    )).toThrow(/load the repository Skill before Atlas status/);
  });

  it("rejects a stored discovery proof that disagrees with replayed evidence", () => {
    const directory = mkdtempSync(join(tmpdir(), "atlas-evaluation-validator-"));
    directories.push(directory);
    const planPath = join(directory, "plan.json");
    const runPath = join(directory, "run.json");
    const forgedProofRun = structuredClone(lateSkillRun);
    forgedProofRun.protocol.commandAudit.commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
    ];
    forgedProofRun.observations.atlasCalls[0]!.commandSequence = 2;
    forgedProofRun.observations.atlasCalls[1]!.commandSequence = 3;
    forgedProofRun.observations.sourceOpens[0]!.commandSequence = 4;
    forgedProofRun.protocol.skillDiscovery.decisiveSourceFiles = ["src/unrelated.ts"];
    writeFileSync(planPath, `${JSON.stringify(plan)}\n`);
    writeFileSync(runPath, `${JSON.stringify(forgedProofRun)}\n`);

    expect(() => execFileSync(
      "corepack",
      ["pnpm", "exec", "tsx", "scripts/validate-evaluation.ts", planPath, runPath],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
    )).toThrow(/proof disagrees with retained evidence/);
  });

  it("accepts a runner-v5 proof derived from the retained timeline", () => {
    const directory = mkdtempSync(join(tmpdir(), "atlas-evaluation-validator-"));
    directories.push(directory);
    const planPath = join(directory, "plan.json");
    const runPath = join(directory, "run.json");
    const validRun = structuredClone(lateSkillRun);
    validRun.protocol.commandAudit.commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
    ];
    validRun.observations.atlasCalls[0]!.commandSequence = 2;
    validRun.observations.atlasCalls[1]!.commandSequence = 3;
    validRun.observations.sourceOpens[0]!.commandSequence = 4;
    writeFileSync(planPath, `${JSON.stringify(plan)}\n`);
    writeFileSync(runPath, `${JSON.stringify(validRun)}\n`);

    const output = execFileSync(
      "corepack",
      ["pnpm", "exec", "tsx", "scripts/validate-evaluation.ts", planPath, runPath],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
    );

    expect(JSON.parse(output)).toMatchObject({ valid: true });
  });

  it("rejects GraphPatch proof attributed to a failed source command", () => {
    const directory = mkdtempSync(join(tmpdir(), "atlas-evaluation-validator-"));
    directories.push(directory);
    const planPath = join(directory, "plan.json");
    const runPath = join(directory, "run.json");
    const failedSourceRun = structuredClone(lateSkillRun);
    failedSourceRun.protocol.commandAudit.commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/references/graph-patch.md'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
    ];
    failedSourceRun.observations.atlasCalls[0]!.commandSequence = 2;
    failedSourceRun.observations.atlasCalls[1]!.commandSequence = 3;
    failedSourceRun.observations.sourceOpens[0]!.commandSequence = 6;
    failedSourceRun.observations.skillLoads = [
      { sequence: 1, file: ".agents/skills/semantic-atlas/SKILL.md" },
      {
        sequence: 2,
        file: ".agents/skills/semantic-atlas/references/graph-patch.md",
      },
    ];
    Object.assign(failedSourceRun.protocol.skillDiscovery.conditionalReferences.graphPatch, {
      outcome: "loaded-after-source",
      sourceCommandSequence: 4,
      loadCommandSequence: 5,
    });
    writeFileSync(planPath, `${JSON.stringify(plan)}\n`);
    writeFileSync(runPath, `${JSON.stringify(failedSourceRun)}\n`);

    expect(() => execFileSync(
      "corepack",
      ["pnpm", "exec", "tsx", "scripts/validate-evaluation.ts", planPath, runPath],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
    )).toThrow(/GraphPatch authoring before decisive source confirmation/);
  });

  it("rejects a post-source weak result without result routing", () => {
    const directory = mkdtempSync(join(tmpdir(), "atlas-evaluation-validator-"));
    directories.push(directory);
    const planPath = join(directory, "plan.json");
    const runPath = join(directory, "run.json");
    const missingRoutingRun = structuredClone(lateSkillRun);
    missingRoutingRun.protocol.commandAudit.commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc 'semantic-atlas map search MissingOrder --limit 5'",
    ];
    missingRoutingRun.observations.atlasCalls[0]!.commandSequence = 2;
    missingRoutingRun.observations.atlasCalls[1]!.commandSequence = 3;
    missingRoutingRun.observations.sourceOpens[0]!.commandSequence = 4;
    missingRoutingRun.observations.atlasCalls.push({
      sequence: 3,
      commandSequence: 5,
      command: "semantic-atlas map search MissingOrder --limit 5",
      exitCode: 0,
      output: JSON.stringify({
        schemaVersion: 1,
        status: "ok",
        data: { command: "map.search", results: [] },
        warnings: [],
      }),
    });
    writeFileSync(planPath, `${JSON.stringify(plan)}\n`);
    writeFileSync(runPath, `${JSON.stringify(missingRoutingRun)}\n`);

    expect(() => execFileSync(
      "corepack",
      ["pnpm", "exec", "tsx", "scripts/validate-evaluation.ts", planPath, runPath],
      { cwd: process.cwd(), encoding: "utf8", stdio: "pipe" },
    )).toThrow(/must load result routing after its matching Atlas state/);
  });
});

const plan = {
  schemaVersion: 1,
  cases: [{
    id: "location-order-service",
    title: "Locate order service",
    category: "location",
    frameworks: ["nestjs"],
    fixture: {
      kind: "synthetic",
      repository: "framework-evaluation",
      revision: "fixture-v1",
    },
    prompt: "Locate order placement.",
    oracle: {
      acceptanceCriteria: ["Identifies OrderService.placeOrder."],
      requiredFiles: ["src/orders/order.service.ts"],
      requiredSymbols: [{
        file: "src/orders/order.service.ts",
        name: "OrderService.placeOrder",
      }],
    },
  }],
};

const lateSkillRun = {
  schemaVersion: 1,
  runId: "fresh-agent-v1-location-order-service-atlas",
  caseId: "location-order-service",
  mode: "atlas",
  fixtureRevision: "fixture-v1",
  agent: { product: "codex-cli", model: "gpt-5.6-sol", freshContext: true },
  protocol: {
    runnerVersion: "fresh-agent-runner-v5",
    fixtureCommit: "0".repeat(40),
    instructionsHash: "a".repeat(64),
    toolPolicyHash: "b".repeat(64),
    oracleHidden: true,
    commandAuditPassed: true,
    commandAudit: {
      policy: "fresh-agent-shell-allowlist-v4",
      commands: [
        "/bin/zsh -lc 'semantic-atlas status'",
        "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
        "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
        "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      ],
    },
    skillDiscovery: {
      delivery: "repository",
      promptInjection: false,
      mainSkillLoaded: true,
      statusBeforeSource: true,
      mapBeforeSource: true,
      decisiveSourceRead: true,
      decisiveSourceFiles: ["src/orders/order.service.ts"],
      conditionalReferences: {
        snapshotBootstrap: { outcome: "not-required" },
        resultRouting: { outcome: "not-required" },
        graphPatch: { outcome: "not-loaded" },
      },
    },
  },
  startedAt: "2026-08-15T00:00:00.000Z",
  finishedAt: "2026-08-15T00:01:00.000Z",
  observations: {
    sourceTokenMethod: "tiktoken-o200k_base-v1",
    sourceOpens: [{
      sequence: 1,
      commandSequence: 3,
      exitCode: 0,
      file: "src/orders/order.service.ts",
      sourceTokens: 20,
    }],
    atlasCalls: [{
      sequence: 1,
      commandSequence: 1,
      command: "semantic-atlas status",
      exitCode: 0,
      output: JSON.stringify({
        schemaVersion: 1,
        status: "ok",
        data: {
          command: "status",
          freshness: "current",
          backend: { completeness: "complete" },
        },
        warnings: [],
      }),
    }, {
      sequence: 2,
      commandSequence: 2,
      command: "semantic-atlas map search Order --limit 5",
      exitCode: 0,
      output: JSON.stringify({
        schemaVersion: 1,
        status: "ok",
        data: {
          command: "map.search",
          results: [{
            node: {
              domain: "business",
              key: "commerce/orders",
              evidence: [{ file: "src/orders/order.service.ts" }],
            },
          }],
        },
        warnings: [],
      }),
    }],
    atlasHandling: [],
    skillLoads: [{
      sequence: 1,
      file: ".agents/skills/semantic-atlas/SKILL.md",
    }],
  },
  answer: {
    response: "OrderService.placeOrder implements order placement.",
    reportedFiles: ["src/orders/order.service.ts"],
    reportedSymbols: [{
      file: "src/orders/order.service.ts",
      name: "OrderService.placeOrder",
    }],
  },
  adjudication: { correct: true, notes: "Correct.", failureClassifications: [] },
};
