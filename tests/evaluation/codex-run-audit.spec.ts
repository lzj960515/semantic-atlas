import { describe, expect, it } from "vitest";

import {
  auditCodexCommands,
  auditFreshAgentSkillDiscovery,
  auditCodexRun,
} from "../../scripts/evaluation/codex-run-audit.js";

describe("Fresh Agent Codex command audit", () => {
  it("accepts observed source reads and records Atlas commands", () => {
    const audit = auditCodexRun("atlas", jsonLines([
      completedCommand("/bin/zsh -lc 'rg --files'"),
      completedCommand("/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts 1 20'"),
      completedCommand("/bin/zsh -lc 'semantic-atlas map search placeOrder --limit 5'"),
      { type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } },
    ]));

    expect(audit.atlasCalls).toEqual([{
      sequence: 1,
      command: "semantic-atlas map search placeOrder --limit 5",
      commandSequence: 3,
      exitCode: 0,
      output: "",
    }]);
    expect(audit.commandCount).toBe(3);
    expect(audit.commands).toEqual([
      "/bin/zsh -lc 'rg --files'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts 1 20'",
      "/bin/zsh -lc 'semantic-atlas map search placeOrder --limit 5'",
    ]);
  });

  it("rejects direct commands that return source text", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      completedCommand("/bin/zsh -lc \"rg -n 'placeOrder' src\""),
      { type: "turn.completed", usage: {} },
    ]))).toThrow(/not allowed by the evaluation command policy/);
  });

  it("re-audits commands retained in published run records", () => {
    expect(() => auditCodexCommands("no-atlas", [
      "/bin/zsh -lc 'node $EVALUATION_OBSERVER read src/order.ts'",
      "/bin/zsh -lc 'nl -ba src/secret.ts'",
    ])).toThrow(/not allowed by the evaluation command policy/);
  });

  it("rejects alternative readers, command wrappers, and input redirection", () => {
    for (const command of [
      "/bin/zsh -lc 'nl -ba src/order.ts'",
      "/bin/zsh -lc \"sh -c 'cat src/order.ts'\"",
      "/bin/zsh -lc 'sort < src/order.ts'",
    ]) {
      expect(() => auditCodexRun("no-atlas", jsonLines([
        completedCommand(command),
        { type: "turn.completed", usage: {} },
      ]))).toThrow(/not allowed by the evaluation command policy/);
    }
  });

  it("rejects host Skill and plugin instruction reads", () => {
    for (const command of [
      "/bin/zsh -lc \"sed -n '1,240p' /Users/test/.agents/skills/typeorm/SKILL.md\"",
      "/bin/zsh -lc 'cat /Users/test/.codex/plugins/cache/example/SKILL.md'",
    ]) {
      expect(() => auditCodexRun("no-atlas", jsonLines([
        completedCommand(command),
        { type: "turn.completed", usage: {} },
      ]))).toThrow(/external instruction/);
    }
  });

  it("allows filtering an rg file-name listing without opening source", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      completedCommand("/bin/zsh -lc \"rg --files -g '!node_modules' | sed -n '1,240p'\""),
      { type: "turn.completed", usage: {} },
    ]))).not.toThrow();
  });

  it("does not let an observer mask a chained source read", () => {
    for (const command of [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts; cat src/secret.ts'",
    ]) {
      expect(() => auditCodexRun("no-atlas", jsonLines([
        completedCommand(command),
        { type: "turn.completed", usage: {} },
      ]))).toThrow(/not allowed by the evaluation command policy/);
    }
  });

  it("rejects Atlas commands in no-Atlas mode", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      completedCommand("/bin/zsh -lc 'semantic-atlas status'"),
      { type: "turn.completed", usage: {} },
    ]))).toThrow(/no-atlas run invoked Semantic Atlas/);
  });

  it("rejects Atlas repository overrides in every CLI position", () => {
    for (const command of [
      "/bin/zsh -lc 'semantic-atlas status --repo /tmp/other-repository'",
      "/bin/zsh -lc 'semantic-atlas map search Order --repo ../no-atlas --limit 10'",
      "/bin/zsh -lc 'semantic-atlas --repo sibling status'",
    ]) {
      expect(() => auditCodexCommands("atlas", [command])).toThrow(
        /not allowed by the evaluation command policy/,
      );
    }
  });

  it.each([
    "/bin/zsh -lc 'semantic-atlas map search {Order,--repo,/tmp/other-repository}'",
    "/bin/zsh -lc 'semantic-atlas map search ${=ATLAS_ARGUMENTS}'",
    "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/*.ts'",
    "/bin/zsh -lc 'semantic-atlas map search ~'",
  ])("rejects shell word generation before commands are classified: %s", (command) => {
    expect(() => auditCodexCommands("atlas", [command])).toThrow(
      /not allowed by the evaluation command policy/,
    );
  });

  it("accepts quoted shell metacharacters as literal query patterns", () => {
    expect(() => auditCodexCommands("atlas", [
      "/bin/zsh -lc \"semantic-atlas map search '{Order,--repo}'\"",
      "/bin/zsh -lc \"$EVALUATION_OBSERVER search '*Service' src\"",
    ])).not.toThrow();
  });

  it("rejects malformed or mutating Atlas CLI grammar", () => {
    for (const command of [
      "/bin/zsh -lc 'semantic-atlas status unexpected'",
      "/bin/zsh -lc 'semantic-atlas map roots --limit 1'",
      "/bin/zsh -lc 'semantic-atlas changes --from invalid'",
      "/bin/zsh -lc 'semantic-atlas map show orders --depth 4'",
      "/bin/zsh -lc 'semantic-atlas index'",
    ]) {
      expect(() => auditCodexCommands("atlas", [command])).toThrow(
        /not allowed by the evaluation command policy/,
      );
    }
  });

  it("accepts every fixture-local read-only Atlas command shape", () => {
    const snapshot = "a".repeat(64);
    const commands = [
      "/bin/zsh -lc 'semantic-atlas status --pretty'",
      `/bin/zsh -lc 'semantic-atlas changes --from ${snapshot} --to ${snapshot}'`,
      "/bin/zsh -lc 'semantic-atlas map roots'",
      "/bin/zsh -lc 'semantic-atlas map children orders'",
      `/bin/zsh -lc 'semantic-atlas map search "Order service" --limit 10'`,
      "/bin/zsh -lc 'semantic-atlas map show orders --depth 3'",
    ];

    expect(auditCodexCommands("atlas", commands).atlasCalls).toHaveLength(commands.length);
  });

  it("proves repository Skill discovery and status-map-source ordering", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts 1 40'",
    ];

    expect(auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          businessNode("commerce/orders/place-order"),
        ])),
      ],
    })).toEqual({
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
    });
  });

  it("rejects source exploration that precedes Atlas status or map queries", () => {
    const skillLoads = [{
      sequence: 1,
      file: ".agents/skills/semantic-atlas/SKILL.md",
    }] as const;
    const sourceFirst = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map roots'",
    ];

    expect(() => auditDiscovery(sourceFirst, {
      skillLoads,
      atlasCalls: [
        atlasCall(1, 3, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 4, "semantic-atlas map roots", mapRootsEnvelope([
          businessNode("commerce/orders"),
        ])),
      ],
    })).toThrow(
      /status before opening source/,
    );
  });

  it("rejects Atlas use that precedes repository Skill discovery", () => {
    const commands = [
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas map roots'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
    ];

    expect(() => auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 1, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map roots", mapRootsEnvelope([
          businessNode("commerce/orders"),
        ])),
      ],
    })).toThrow(/load the repository Skill before Atlas status/);
  });

  it("does not treat an unrelated source read as decisive evidence", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/unrelated.ts'",
    ];

    expect(() => auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          businessNode("commerce/orders/place-order"),
        ])),
      ],
      sourceOpens: [{ sequence: 1, file: "src/unrelated.ts", sourceTokens: 20 }],
    })).toThrow(/decisive source/i);
  });

  it("rejects snapshot bootstrap loaded after source fallback", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/references/snapshot-bootstrap.md'",
    ];

    expect(() => auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          structuralNode("src/orders/order.service.ts"),
        ])),
      ],
      skillLoads: [
        { sequence: 1, file: ".agents/skills/semantic-atlas/SKILL.md" },
        {
          sequence: 2,
          file: ".agents/skills/semantic-atlas/references/snapshot-bootstrap.md",
        },
      ],
    })).toThrow(/snapshot bootstrap.*before opening source/i);
  });

  it("proves snapshot bootstrap after a relevant structural-only map", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/references/snapshot-bootstrap.md'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
    ];

    expect(auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          structuralNode("src/orders/order.service.ts"),
        ])),
      ],
      skillLoads: [
        { sequence: 1, file: ".agents/skills/semantic-atlas/SKILL.md" },
        {
          sequence: 2,
          file: ".agents/skills/semantic-atlas/references/snapshot-bootstrap.md",
        },
      ],
    })).toMatchObject({
      decisiveSourceFiles: ["src/orders/order.service.ts"],
      conditionalReferences: {
        snapshotBootstrap: {
          outcome: "loaded-after-trigger",
          triggerCommandSequence: 3,
          loadCommandSequence: 4,
        },
      },
    });
  });

  it("rejects an incomplete Codex turn", () => {
    expect(() => auditCodexRun("atlas", jsonLines([
      completedCommand("/bin/zsh -lc 'rg --files'"),
    ]))).toThrow(/did not complete/);
  });

  it("rejects fixture file changes", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      { type: "item.completed", item: { type: "file_change", changes: [] } },
      { type: "turn.completed", usage: {} },
    ]))).toThrow(/modified the fixture/);
  });
});

