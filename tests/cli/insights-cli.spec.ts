import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { cliEnvelopeSchema } from "../../src/contracts/cli.js";
import { insightsEnvelopeSchema } from "../../src/contracts/insights.js";
import { createGitFixture, type GitFixture } from "../support/git-fixture.js";

describe("Semantic Atlas insights CLI", () => {
  const fixtures: GitFixture[] = [];
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
    await Promise.all(temporaryDirectories.splice(0).map((directory) => (
      rm(directory, { recursive: true, force: true })
    )));
  });

  it("records normal project commands passively and keeps feedback explicit", async () => {
    const fixture = await createGitFixture();
    fixtures.push(fixture);
    const home = await mkdtemp(join(tmpdir(), "semantic-atlas-insights-home-"));
    temporaryDirectories.push(home);

    const status = await runJsonCli(["status"], fixture.directory, home);
    expect(cliEnvelopeSchema.parse(status.output)).toMatchObject({
      status: "ok",
      data: { command: "status" },
    });

    const beforeFeedback = insightsEnvelopeSchema.parse((await runJsonCli(
      ["insights", "summary", "--period", "all"],
      fixture.directory,
      home,
    )).output);
    expect(beforeFeedback).toMatchObject({
      status: "ok",
      data: {
        command: "insights.summary",
        summary: {
          commands: { total: 1, byCommand: [{ command: "status", count: 1 }] },
          feedback: { total: 0 },
        },
      },
    });

    const feedback = await runJsonCli(
      ["feedback", "report", "--stdin"],
      fixture.directory,
      home,
      JSON.stringify({
        kind: "problem",
        category: "workflow-friction",
        impact: "slowed",
        observed: "The result required a broad source fallback.",
        expected: "The map should provide a narrower evidence path.",
        sourceConfirmed: true,
      }),
    );
    const feedbackEnvelope = cliEnvelopeSchema.parse(feedback.output);
    expect(feedbackEnvelope).toMatchObject({
      status: "ok",
      data: {
        command: "feedback.report",
        report: {
          category: "workflow-friction",
          status: "new",
          contextEventCount: 1,
        },
      },
    });
    if (feedbackEnvelope.data.command !== "feedback.report" || "error" in feedbackEnvelope.data) {
      throw new Error("Expected a successful feedback report");
    }

    const missingNote = await runJsonCli(
      ["insights", "feedback", "update", "--stdin"],
      fixture.directory,
      home,
      JSON.stringify({ id: feedbackEnvelope.data.report.id, status: "triaged" }),
    );
    expect(missingNote.exitCode).toBe(2);
    expect(insightsEnvelopeSchema.parse(missingNote.output)).toMatchObject({
      status: "error",
      data: { command: "insights.feedback.update", error: { code: "INVALID_INPUT" } },
    });

    const triaged = insightsEnvelopeSchema.parse((await runJsonCli(
      ["insights", "feedback", "update", "--stdin"],
      fixture.directory,
      home,
      JSON.stringify({
        id: feedbackEnvelope.data.report.id,
        status: "triaged",
        note: "Reproduce with the reported source boundary.",
      }),
    )).output);
    expect(triaged).toMatchObject({
      status: "ok",
      data: {
        command: "insights.feedback.update",
        report: { id: feedbackEnvelope.data.report.id, status: "triaged" },
      },
    });

    const reports = insightsEnvelopeSchema.parse((await runJsonCli(
      ["insights", "feedback", "--period", "all", "--status", "triaged"],
      fixture.directory,
      home,
    )).output);
    expect(reports).toMatchObject({
      status: "ok",
      data: {
        command: "insights.feedback",
        reports: [expect.objectContaining({ category: "workflow-friction", status: "triaged" })],
      },
    });
  });
});

async function runJsonCli(
  arguments_: readonly string[],
  cwd: string,
  home: string,
  input?: string,
): Promise<{ readonly exitCode: number; readonly output: unknown; readonly stderr: string }> {
  const child = spawn(
    join(projectRoot(), "node_modules", ".bin", "tsx"),
    [join(projectRoot(), "src", "cli", "bin.ts"), ...arguments_],
    {
      cwd,
      env: { ...process.env, SEMANTIC_ATLAS_HOME: home },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.stdin.end(input);
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });
  return { exitCode, output: JSON.parse(stdout), stderr };
}

function projectRoot(): string {
  return join(import.meta.dirname, "..", "..");
}
