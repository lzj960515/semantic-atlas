import { describe, expect, it } from "vitest";

import {
  buildCodexIsolationArguments,
} from "../../scripts/evaluation/codex-agent-isolation.js";

describe("Fresh Agent Codex isolation", () => {
  it("disables host tools and every discovered host Skill", () => {
    const arguments_ = buildCodexIsolationArguments([
      "/Users/test/.agents/skills/typeorm/SKILL.md",
      "/Users/test/.codex/skills/review/SKILL.md",
    ], ["database"]);

    expect(arguments_).toEqual([
      "--ignore-rules",
      "--disable",
      "plugins",
      "--disable",
      "remote_plugin",
      "--disable",
      "apps",
      "--disable",
      "hooks",
      "--disable",
      "skill_search",
      "--config",
      "mcp_servers.database.enabled=false",
      "--config",
      "skills.config=[{path=\"/Users/test/.agents/skills/typeorm/SKILL.md\",enabled=false},{path=\"/Users/test/.codex/skills/review/SKILL.md\",enabled=false}]",
    ]);
  });

  it("rejects MCP server IDs that cannot be disabled with a bare dotted key", () => {
    expect(() => buildCodexIsolationArguments([], ["invalid.server"])).toThrow(
      /Unsupported Codex MCP server ID/,
    );
  });
});
