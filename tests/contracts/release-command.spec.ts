import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Semantic Atlas release command", () => {
  it("delegates authenticated npm publication to GitHub Actions", async () => {
    const [instructions, workflow] = await Promise.all([
      readFile(resolve(".claude/commands/release.md"), "utf8"),
      readFile(resolve(".github/workflows/release.yml"), "utf8"),
    ]);

    expect(instructions).toContain("GitHub Actions");
    expect(instructions).toContain("git push origin main --follow-tags");
    expect(instructions).toContain("gh release create");
    expect(instructions).toContain("--verify-tag");
    expect(instructions).toContain("gh run watch");
    expect(instructions).toContain("pnpm package:verify");
    expect(instructions).toContain(
      "README installation references stay version-independent",
    );
    expect(instructions).not.toContain("PREVIOUS_VERSION");
    expect(instructions).not.toContain("writeFileSync");
    expect(instructions).toContain('npm view "semantic-atlas@${version}"');
    expect(instructions).not.toContain("npm whoami");
    expect(instructions).not.toContain("npm publish");
    expect(instructions).not.toContain("pnpm publish");

    expect(workflow).toMatch(
      /release:\s*\n\s*types:\s*\n\s*- published/,
    );
    expect(workflow).toContain("environment: npm");
    expect(workflow).toContain("node-version: 24");
    expect(workflow).toContain(
      "registry-url: https://registry.npmjs.org",
    );
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("pnpm typecheck");
    expect(workflow).toContain("pnpm contracts:check");
    expect(workflow).toContain("pnpm test");
    expect(workflow).toContain("pnpm build");
    expect(workflow).toContain("pnpm package:verify");
    expect(workflow).toContain("--provenance");
    expect(workflow).toContain(
      "NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}",
    );
    expect(workflow).toContain(
      "RELEASE_TAG: ${{ github.event.release.tag_name }}",
    );
  });

  it("tracks the latest CLI and installs its exact bundled Skill without version rewrites", async () => {
    const readmes = await Promise.all(
      ["README.md", "README.zh-CN.md"].map((readme) =>
        readFile(resolve(readme), "utf8"),
      ),
    );

    for (const readme of readmes) {
      expect(readme).toContain("npm install --global semantic-atlas");
      expect(readme).not.toMatch(/npm install --global semantic-atlas@/);
      expect(readme).toContain("semantic-atlas setup");
      expect(readme).toContain("semantic-atlas upgrade");
      expect(readme).toContain("~/.agents/skills/semantic-atlas");
      expect(readme).not.toContain("$skill-installer");
    }
  });
});
