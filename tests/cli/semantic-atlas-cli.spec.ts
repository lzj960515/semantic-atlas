import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cliEnvelopeSchema, type CliEnvelope } from "../../src/contracts/cli.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly envelope: CliEnvelope;
}

describe("semantic-atlas CLI", () => {
  const fixtures: GitFixture[] = [];
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it("provides repository-independent help, version, and Skill setup commands", async () => {
    const nonRepository = await mkdtemp(join(tmpdir(), "semantic-atlas-standalone-"));
    const userHome = await mkdtemp(join(tmpdir(), "semantic-atlas-user-home-"));
    temporaryDirectories.push(nonRepository, userHome);

    const help = await runTextCli(["-h"], nonRepository, userHome);
    const longHelp = await runTextCli(["--help"], nonRepository, userHome);
    const version = await runTextCli(["--version"], nonRepository, userHome);
    const setup = await runTextCli(["setup"], nonRepository, userHome);
    const repeatedSetup = await runTextCli(["setup"], nonRepository, userHome);
    const packageVersion = (JSON.parse(
      await readFile(join(projectRoot(), "package.json"), "utf8"),
    ) as { version: string }).version;
    const installedSkill = join(userHome, ".agents", "skills", "semantic-atlas");

    expect(help).toMatchObject({ exitCode: 0, stderr: "" });
    expect(help.stdout).toContain("Usage: semantic-atlas <command> [options]");
    expect(help.stdout).toContain("setup");
    expect(help.stdout).toContain("map view [business-key]");
    expect(longHelp).toEqual(help);
    expect(version).toEqual({ exitCode: 0, stdout: `${packageVersion}\n`, stderr: "" });
    expect(setup).toMatchObject({ exitCode: 0, stderr: "" });
    expect(setup.stdout).toContain(installedSkill);
    expect(repeatedSetup.stdout).toContain("already current");
    expect(await readFile(join(installedSkill, "SKILL.md"), "utf8"))
      .toContain("name: semantic-atlas");
    expect(JSON.parse(
      await readFile(join(installedSkill, ".semantic-atlas-managed.json"), "utf8"),
    )).toMatchObject({ version: packageVersion, fingerprint: expect.any(String) });
  });

  it("reports a missing index from cwd and through global repository options", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const nestedDirectory = join(fixture.directory, "src", "nested");
    await mkdir(nestedDirectory, { recursive: true });

    const fromCurrentDirectory = await runCli(["status"], nestedDirectory);
    const fromRepositoryOption = await runCli([
      "--pretty",
      "--repo",
      fixture.directory,
      "status",
    ], projectRoot());

    expect(fromCurrentDirectory).toMatchObject({ exitCode: 0, stderr: "" });
    expect(fromCurrentDirectory.envelope).toMatchObject({
      schemaVersion: 1,
      status: "ok",
      snapshot: null,
      data: {
        command: "status",
        freshness: "missing",
        languages: [{ language: "typescript", support: "supported" }],
      },
    });
    expect(fromRepositoryOption.envelope).toEqual(fromCurrentDirectory.envelope);
    expect(fromRepositoryOption.stdout).toContain("\n  \"schemaVersion\"");
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("returns structured nonzero failures for invalid input and unsupported locations", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const nonRepository = await mkdtemp(join(tmpdir(), "semantic-atlas-cli-non-repo-"));
    temporaryDirectories.push(nonRepository);

    const invalid = await runCli(["map", "show", "module:src"], fixture.directory);
    const legacyRoots = await runCli(["map", "roots"], fixture.directory);
    const legacyChildren = await runCli(["map", "children", "fixture"], fixture.directory);
    const legacyDepth = await runCli(["map", "show", "fixture", "--depth", "1"], fixture.directory);
    const unsupported = await runCli(["status"], nonRepository);

    expect(invalid).toMatchObject({
      exitCode: 2,
      envelope: {
        status: "error",
        data: {
          command: "map.show",
          error: { code: "INVALID_INPUT" },
        },
      },
    });
    expect(unsupported).toMatchObject({
      exitCode: 3,
      envelope: {
        status: "error",
        repository: null,
        data: {
          command: "status",
          error: { code: "REPOSITORY_NOT_FOUND" },
        },
      },
    });
    expect(legacyRoots.exitCode).toBe(2);
    expect(legacyChildren.exitCode).toBe(2);
    expect(legacyDepth).toMatchObject({
      exitCode: 2,
      envelope: {
        status: "error",
        data: { command: "map.show", error: { code: "INVALID_INPUT" } },
      },
    });
    expect(invalid.stdout.trim().split("\n")).toHaveLength(1);
    expect(unsupported.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("describes unsupported languages and refuses to index an unsupported repository", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    await fixture.git("rm", "src/example.ts");
    await fixture.write("src/example.py", "value = 1\n");
    await fixture.git("add", ".");
    await fixture.git("commit", "-m", "test: use an unsupported language");

    const status = await runCli(["status"], fixture.directory);
    const index = await runCli(["index"], fixture.directory);

    expect(status.envelope).toMatchObject({
      status: "partial",
      data: {
        command: "status",
        languages: [{
          language: "python",
          support: "unsupported",
          reason: expect.any(String),
        }],
      },
      warnings: [expect.objectContaining({ code: "UNSUPPORTED_LANGUAGE" })],
    });
    expect(index).toMatchObject({
      exitCode: 3,
      envelope: {
        status: "error",
        data: {
          command: "index",
          error: { code: "UNSUPPORTED_REPOSITORY" },
        },
      },
    });
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all")).toBe("");
  });

  it("reports structural fact changes in one stable unit across incremental indexes", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);

    const initial = requireData(
      await runCli(["index"], fixture.directory, undefined, 60_000),
      "index",
    );
    const initialTotal = structuralFactTotal(initial);
    expect(initial.facts).toEqual({
      added: initialTotal,
      changed: 0,
      reused: 0,
      removed: 0,
    });

    const unchanged = requireData(
      await runCli(["index"], fixture.directory, undefined, 60_000),
      "index",
    );
    expect(unchanged.facts).toEqual({
      added: 0,
      changed: 0,
      reused: initialTotal,
      removed: 0,
    });

    await fixture.write(
      "src/added.ts",
      [
        "export const first = 1;",
        "export const second = first + 1;",
        "export function total(): number {",
        "  return first + second;",
        "}",
        "",
      ].join("\n"),
    );
    const added = requireData(
      await runCli(["index"], fixture.directory, undefined, 60_000),
      "index",
    );
    const addedTotal = structuralFactTotal(added);
    expect(added.facts).toEqual({
      added: addedTotal - initialTotal,
      changed: 0,
      reused: initialTotal,
      removed: 0,
    });
    expect(added.facts.added).toBeGreaterThan(1);

    await fixture.write(
      "src/added.ts",
      [
        "",
        "export const first = 1;",
        "export const second = first + 1;",
        "export function total(): number {",
        "  return first + second;",
        "}",
        "",
      ].join("\n"),
    );
    const changed = requireData(
      await runCli(["index"], fixture.directory, undefined, 60_000),
      "index",
    );
    const changedTotal = structuralFactTotal(changed);
    expect(changed.facts.added).toBe(0);
    expect(changed.facts.changed).toBeGreaterThan(1);
    expect(changed.facts.removed).toBe(0);
    expect(changed.facts.added + changed.facts.changed + changed.facts.reused)
      .toBe(changedTotal);

    await fixture.git("clean", "-f", "src/added.ts");
    const removed = requireData(
      await runCli(["index"], fixture.directory, undefined, 60_000),
      "index",
    );
    const removedTotal = structuralFactTotal(removed);
    expect(removedTotal).toBe(initialTotal);
    expect(removed.facts).toEqual({
      added: 0,
      changed: 0,
      reused: initialTotal,
      removed: changedTotal - initialTotal,
    });
  }, 120_000);

  it("indexes, maps, learns, rejects stale reads, and reports semantic changes", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);

    const missingMap = await runCli(["map", "view"], fixture.directory);
    expect(missingMap).toMatchObject({
      exitCode: 4,
      envelope: {
        status: "error",
        data: {
          command: "map.view",
          error: { code: "ATLAS_STATE_MISSING" },
        },
      },
    });

    const initialIndex = await runCli(["index"], fixture.directory, undefined, 60_000);
    expect(initialIndex).toMatchObject({
      exitCode: 0,
      envelope: {
        status: "ok",
        snapshot: {
          id: expect.stringMatching(/^[0-9a-f]{64}$/u),
          freshness: "current",
        },
        data: {
          command: "index",
          snapshotId: expect.stringMatching(/^[0-9a-f]{64}$/u),
        },
      },
    });
    const initialIndexData = requireData(initialIndex, "index");
    const initialSnapshotId = initialIndexData.snapshotId;
    expect(initialIndexData.unknowns.added).toBe(initialIndexData.unknowns.total);

    const worldView = await runCli(["map", "view"], fixture.directory);
    expect(worldView).toMatchObject({
      exitCode: 0,
      envelope: {
        status: "partial",
        data: {
          command: "map.view",
          focus: null,
          breadcrumbs: [],
          regions: [],
          connections: [],
        },
        warnings: [{ code: "BUSINESS_KNOWLEDGE_EMPTY" }],
      },
    });

    const search = await runCli([
      "code",
      "search",
      "value",
      "--limit",
      "5",
      "--repo",
      fixture.directory,
    ], projectRoot());
    const structuralValue = requireData(search, "code.search").results
      .map((result) => result.node)
      .find((node) => node.domain === "structural" && node.kind === "Symbol");
    if (
      structuralValue === undefined
      || structuralValue.domain !== "structural"
      || !("locations" in structuralValue)
      || !Array.isArray(structuralValue.locations)
    ) {
      throw new Error("Expected a structural value result");
    }
    const evidence = structuralValue.locations[0];
    if (evidence === undefined) {
      throw new Error("Expected structural source evidence");
    }

    const patch = {
      schemaVersion: 1,
      baseSnapshotId: initialSnapshotId,
      nodeOperations: [{
        op: "upsert",
        node: {
          key: "fixture",
          kind: "Capability",
          label: "Fixture capability",
          summary: "Owns the fixture value.",
          aliases: ["fixture value"],
          certainty: "exact",
          evidence: [{
            symbolId: structuralValue.id,
            file: evidence.file,
            range: evidence.range,
            contentHash: evidence.contentHash,
          }],
        },
      }],
      relationOperations: [],
    };
    const learned = await runCli(
      ["--repo", fixture.directory, "learn", "--stdin"],
      projectRoot(),
      JSON.stringify(patch),
    );
    expect(requireData(learned, "learn")).toMatchObject({
      baseSnapshotId: initialSnapshotId,
      applied: { nodeOperations: 1, relationOperations: 0 },
    });
    const malformedJson = await runCli(
      ["learn", "--stdin"],
      fixture.directory,
      "{",
    );
    expect(malformedJson).toMatchObject({
      exitCode: 2,
      envelope: {
        status: "error",
        data: { command: "learn", error: { code: "INVALID_INPUT" } },
      },
    });
    const rejectedPatch = await runCli(
      ["learn", "--stdin"],
      fixture.directory,
      JSON.stringify({ ...patch, schemaVersion: 2 }),
    );
    expect(rejectedPatch).toMatchObject({
      exitCode: 2,
      envelope: {
        status: "error",
        data: { command: "learn", error: { code: "INVALID_INPUT" } },
      },
    });

    const businessWorld = await runCli(["map", "view"], fixture.directory);
    expect(requireData(businessWorld, "map.view")).toMatchObject({
      focus: null,
      regions: [{
        node: { domain: "business", key: "fixture", validity: "valid" },
        role: "root",
        childCount: 0,
        expandable: false,
      }],
    });
    const focusedBusiness = await runCli(["map", "view", "fixture"], fixture.directory);
    expect(requireData(focusedBusiness, "map.view")).toMatchObject({
      focus: { key: "fixture" },
      breadcrumbs: [{ key: "fixture" }],
      regions: [],
      connections: [],
    });
    const missingFocus = await runCli(["map", "view", "missing-capability"], fixture.directory);
    expect(missingFocus).toMatchObject({
      exitCode: 2,
      envelope: {
        status: "error",
        data: { command: "map.view", error: { code: "INVALID_INPUT" } },
      },
    });
    const shownBusiness = await runCli(["map", "show", "fixture"], fixture.directory);
    expect(requireData(shownBusiness, "map.show")).toMatchObject({
      node: { domain: "business", key: "fixture" },
      relations: [],
    });
    const searchedBusiness = await runCli(["map", "search", "fixture"], fixture.directory);
    expect(requireData(searchedBusiness, "map.search").results).toEqual([
      expect.objectContaining({ node: expect.objectContaining({ key: "fixture" }) }),
    ]);

    await fixture.write("src/example.ts", "export const value = 2;\n");
    const staleMap = await runCli(["map", "view"], fixture.directory);
    expect(staleMap).toMatchObject({
      exitCode: 4,
      envelope: {
        status: "error",
        data: {
          command: "map.view",
          error: { code: "ATLAS_STATE_STALE" },
        },
      },
    });
    expect(staleMap.envelope.snapshot).toMatchObject({
      id: initialSnapshotId,
      freshness: "stale",
    });

    const changedIndex = await runCli(["index"], fixture.directory, undefined, 60_000);
    const changedIndexData = requireData(changedIndex, "index");
    const changedSnapshotId = changedIndexData.snapshotId;
    expect(changedSnapshotId).not.toBe(initialSnapshotId);
    expect(changedIndexData.unknowns).toMatchObject({ added: 0, resolved: 0 });
    const staleWorld = await runCli(["map", "view"], fixture.directory);
    expect(staleWorld.envelope).toMatchObject({
      status: "partial",
      data: {
        command: "map.view",
        regions: [{ node: expect.objectContaining({ key: "fixture", validity: "stale" }) }],
      },
    });
    const changes = await runCli([
      "changes",
      "--from",
      initialSnapshotId,
      "--to",
      changedSnapshotId,
      "--repo",
      fixture.directory,
    ], projectRoot());
    expect(requireData(changes, "changes")).toMatchObject({
      fromSnapshotId: initialSnapshotId,
      toSnapshotId: changedSnapshotId,
      nodes: { changed: ["file:src/example.ts"] },
      staleAssertions: ["fixture"],
    });
    expect(changes.envelope.status).toBe("partial");
    const unknownRange = await runCli([
      "changes",
      "--from",
      "a".repeat(64),
      "--to",
      changedSnapshotId,
    ], fixture.directory);
    expect(unknownRange).toMatchObject({
      exitCode: 4,
      envelope: {
        status: "error",
        data: { command: "changes", error: { code: "CHANGE_RANGE_NOT_FOUND" } },
      },
    });
    expect(await fixture.git("status", "--porcelain", "--untracked-files=all"))
      .toBe("M src/example.ts");
  }, 120_000);
});

