import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import {
  access,
  appendFile,
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const packageIdentity = JSON.parse(
  await readFile(path.join(packageRoot, "package.json"), "utf8"),
);
const sandbox = await mkdtemp(path.join(os.tmpdir(), "semantic-atlas-package-"));
const archiveDirectory = path.join(sandbox, "archive");
const consumerDirectory = path.join(sandbox, "consumer");
const repositoryRoot = path.join(sandbox, "repository");
const userHome = path.join(sandbox, "home");
const renderedOutputPath = path.join(sandbox, "business-map.html");
const installedPackageRoot = path.join(
  consumerDirectory,
  "node_modules",
  packageIdentity.name,
);
const installedCli = path.join(installedPackageRoot, "dist", "cli", "bin.js");
const managedSkillDirectory = path.join(
  userHome,
  ".agents",
  "skills",
  "semantic-atlas",
);
const maintenanceSkillDirectory = path.join(
  userHome,
  ".agents",
  "skills",
  "semantic-atlas-maintenance",
);
const cliEnvironment = withoutRegistryCredentials({
  ...process.env,
  HOME: userHome,
  USERPROFILE: userHome,
  PATH: `${path.join(consumerDirectory, "node_modules", ".bin")}${path.delimiter}${process.env.PATH ?? ""}`,
});

try {
  await mkdir(archiveDirectory, { recursive: true });
  const archivePath = await packProduct(archiveDirectory);
  await assertPublicArchive(archivePath);

  await installPackedProduct(archivePath);
  await exerciseInstalledProduct();
  await exerciseInstalledObservations();
  await exerciseManagedSkillLifecycle();
  assert.equal(run("git", ["status", "--short"], repositoryRoot).stdout, "");
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

async function packProduct(directory) {
  run("pnpm", ["pack", "--pack-destination", directory], packageRoot);
  const archiveName = (await readdir(directory))
    .find((name) => name.endsWith(".tgz"));
  assert.ok(archiveName, "pnpm pack did not create an archive");
  return path.join(directory, archiveName);
}

async function assertPublicArchive(archivePath) {
  const entries = run("tar", ["-tzf", archivePath], packageRoot)
    .stdout.trim().split("\n");
  const requiredEntries = [
    "package/.agents/skills/semantic-atlas/SKILL.md",
    "package/.agents/skills/semantic-atlas/agents/openai.yaml",
    "package/.agents/skills/semantic-atlas/references/observations.md",
    "package/.agents/skills/semantic-atlas/scripts/query-context.mjs",
    "package/.agents/skills/semantic-atlas-maintenance/SKILL.md",
    "package/.agents/skills/semantic-atlas-maintenance/agents/openai.yaml",
    "package/.agents/skills/semantic-atlas-maintenance/references/reconciliation.md",
    "package/dist/cli/bin.js",
    "package/examples/commerce.yaml",
    "package/LICENSE",
    "package/package.json",
    "package/README.md",
    "package/README.zh-CN.md",
  ];
  const publicRoots = [
    "package/.agents/",
    "package/dist/",
    "package/docs/",
    "package/examples/",
    "package/LICENSE",
    "package/package.json",
    "package/README.md",
    "package/README.zh-CN.md",
  ];

  for (const requiredEntry of requiredEntries) {
    assert.ok(entries.includes(requiredEntry), `packed archive is missing ${requiredEntry}`);
  }
  for (const entry of entries) {
    assert.ok(
      publicRoots.some((root) => entry === root || entry.startsWith(root)),
      `packed archive exposes an unintended path: ${entry}`,
    );
  }

  const unpackedDirectory = path.join(sandbox, "unpacked");
  await mkdir(unpackedDirectory, { recursive: true });
  run("tar", ["-xzf", archivePath, "-C", unpackedDirectory], packageRoot);
  await assertPublicContents(unpackedDirectory);
}

async function installPackedProduct(archivePath) {
  await mkdir(consumerDirectory, { recursive: true });
  await writeFile(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "semantic-atlas-consumer", private: true }, null, 2)}\n`,
  );
  run(
    "pnpm",
    ["add", "--ignore-scripts", archivePath],
    consumerDirectory,
    cliEnvironment,
  );
}

async function exerciseInstalledProduct() {
  const mapDirectory = path.join(repositoryRoot, "docs", "business-map");
  await mkdir(mapDirectory, { recursive: true });
  await copyFile(
    path.join(installedPackageRoot, "examples", "commerce.yaml"),
    path.join(mapDirectory, "commerce.yaml"),
  );
  run("git", ["init", "--initial-branch=main"], repositoryRoot);
  run("git", ["config", "user.name", "Semantic Atlas Test"], repositoryRoot);
  run("git", ["config", "user.email", "semantic-atlas@example.invalid"], repositoryRoot);
  run("git", ["add", "docs/business-map/commerce.yaml"], repositoryRoot);
  run("git", ["commit", "-m", "test: create observation repository"], repositoryRoot);

  const version = runInstalledCli(["--version"]);
  assert.equal(version.stdout.trim(), packageIdentity.version);
  const publicModule = await import(
    pathToFileURL(path.join(installedPackageRoot, "dist", "index.js")).href
  );
  assert.equal(
    publicModule.taskObservationInputSchema.safeParse(
      taskObservation("public-schema-task", "public-schema-engineering-task"),
    ).success,
    true,
  );
  assert.equal(
    publicModule.reviewObservationInputSchema.safeParse(
      reviewObservation("public-schema-task"),
    ).success,
    true,
  );

  const resolvedRepositoryRoot = await realpath(repositoryRoot);
  const validate = runInstalledCli(["validate", "--repo", repositoryRoot]);
  assert.equal(validate.stderr, "");
  assert.deepEqual(JSON.parse(validate.stdout), {
    schemaVersion: 1,
    ok: true,
    command: "validate",
    repository: {
      root: resolvedRepositoryRoot,
      mapDirectory: "docs/business-map",
      documents: ["commerce.yaml"],
    },
    data: {
      documentCount: 1,
      nodeCount: 12,
      relationCount: 19,
      flowCount: 1,
    },
  });

  const context = runInstalledCli([
    "context",
    "Checkout",
    "--repo",
    repositoryRoot,
  ]);
  assert.equal(context.stderr, "");
  const contextData = JSON.parse(context.stdout).data;
  assert.equal(contextData.selected.id, "commerce.orders.place-order");
  assert.deepEqual(
    contextData.flows.map(({ id }) => id),
    ["commerce.orders.place-order-flow"],
  );

  const render = runInstalledCli([
    "render",
    "--repo",
    repositoryRoot,
    "--output",
    renderedOutputPath,
  ]);
  assert.equal(render.stderr, "");
  assert.equal(JSON.parse(render.stdout).data.outputPath, renderedOutputPath);
  assert.equal(JSON.parse(render.stdout).data.flowCount, 1);
  const projection = await readFile(renderedOutputPath, "utf8");
  assert.match(projection, /data-node-id="commerce\.orders\.place-order"/u);
  assert.match(projection, /data-channel="directed-relation"/u);
  assert.match(projection, /data-viewer-mode="export"/u);
  assert.match(projection, /data-action="zoom-in"/u);
  assert.match(projection, /data-view-type="flows"/u);
  assert.match(projection, /data-flow-view="commerce\.orders\.place-order-flow"/u);
  assert.match(projection, /id="node-details"/u);
  assert.match(projection, /preserveAspectRatio="xMidYMid meet"/u);
  assert.match(projection, /"value":"src\/catalog"/u);
  assert.doesNotMatch(projection, /class="node-card__anchor/u);

  await exerciseInstalledWeb();

  const packagedSkillAdapter = path.join(
    installedPackageRoot,
    ".agents",
    "skills",
    "semantic-atlas",
    "scripts",
    "query-context.mjs",
  );
  const packagedSkillContext = run(
    process.execPath,
    [packagedSkillAdapter, "Checkout", "--repo", repositoryRoot],
    consumerDirectory,
    cliEnvironment,
  );
  assert.equal(packagedSkillContext.stderr, "");
  assert.equal(
    JSON.parse(packagedSkillContext.stdout).data.selected.id,
    "commerce.orders.place-order",
  );
}

async function exerciseInstalledWeb() {
  const port = await reserveLoopbackPort();
  const child = spawn(process.execPath, [
    installedCli,
    "web",
    "--repo",
    repositoryRoot,
    "--port",
    String(port),
    "--no-open",
  ], {
    cwd: consumerDirectory,
    env: cliEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  try {
    const envelope = await waitForWebEnvelope(() => stdout, () => stderr, child);
    assert.deepEqual(envelope, {
      schemaVersion: 1,
      ok: true,
      command: "web",
      data: {
        url: `http://127.0.0.1:${port}`,
        repositoryCount: 1,
      },
    });
    const page = await fetch(envelope.data.url);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /data-viewer-mode="web"/u);
    assert.match(html, /data-map-view="commerce"/u);
    assert.match(html, /data-flow-view="commerce\.orders\.place-order-flow"/u);
    assert.match(html, /data-view-type="flows"/u);
    assert.match(html, /id="node-details"/u);
    assert.match(html, /preserveAspectRatio="xMidYMid meet"/u);
    assert.match(html, /"value":"src\/catalog"/u);
    assert.doesNotMatch(html, /class="node-card__anchor/u);
    assert.doesNotMatch(html, new RegExp(escapeRegularExpression(repositoryRoot), "u"));

    const mutation = await fetch(envelope.data.url, { method: "POST" });
    assert.equal(mutation.status, 405);
    assert.equal(mutation.headers.get("allow"), "GET, HEAD");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("installed Web server did not stop")), 5_000);
      child.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.once("error", reject);
    });
  }
}