function completedCommand(command: string) {
  return {
    type: "item.completed",
    item: {
      id: "item-1",
      type: "command_execution",
      command,
      aggregated_output: "",
      exit_code: 0,
      status: "completed",
    },
  };
}

function jsonLines(events: unknown[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

type DiscoveryEvidence = Parameters<typeof auditFreshAgentSkillDiscovery>[2];
type DiscoveryOverrides = Partial<DiscoveryEvidence> & {
  readonly skillLoads?: readonly { readonly sequence: number; readonly file: string }[];
};

function auditDiscovery(
  commands: readonly string[],
  overrides: DiscoveryOverrides,
) {
  const { skillLoads = [{
    sequence: 1,
    file: ".agents/skills/semantic-atlas/SKILL.md",
  }], ...evidenceOverrides } = overrides;
  return auditFreshAgentSkillDiscovery(commands, skillLoads, {
    atlasCalls: [],
    sourceOpens: [{
      sequence: 1,
      file: "src/orders/order.service.ts",
      sourceTokens: 20,
    }],
    reportedFiles: ["src/orders/order.service.ts"],
    reportedSymbols: [{
      file: "src/orders/order.service.ts",
      name: "OrderService.placeOrder",
    }],
    requiredFiles: ["src/orders/order.service.ts"],
    requiredSymbols: [{
      file: "src/orders/order.service.ts",
      name: "OrderService.placeOrder",
    }],
    ...evidenceOverrides,
  });
}

function atlasCall(
  sequence: number,
  commandSequence: number,
  command: string,
  envelope: unknown,
) {
  return {
    sequence,
    commandSequence,
    command,
    exitCode: 0,
    output: JSON.stringify(envelope),
  };
}

function statusEnvelope() {
  return {
    schemaVersion: 1,
    status: "ok",
    data: {
      command: "status",
      freshness: "current",
      backend: { completeness: "complete" },
    },
    warnings: [],
  };
}

function mapEnvelope(nodes: unknown[]) {
  return {
    schemaVersion: 1,
    status: "ok",
    data: { command: "map.search", results: nodes.map((node) => ({ node })) },
    warnings: [],
  };
}

function mapRootsEnvelope(nodes: unknown[]) {
  return {
    schemaVersion: 1,
    status: "ok",
    data: { command: "map.roots", nodes },
    warnings: [],
  };
}

function structuralNode(file: string) {
  return { domain: "structural", locations: [{ file }] };
}

function businessNode(key: string) {
  return {
    domain: "business",
    key,
    evidence: [{ file: "src/orders/order.service.ts" }],
  };
}
