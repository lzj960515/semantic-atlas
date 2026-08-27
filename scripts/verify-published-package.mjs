import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const packageName = "semantic-atlas";
const releaseVersion = (process.env.RELEASE_VERSION ?? "").replace(/^v/u, "");

assert.match(releaseVersion, /^\d+\.\d+\.\d+$/u, "RELEASE_VERSION must be stable SemVer");

const maximumAttempts = 12;
for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
  try {
    const [publishedVersion, latestVersion, distribution] = await Promise.all([
      npmView(`${packageName}@${releaseVersion}`, ["version"]),
      npmView(packageName, ["dist-tags.latest"]),
      npmView(`${packageName}@${releaseVersion}`, ["dist.shasum", "dist.integrity"]),
    ]);
    assert.equal(publishedVersion, releaseVersion);
    assert.equal(latestVersion, releaseVersion);
    assert.equal(typeof distribution["dist.shasum"], "string");
    assert.equal(typeof distribution["dist.integrity"], "string");
    process.stdout.write(`Verified public ${packageName}@${releaseVersion}\n`);
    break;
  } catch (error) {
    if (attempt === maximumAttempts) throw error;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

async function npmView(specifier, fields) {
  const output = await run("npm", ["view", specifier, ...fields, "--json"]);
  return JSON.parse(output);
}

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) resolve(stdout);
      else reject(new Error(`${command} ${arguments_.join(" ")} failed: ${stderr || stdout}`));
    });
  });
}
