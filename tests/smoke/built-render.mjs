import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const repositoryRoot = await mkdtemp(path.join(tmpdir(), "semantic-atlas-built-render-"));
const mapDirectory = path.join(repositoryRoot, "docs", "business-map");
const outputPath = path.join(repositoryRoot, "semantic-atlas.html");
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

try {
  await mkdir(mapDirectory, { recursive: true });
  await copyFile(
    path.join(packageRoot, "examples", "commerce.yaml"),
    path.join(mapDirectory, "commerce.yaml"),
  );

  const { stdout, stderr } = await execute(process.execPath, [
    path.join(packageRoot, "dist", "cli", "bin.js"),
    "render",
    "--repo",
    repositoryRoot,
    "--output",
    outputPath,
  ]);
  const resolvedRepositoryRoot = await realpath(repositoryRoot);

  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout), {
    schemaVersion: 1,
    ok: true,
    command: "render",
    repository: {
      root: resolvedRepositoryRoot,
      mapDirectory: "docs/business-map",
      documents: ["commerce.yaml"],
    },
    data: {
      format: "html",
      outputPath,
      nodeCount: 12,
      relationCount: 19,
    },
  });

  const projection = await readFile(outputPath, "utf8");
  assert.match(projection, /data-node-id="commerce\.orders\.place-order"/u);
  assert.match(projection, /data-channel="directed-relation"/u);
  assert.match(projection, /data-viewer-mode="export"/u);
  assert.match(projection, /data-action="zoom-in"/u);
  assert.match(projection, /id="node-details"/u);
  assert.match(projection, /preserveAspectRatio="xMidYMid meet"/u);
  assert.match(projection, /"value":"src\/catalog"/u);
  assert.doesNotMatch(projection, /class="node-card__anchor/u);
  assert.doesNotMatch(projection, /Business relationships, made visible\./u);
} finally {
  await rm(repositoryRoot, { recursive: true, force: true });
}