function projectRoot(): string {
  return join(import.meta.dirname, "..", "..");
}

async function runCli(
  arguments_: readonly string[],
  cwd: string,
  input?: string,
  timeout = 20_000,
): Promise<CliResult> {
  const child = spawn(
    join(projectRoot(), "node_modules", ".bin", "tsx"),
    [join(projectRoot(), "src", "cli", "bin.ts"), ...arguments_],
    { cwd, stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(input);

  const exitCode = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI timed out after ${timeout}ms`));
    }, timeout);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
  const envelope = cliEnvelopeSchema.parse(JSON.parse(stdout)) as CliEnvelope;
  return { exitCode, stdout, stderr, envelope };
}

async function runTextCli(
  arguments_: readonly string[],
  cwd: string,
  userHome: string,
): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  const child = spawn(
    join(projectRoot(), "node_modules", ".bin", "tsx"),
    [join(projectRoot(), "src", "cli", "bin.ts"), ...arguments_],
    {
      cwd,
      env: { ...process.env, HOME: userHome },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  return { exitCode, stdout, stderr };
}

function requireData<Command extends CliEnvelope["data"]["command"]>(
  result: CliResult,
  command: Command,
): Extract<CliEnvelope["data"], { command: Command }> {
  const data = result.envelope.data;
  if (data.command !== command || !("error" in data === false)) {
    throw new Error(`Expected ${command} success data`);
  }
  return data as Extract<CliEnvelope["data"], { command: Command }>;
}

function structuralFactTotal(data: Extract<CliEnvelope["data"], { command: "index" }>): number {
  const totals = data.structuralTotals;
  if (
    totals === null
    || typeof totals !== "object"
    || !("nodes" in totals)
    || !("relations" in totals)
    || typeof totals.nodes !== "number"
    || typeof totals.relations !== "number"
  ) {
    throw new Error("Expected structural fact totals in index data");
  }
  return totals.nodes + totals.relations;
}
