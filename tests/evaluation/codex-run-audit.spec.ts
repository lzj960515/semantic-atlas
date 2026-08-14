import { describe, expect, it } from "vitest";

import { auditCodexRun } from "../../scripts/evaluation/codex-run-audit.js";

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
  });

  it("rejects direct commands that return source text", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      completedCommand("/bin/zsh -lc \"rg -n 'placeOrder' src\""),
      { type: "turn.completed", usage: {} },
    ]))).toThrow(/unobserved source output/);
  });

  it("allows host Skill instructions outside the fixture", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      completedCommand("/bin/zsh -lc \"sed -n '1,240p' /Users/test/.agents/skills/typeorm/SKILL.md\""),
      { type: "turn.completed", usage: {} },
    ]))).not.toThrow();
  });

  it("allows filtering an rg file-name listing without opening source", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      completedCommand("/bin/zsh -lc \"rg --files -g '!node_modules' | sed -n '1,240p'\""),
      { type: "turn.completed", usage: {} },
    ]))).not.toThrow();
  });

  it("does not let an observer or host Skill read mask a chained source read", () => {
    for (const command of [
      "/bin/zsh -lc '$EVALUATION_OBSERVER read src/order.ts; cat src/secret.ts'",
      "/bin/zsh -lc \"sed -n '1,40p' /Users/test/.agents/skills/typeorm/SKILL.md; cat src/secret.ts\"",
    ]) {
      expect(() => auditCodexRun("no-atlas", jsonLines([
        completedCommand(command),
        { type: "turn.completed", usage: {} },
      ]))).toThrow(/unobserved source output/);
    }
  });

  it("rejects Atlas commands in no-Atlas mode", () => {
    expect(() => auditCodexRun("no-atlas", jsonLines([
      completedCommand("/bin/zsh -lc 'semantic-atlas status'"),
      { type: "turn.completed", usage: {} },
    ]))).toThrow(/no-atlas run invoked Semantic Atlas/);
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
