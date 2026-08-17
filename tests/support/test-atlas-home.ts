import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll } from "vitest";

const atlasHome = mkdtempSync(join(tmpdir(), "semantic-atlas-vitest-home-"));
process.env.SEMANTIC_ATLAS_HOME = atlasHome;

afterAll(() => {
  rmSync(atlasHome, { recursive: true, force: true });
});
