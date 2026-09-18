import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const packageName = "semantic-atlas";
const releaseVersion = (process.env.RELEASE_VERSION ?? "").replace(/^v/u, "");

assert.match(releaseVersion, /^\d+\.\d+\.\d+$/u, "RELEASE_VERSION must be stable SemVer");

const startedAt = Date.now();
const deadline = startedAt + 5 * 60_000;
let attempt = 0;
let lastError;
let verified = false;

while (Date.now() < deadline) {
  attempt += 1;
  try {
    const metadata = await readPublicMetadata(deadline - Date.now());
    assert.equal(metadata.version, releaseVersion, "Published version does not match the release");
    assert.equal(
      metadata["dist-tags.latest"],
      releaseVersion,
      "npm latest has not reached the release",
    );
    assert.equal(typeof metadata["dist.shasum"], "string", "Package shasum is not visible");
    assert.equal(typeof metadata["dist.integrity"], "string", "Package integrity is not visible");
    process.stdout.write(
      `Verified public ${packageName}@${releaseVersion} (attempt ${attempt}, ${elapsedSeconds()}s)\n`,
    );
    verified = true;
    break;
  } catch (error) {
    lastError = error;
    process.stdout.write(
      `Public npm verification attempt ${attempt}, ${elapsedSeconds()}s: ${error.message}\n`,
    );
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(5_000, remainingMs)));
    }
  }
}

if (!verified) {
  throw new Error(
    `Public npm verification timed out after ${elapsedSeconds()}s for ${packageName}@${releaseVersion}. Last check: ${lastError?.message}`,
    { cause: lastError },
  );
}

function elapsedSeconds() {
  return Math.floor((Date.now() - startedAt) / 1_000);
}

async function readPublicMetadata(timeoutMs) {
  // 一次读取版本、latest 与完整性，避免同次检查产生多个不同步的请求。
  const arguments_ = [
    "view",
    `${packageName}@${releaseVersion}`,
    "version",
    "dist-tags.latest",
    "dist.shasum",
    "dist.integrity",
    "--json",
    "--registry=https://registry.npmjs.org/",
  ];
  const output = await new Promise((resolve, reject) => {
    const child = spawn("npm", arguments_, {
      stdio: ["ignore", "pipe", "pipe"],
      // npm 自身的网络重试同样受整次公开验证的剩余时间约束。
      timeout: Math.max(1, timeoutMs),
      killSignal: "SIGKILL",
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
    child.on("close", (status, signal) => {
      if (status === 0) resolve(stdout);
      else reject(new Error(`npm view failed (${signal ?? status}): ${stderr || stdout}`));
    });
  });
  return JSON.parse(output);
}
