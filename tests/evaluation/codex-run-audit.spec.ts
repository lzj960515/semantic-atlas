import { describe, expect, it } from "vitest";

import {
  auditCodexCommands,
  auditFreshAgentSkillDiscovery,
  auditCodexRun,
  bindSourceOpensToCommands,
} from "../../scripts/evaluation/codex-run-audit.js";

describe("Fresh Agent Codex command audit", () => {
  it("accepts observed source reads and records Atlas commands", () => {
    const audit = auditCodexRun("atlas", jsonLines([
      completedCommand("/bin/zsh -lc 'rg --files'"),
      completedCommand(
        "/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts 1 20'",
        { output: "=== src/order.ts:1-20 ===\nexport class Order {}\n" },
      ),
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
    expect(audit.sourceCommands).toEqual([{
      commandSequence: 2,
      exitCode: 0,
      files: ["src/order.ts"],
    }]);
    expect(audit.commands).toEqual([
      "/bin/zsh -lc 'rg --files'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts 1 20'",
      "/bin/zsh -lc 'semantic-atlas map search placeOrder --limit 5'",
    ]);
  });

  it("binds source trace events only to successful observer commands", () => {
    const audit = auditCodexRun("no-atlas", jsonLines([
      completedCommand(
        "/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts'",
        { exitCode: 1 },
      ),
      completedCommand(
        "/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts'",
        { output: "=== src/order.ts:1-1 ===\nexport class Order {}\n" },
      ),
      { type: "turn.completed", usage: {} },
    ]));

    expect(audit.sourceCommands).toEqual([{
      commandSequence: 1,
      exitCode: 1,
      files: [],
    }, {
      commandSequence: 2,
      exitCode: 0,
      files: ["src/order.ts"],
    }]);
    expect(bindSourceOpensToCommands([{
      sequence: 1,
      file: "src/order.ts",
      sourceTokens: 10,
    }], audit.sourceCommands)).toEqual([{
      sequence: 1,
      commandSequence: 2,
      exitCode: 0,
      file: "src/order.ts",
      sourceTokens: 10,
    }]);
  });

  it("binds every source-search trace event to its successful command", () => {
    const audit = auditCodexRun("no-atlas", jsonLines([
      completedCommand(
        "/bin/zsh -lc '$EVALUATION_OBSERVER search Order src/orders'",
        {
          output: [
            "=== src/orders/order.controller.ts:matches ===",
            "src/orders/order.controller.ts:10:export class OrderController {}",
            "=== src/orders/order.service.ts:matches ===",
            "src/orders/order.service.ts:5:export class OrderService {}",
            "",
          ].join("\n"),
        },
      ),
      { type: "turn.completed", usage: {} },
    ]));

    expect(bindSourceOpensToCommands([{
      sequence: 1,
      file: "src/orders/order.controller.ts",
      sourceTokens: 10,
    }, {
      sequence: 2,
      file: "src/orders/order.service.ts",
      sourceTokens: 12,
    }], audit.sourceCommands)).toMatchObject([{
      commandSequence: 1,
      exitCode: 0,
      file: "src/orders/order.controller.ts",
    }, {
      commandSequence: 1,
      exitCode: 0,
      file: "src/orders/order.service.ts",
    }]);
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
      "/bin/zsh -lc 'semantic-atlas map view --limit 1'",
      "/bin/zsh -lc 'semantic-atlas changes --from invalid'",
      "/bin/zsh -lc 'semantic-atlas map show orders --depth 1'",
      "/bin/zsh -lc 'semantic-atlas map roots'",
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
      "/bin/zsh -lc 'semantic-atlas map view'",
      "/bin/zsh -lc 'semantic-atlas map view orders'",
      `/bin/zsh -lc 'semantic-atlas map search "Order service" --limit 10'`,
      "/bin/zsh -lc 'semantic-atlas map show orders'",
      `/bin/zsh -lc 'semantic-atlas code search "OrderService" --limit 10'`,
    ];

    expect(auditCodexCommands("atlas", commands).atlasCalls).toHaveLength(commands.length);
  });

  it("replays retained v4 Atlas commands without admitting them to the current policy", () => {
    const retainedCommands = [
      "/bin/zsh -lc 'semantic-atlas map roots'",
      "/bin/zsh -lc 'semantic-atlas map show orders --depth 2'",
    ];

    expect(auditCodexCommands(
      "atlas",
      retainedCommands,
      "fresh-agent-shell-allowlist-v4",
    ).atlasCalls).toHaveLength(retainedCommands.length);
    expect(() => auditCodexCommands("atlas", retainedCommands)).toThrow(
      /not allowed by the evaluation command policy/,
    );
    expect(() => auditCodexCommands(
      "atlas",
      ["/bin/zsh -lc 'semantic-atlas map view'"],
      "fresh-agent-shell-allowlist-v4",
    )).toThrow(/not allowed by the evaluation command policy/);
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
      knowledgeCaptureDecision: {
        outcome: "reuse",
        summary: "The verified business meaning is already represented in Atlas.",
      },
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
      "/bin/zsh -lc 'semantic-atlas map view'",
    ];

    expect(() => auditDiscovery(sourceFirst, {
      skillLoads,
      atlasCalls: [
        atlasCall(1, 3, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 4, "semantic-atlas map view", mapViewEnvelope([
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
      "/bin/zsh -lc 'semantic-atlas map view'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
    ];

    expect(() => auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 1, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map view", mapViewEnvelope([
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

  it("accepts a successful trace-backed source search as decisive evidence", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER search placeOrder src/orders'",
    ];

    expect(auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          businessNode("commerce/orders/place-order"),
        ])),
      ],
      sourceOpens: [{
        sequence: 1,
        commandSequence: 4,
        exitCode: 0,
        file: "src/orders/order.service.ts",
        sourceTokens: 20,
      }],
    })).toMatchObject({
      decisiveSourceFiles: ["src/orders/order.service.ts"],
    });
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

  it("does not let a failed source read authorize GraphPatch authoring", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/references/graph-patch.md'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
    ];

    expect(() => auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          businessNode("commerce/orders/place-order"),
        ])),
      ],
      sourceOpens: [{
        sequence: 1,
        commandSequence: 6,
        exitCode: 0,
        file: "src/orders/order.service.ts",
        sourceTokens: 20,
      }],
      skillLoads: [
        { sequence: 1, file: ".agents/skills/semantic-atlas/SKILL.md" },
        {
          sequence: 2,
          file: ".agents/skills/semantic-atlas/references/graph-patch.md",
        },
      ],
      knowledgeCaptureDecision: {
        outcome: "persist",
        summary: "Place order is durable verified knowledge missing from Atlas.",
      },
    })).toThrow(/GraphPatch authoring before decisive source confirmation/);
  });

  it("requires GraphPatch authoring for durable knowledge to persist", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/references/snapshot-bootstrap.md'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
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
      knowledgeCaptureDecision: {
        outcome: "persist",
        summary: "Place order is durable verified knowledge missing from Atlas.",
      },
    })).toThrow(/persist decision requires GraphPatch authoring/);
  });

  it("rejects GraphPatch authoring for a transient knowledge decision", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/references/graph-patch.md'",
    ];

    expect(() => auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          businessNode("commerce/orders/place-order"),
        ])),
      ],
      skillLoads: [
        { sequence: 1, file: ".agents/skills/semantic-atlas/SKILL.md" },
        {
          sequence: 2,
          file: ".agents/skills/semantic-atlas/references/graph-patch.md",
        },
      ],
      knowledgeCaptureDecision: {
        outcome: "transient",
        summary: "The observation applies only to this evaluation run.",
      },
    })).toThrow(/loaded GraphPatch authoring without a persist decision/);
  });

  it("requires result routing when a weak map result appears after source", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc 'semantic-atlas map search MissingOrder --limit 5'",
    ];

    expect(() => auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          businessNode("commerce/orders/place-order"),
        ])),
        atlasCall(3, 5, "semantic-atlas map search MissingOrder --limit 5", mapEnvelope([])),
      ],
      sourceOpens: [{
        sequence: 1,
        commandSequence: 4,
        exitCode: 0,
        file: "src/orders/order.service.ts",
        sourceTokens: 20,
      }],
    })).toThrow(/must load result routing after its matching Atlas state/i);
  });

  it("proves result routing loaded after a post-source weak result", () => {
    const commands = [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/SKILL.md'",
      "/bin/zsh -lc 'semantic-atlas status'",
      "/bin/zsh -lc 'semantic-atlas map search Order --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/orders/order.service.ts'",
      "/bin/zsh -lc 'semantic-atlas map search MissingOrder --limit 5'",
      "/bin/zsh -lc '$EVALUATION_OBSERVER read .agents/skills/semantic-atlas/references/result-routing.md'",
    ];

    expect(auditDiscovery(commands, {
      atlasCalls: [
        atlasCall(1, 2, "semantic-atlas status", statusEnvelope()),
        atlasCall(2, 3, "semantic-atlas map search Order --limit 5", mapEnvelope([
          businessNode("commerce/orders/place-order"),
        ])),
        atlasCall(3, 5, "semantic-atlas map search MissingOrder --limit 5", mapEnvelope([])),
      ],
      sourceOpens: [{
        sequence: 1,
        commandSequence: 4,
        exitCode: 0,
        file: "src/orders/order.service.ts",
        sourceTokens: 20,
      }],
      skillLoads: [
        { sequence: 1, file: ".agents/skills/semantic-atlas/SKILL.md" },
        {
          sequence: 2,
          file: ".agents/skills/semantic-atlas/references/result-routing.md",
        },
      ],
    })).toMatchObject({
      conditionalReferences: {
        resultRouting: {
          outcome: "loaded-after-trigger",
          triggerCommandSequence: 5,
          loadCommandSequence: 6,
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

function completedCommand(
  command: string,
  options: { readonly output?: string; readonly exitCode?: number } = {},
) {
  return {
    type: "item.completed",
    item: {
      id: "item-1",
      type: "command_execution",
      command,
      aggregated_output: options.output ?? "",
      exit_code: options.exitCode ?? 0,
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
  readonly knowledgeCaptureDecision?: {
    readonly outcome: "persist" | "reuse" | "transient" | "unverified";
    readonly summary: string;
  };
};

function auditDiscovery(
  commands: readonly string[],
  overrides: DiscoveryOverrides,
) {
  const {
    skillLoads = [{
      sequence: 1,
      file: ".agents/skills/semantic-atlas/SKILL.md",
    }],
    sourceOpens = [{
      sequence: 1,
      file: "src/orders/order.service.ts",
      sourceTokens: 20,
    }],
    knowledgeCaptureDecision = {
      outcome: "reuse" as const,
      summary: "The verified business meaning is already represented in Atlas.",
    },
    ...evidenceOverrides
  } = overrides;
  const boundSourceOpens = sourceOpens.map((sourceOpen) => ({
    ...sourceOpen,
    commandSequence: sourceOpen.commandSequence ?? commands.findIndex((command) => (
      command.includes(` read ${sourceOpen.file}`)
    )) + 1,
    exitCode: sourceOpen.exitCode ?? 0,
  }));
  return auditFreshAgentSkillDiscovery(commands, skillLoads, {
    atlasCalls: [],
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
    knowledgeCaptureDecision,
    ...evidenceOverrides,
    sourceOpens: boundSourceOpens,
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

function mapViewEnvelope(nodes: unknown[]) {
  return {
    schemaVersion: 1,
    status: "ok",
    data: {
      command: "map.view",
      focus: null,
      breadcrumbs: [],
      regions: nodes.map((node) => ({ node, role: "root", childCount: 0, expandable: false })),
      connections: [],
    },
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
