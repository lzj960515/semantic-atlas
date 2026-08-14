import { describe, expect, it } from "vitest";

import {
  auditCodexCommands,
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