async function waitForWebEnvelope(readStdout, readStderr, child) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    try {
      return JSON.parse(readStdout());
    } catch {
      if (child.exitCode !== null) {
        throw new Error(`installed Web server exited early: ${readStderr() || readStdout()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error(`installed Web server did not start: ${readStderr() || readStdout()}`);
}

async function reserveLoopbackPort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function exerciseInstalledObservations() {
  const observationWorktree = path.join(sandbox, "observation-worktree");
  run("git", ["worktree", "add", "--detach", observationWorktree, "HEAD"], repositoryRoot);

  const concurrentInputs = Array.from({ length: 12 }, (_, index) =>
    taskObservation(`installed-task-${index}`, `engineering-task-${index}`)
  );
  const concurrentResults = await Promise.all(concurrentInputs.map((input) =>
    runInstalledCliAsync([
      "observe",
      "task",
      "--stdin",
      "--repo",
      repositoryRoot,
    ], JSON.stringify(input))
  ));
  for (const result of concurrentResults) {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(JSON.parse(result.stdout).data.outcome, "recorded");
  }

  const observationRoot = path.join(
    userHome,
    ".semantic-atlas",
    "observations",
    "v1",
    "repositories",
  );
  const [repositoryPartition] = await readdir(observationRoot);
  assert.ok(repositoryPartition, "installed observation repository partition is missing");
  const replayInput = taskObservation("installed-shared-task", "shared-task");
  const replayResults = await Promise.all(Array.from({ length: 6 }, () =>
    runInstalledCliAsync([
      "observe",
      "task",
      "--stdin",
      "--repo",
      repositoryRoot,
    ], JSON.stringify(replayInput))
  ));
  assert.equal(
    replayResults.filter(({ stdout }) => JSON.parse(stdout).data.outcome === "recorded").length,
    1,
  );
  assert.equal(
    replayResults.filter(({ stdout }) => JSON.parse(stdout).data.outcome === "idempotent").length,
    5,
  );

  const conflictingReplay = runInstalledCliWithInput([
    "observe",
    "task",
    "--stdin",
    "--repo",
    repositoryRoot,
  ], JSON.stringify({
    ...replayInput,
    humanCorrection: {
      summary: "A person corrected the business boundary.",
      dimensions: ["business_boundary"],
    },
  }));
  assert.equal(conflictingReplay.status, 1);
  assert.equal(JSON.parse(conflictingReplay.stdout).error.code, "OBSERVATION_CONFLICT");

  const malformed = runInstalledCliWithInput([
    "observe",
    "task",
    "--stdin",
    "--repo",
    repositoryRoot,
  ], "{ incomplete");
  assert.equal(malformed.status, 1);
  assert.equal(JSON.parse(malformed.stdout).error.code, "OBSERVATION_INPUT_INVALID");

  const review = reviewObservation("installed-task-0");
  const reviewResult = runInstalledCliWithInput([
    "observe",
    "review",
    "--stdin",
    "--repo",
    observationWorktree,
  ], JSON.stringify(review));
  assert.equal(reviewResult.status, 0, reviewResult.stderr || reviewResult.stdout);

  const summary = JSON.parse(runInstalledCli([
    "insights",
    "summary",
    "--repo",
    repositoryRoot,
  ]).stdout);
  assert.deepEqual(summary.data.summary, {
    taskObservations: 13,
    reviewObservations: 1,
    approvedReviews: 1,
    businessBoundary: { correct: 1, incorrect: 0, notAssessed: 0 },
    upstreamCause: { correct: 1, incorrect: 0, notAssessed: 0, notApplicable: 0 },
    impactCompleteness: { complete: 1, incomplete: 0, notAssessed: 0 },
    requiredRework: 0,
    mapCausedRegressions: 0,
    humanCorrections: 0,
    recoveries: { stale: 1, missing: 0, contradicted: 0 },
  });

  const candidates = JSON.parse(runInstalledCli([
    "reconcile",
    "candidates",
    "--repo",
    observationWorktree,
  ]).stdout);
  assert.equal(candidates.schemaVersion, 1);
  assert.equal(candidates.command, "reconcile candidates");
  assert.deepEqual(candidates.data.summary, {
    businessDomains: 1,
    candidateGroups: 1,
    candidateOccurrences: 1,
    duplicateGroups: 0,
    waitingForEvidenceOccurrences: 0,
  });
  assert.equal(candidates.data.domains[0].businessDomainId, "commerce");
  assert.equal(
    candidates.data.domains[0].candidates[0].origins[0].reviews[0].review.verdict,
    "approved",
  );
  const required = JSON.parse(runInstalledCli([
    "reconcile",
    "status",
    "--repo",
    observationWorktree,
  ]).stdout);
  assert.equal(required.command, "reconcile status");
  assert.deepEqual(required.data, { required: true });

  const maintenance = maintenanceObservation("installed-task-0");
  const maintenanceResult = runInstalledCliWithInput([
    "observe",
    "maintenance",
    "--stdin",
    "--repo",
    observationWorktree,
  ], JSON.stringify(maintenance));
  assert.equal(
    maintenanceResult.status,
    0,
    maintenanceResult.stderr || maintenanceResult.stdout,
  );
  const maintenanceReceipt = JSON.parse(maintenanceResult.stdout).data;
  assert.equal(maintenanceReceipt.outcome, "recorded");
  assert.equal(maintenanceReceipt.kind, "maintenance");
  assert.equal(maintenanceReceipt.id, maintenance.id);
  assert.equal(
    maintenanceReceipt.path.endsWith("/maintenances/installed-maintenance-0.json"),
    true,
  );

  const reconciled = JSON.parse(runInstalledCli([
    "reconcile",
    "candidates",
    "--repo",
    observationWorktree,
  ]).stdout);
  assert.deepEqual(reconciled.data.summary, {
    businessDomains: 0,
    candidateGroups: 0,
    candidateOccurrences: 0,
    duplicateGroups: 0,
    waitingForEvidenceOccurrences: 0,
  });
  assert.deepEqual(reconciled.data.domains, []);
  const current = JSON.parse(runInstalledCli([
    "reconcile",
    "status",
    "--repo",
    observationWorktree,
  ]).stdout);
  assert.deepEqual(current.data, { required: false });

  const observationEntries = await readdir(observationRoot, { recursive: true });
  const observationFiles = observationEntries
    .filter((entry) => entry.endsWith(".json"));
  assert.equal(observationFiles.length, 15);
  assert.equal(
    observationEntries.some((entry) => entry.endsWith(".tmp") || entry.endsWith(".lock")),
    false,
  );
  for (const relativePath of observationFiles) {
    const document = await readFile(path.join(observationRoot, relativePath), "utf8");
    assert.doesNotThrow(() => JSON.parse(document));
    assert.equal(document.includes(repositoryRoot), false);
    assert.equal(document.includes(observationWorktree), false);
  }
}

function taskObservation(id, taskId) {
  return {
    schemaVersion: 2,
    id,
    recordedAt: "2026-08-27T04:00:00.000Z",
    task: { taskId, runId: `${taskId}-run` },
    map: {
      queries: [{
        selector: "Checkout",
        outcome: "context",
        selectedConceptIds: ["commerce.orders.place-order"],
      }],
      dispositions: [{
        status: "stale",
        summary: "Current source confirmed the operation at a replacement anchor.",
        evidence: [{ kind: "source", reference: "src/orders/place-order.ts" }],
      }],
    },
    mapUpdateCandidates: id === "installed-task-0"
      ? [{
          businessDomainId: "commerce",
          kind: "anchor",
          disposition: "confirmed",
          summary: "Replace the stale checkout source anchor.",
          evidence: [{ kind: "source", reference: "src/orders/place-order.ts" }],
        }]
      : [],
  };
}

function reviewObservation(taskObservationId) {
  return {
    schemaVersion: 1,
    id: "installed-review-0",
    recordedAt: "2026-08-27T04:30:00.000Z",
    taskObservationId,
    review: {
      taskId: "installed-review-task",
      runId: "installed-review-run",
      verdict: "approved",
      businessBoundary: "correct",
      upstreamCause: "correct",
      impactCompleteness: "complete",
      requiredRework: false,
      mapCausedRegression: false,
    },
  };
}

function maintenanceObservation(taskObservationId) {
  return {
    schemaVersion: 1,
    id: "installed-maintenance-0",
    recordedAt: "2026-08-27T05:00:00.000Z",
    maintenance: {
      taskId: "installed-maintenance-task",
      runId: "installed-maintenance-run",
    },
    businessDomainId: "commerce",
    results: [{
      candidate: { taskObservationId, candidateIndex: 0 },
      status: "discarded",
      reason: "Current evidence shows this anchor is an implementation detail.",
      evidence: [{ kind: "source", reference: "src/orders/place-order.ts" }],
    }],
  };
}

async function exerciseManagedSkillLifecycle() {
  const siblingSkill = path.join(userHome, ".agents", "skills", "user-owned-skill");
  const repositoryDocument = path.join(repositoryRoot, "docs", "business-map", "commerce.yaml");
  const repositoryDocumentBeforeSetup = await readFile(repositoryDocument, "utf8");
  await mkdir(siblingSkill, { recursive: true });
  await writeFile(path.join(siblingSkill, "keep.txt"), "user-owned\n");

  const firstSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(firstSetup.ok, true);
  assert.equal(firstSetup.command, "setup");
  assert.equal(firstSetup.data.skills.length, 2);
  const primarySetup = setupSkill(firstSetup, "semantic-atlas");
  const maintenanceSetup = setupSkill(firstSetup, "semantic-atlas-maintenance");
  assert.equal(primarySetup.outcome, "installed");
  assert.equal(primarySetup.targetDirectory, managedSkillDirectory);
  assert.deepEqual(primarySetup.identity, {
    packageName: packageIdentity.name,
    packageVersion: packageIdentity.version,
    skillName: "semantic-atlas",
    fingerprint: primarySetup.identity.fingerprint,
  });
  assert.equal(maintenanceSetup.outcome, "installed");
  assert.equal(maintenanceSetup.targetDirectory, maintenanceSkillDirectory);
  assert.equal(maintenanceSetup.identity.packageVersion, packageIdentity.version);
  assert.match(primarySetup.identity.fingerprint, /^[a-f0-9]{64}$/u);
  assert.match(maintenanceSetup.identity.fingerprint, /^[a-f0-9]{64}$/u);

  const marker = JSON.parse(
    await readFile(
      path.join(managedSkillDirectory, ".semantic-atlas-managed.json"),
      "utf8",
    ),
  );
  assert.deepEqual(marker, {
    schemaVersion: 1,
    managedBy: "semantic-atlas",
    packageName: packageIdentity.name,
    packageVersion: packageIdentity.version,
    skillName: "semantic-atlas",
    fingerprint: primarySetup.identity.fingerprint,
  });

  const maintenanceMarker = JSON.parse(
    await readFile(
      path.join(maintenanceSkillDirectory, ".semantic-atlas-managed.json"),
      "utf8",
    ),
  );
  assert.equal(maintenanceMarker.skillName, "semantic-atlas-maintenance");
  assert.equal(maintenanceMarker.packageVersion, packageIdentity.version);

  const repeatedSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.deepEqual(
    repeatedSetup.data.skills.map(({ outcome }) => outcome),
    ["current", "current"],
  );

  const installedSkillDocument = path.join(maintenanceSkillDirectory, "SKILL.md");
  await appendFile(installedSkillDocument, "\nmodified managed copy\n");
  const repairedSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(setupSkill(repairedSetup, "semantic-atlas").outcome, "current");
  assert.equal(
    setupSkill(repairedSetup, "semantic-atlas-maintenance").outcome,
    "repaired",
  );
  assert.equal(
    await readFile(installedSkillDocument, "utf8"),
    await readFile(
      path.join(
        installedPackageRoot,
        ".agents",
        "skills",
        "semantic-atlas-maintenance",
        "SKILL.md",
      ),
      "utf8",
    ),
  );

  const backupDirectory = `${managedSkillDirectory}.backup`;
  const orphanStage = `${managedSkillDirectory}.installing-interrupted`;
  await rename(managedSkillDirectory, backupDirectory);
  await mkdir(orphanStage, { recursive: true });
  await writeFile(path.join(orphanStage, "partial.txt"), "partial replacement\n");
  await copyFile(
    path.join(backupDirectory, ".semantic-atlas-managed.json"),
    path.join(orphanStage, ".semantic-atlas-managed.json"),
  );
  const recoveredSetup = JSON.parse(runInstalledCli(["setup"]).stdout);
  assert.equal(setupSkill(recoveredSetup, "semantic-atlas").outcome, "recovered");
  await assertMissing(backupDirectory);
  await assertMissing(orphanStage);

  const managedAdapter = path.join(
    managedSkillDirectory,
    "scripts",
    "query-context.mjs",
  );
  const managedContext = run(
    process.execPath,
    [managedAdapter, "Checkout", "--repo", repositoryRoot],
    consumerDirectory,
    cliEnvironment,
  );
  assert.equal(JSON.parse(managedContext.stdout).data.selected.id, "commerce.orders.place-order");

  const fakeBin = path.join(sandbox, "incompatible-bin");
  const fakeCli = path.join(fakeBin, "semantic-atlas");
  const misleadingHomeCli = path.join(userHome, "dist", "cli", "bin.js");
  await mkdir(fakeBin, { recursive: true });
  await mkdir(path.dirname(misleadingHomeCli), { recursive: true });
  await writeFile(
    fakeCli,
    "#!/usr/bin/env node\nprocess.stdout.write('0.4.0\\n');\n",
  );
  await writeFile(
    misleadingHomeCli,
    "process.stdout.write(JSON.stringify({ schemaVersion: 1, ok: true, command: 'context' }) + '\\n');\n",
  );
  await chmod(fakeCli, 0o755);
  const incompatible = runCommand(
    process.execPath,
    [managedAdapter, "Checkout", "--repo", repositoryRoot],
    consumerDirectory,
    {
      ...cliEnvironment,
      PATH: `${fakeBin}${path.delimiter}${cliEnvironment.PATH}`,
    },
  );
  assert.equal(incompatible.status, 2);
  assert.match(incompatible.stderr, /requires CLI .* but 0\.4\.0 is available/u);

  await rm(managedSkillDirectory, { recursive: true });
  await mkdir(managedSkillDirectory, { recursive: true });
  const unrelatedDocument = "---\nname: semantic-atlas\n---\n\n# User-owned Skill\n";
  await writeFile(path.join(managedSkillDirectory, "SKILL.md"), unrelatedDocument);
  const conflict = runInstalledCliAllowFailure(["setup"]);
  assert.equal(conflict.status, 1);
  assert.deepEqual(JSON.parse(conflict.stdout), {
    schemaVersion: 1,
    ok: false,
    command: "setup",
    error: {
      code: "MANAGED_SKILL_CONFLICT",
      message: `Refusing to replace '${managedSkillDirectory}' because it is not a recognized managed Semantic Atlas Skill`,
      directory: managedSkillDirectory,
    },
  });
  assert.equal(
    await readFile(path.join(managedSkillDirectory, "SKILL.md"), "utf8"),
    unrelatedDocument,
  );
  assert.equal(await readFile(path.join(siblingSkill, "keep.txt"), "utf8"), "user-owned\n");
  assert.equal(await readFile(repositoryDocument, "utf8"), repositoryDocumentBeforeSetup);
}

async function assertPublicContents(unpackedDirectory) {
  const relativeEntries = await readdir(unpackedDirectory, { recursive: true });
  const forbiddenPath = /(?:^|\/)(?:\.worktrees|tmp|tests|tasks|prompts|answers|oracles)(?:\/|$)/u;
  const forbiddenContents = [
    ["absolute macOS path", /\/Users\/[^\s"']+/u],
    ["absolute Linux home path", /\/home\/[^\s"']+/u],
    ["absolute Windows user path", /[A-Z]:\\Users\\[^\s"']+/iu],
    ["Codrive task identity", /\b(?:task|attempt|report_opportunity)_[a-f0-9-]{8,}\b/iu],
    ["private repository identity", /\b(?:pietra-ex-api|Pietra)\b/u],
    ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
    ["credential-like token", /\b(?:ghp_|github_pat_|npm_|sk-)[A-Za-z0-9_-]{12,}/u],
  ];

  for (const relativePath of relativeEntries) {
    const normalizedPath = relativePath.split(path.sep).join("/");
    assert.doesNotMatch(normalizedPath, forbiddenPath);
    const absolutePath = path.join(unpackedDirectory, relativePath);
    if (!(await stat(absolutePath)).isFile()) continue;
    const contents = await readFile(absolutePath);
    if (contents.includes(0)) continue;
    const text = contents.toString("utf8");
    for (const [label, pattern] of forbiddenContents) {
      assert.doesNotMatch(text, pattern, `${normalizedPath} contains ${label}`);
    }
    if (normalizedPath.endsWith(".md")) {
      assert.doesNotMatch(
        text,
        /\b[0-9a-f]{7,40}\b/gu,
        `${normalizedPath} contains a source revision`,
      );
    }
  }
}

function setupSkill(envelope, skillName) {
  const skill = envelope.data.skills.find(({ identity }) => identity.skillName === skillName);
  assert.ok(skill, `setup result is missing ${skillName}`);
  return skill;
}

function runInstalledCli(arguments_) {
  return run(process.execPath, [installedCli, ...arguments_], consumerDirectory, cliEnvironment);
}

function runInstalledCliAllowFailure(arguments_) {
  return runCommand(
    process.execPath,
    [installedCli, ...arguments_],
    consumerDirectory,
    cliEnvironment,
  );
}

function runInstalledCliWithInput(arguments_, input) {
  return runCommand(
    process.execPath,
    [installedCli, ...arguments_],
    consumerDirectory,
    cliEnvironment,
    input,
  );
}

function runInstalledCliAsync(arguments_, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installedCli, ...arguments_], {
      cwd: consumerDirectory,
      env: cliEnvironment,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function assertMissing(filePath) {
  await assert.rejects(access(filePath));
}

function run(command, arguments_, cwd, environment = process.env) {
  const result = runCommand(command, arguments_, cwd, environment);
  assert.equal(
    result.status,
    0,
    `${command} ${arguments_.join(" ")} failed:\n${result.stderr || result.stdout}`,
  );
  return result;
}

function runCommand(command, arguments_, cwd, environment = process.env, input) {
  return spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: environment,
    input,
  });
}

function withoutRegistryCredentials(environment) {
  return Object.fromEntries(Object.entries(environment).filter(([name]) =>
    !/(?:AUTH|TOKEN|NPM_CONFIG_USERCONFIG)/iu.test(name)
  ));
}
