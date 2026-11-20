// Repository and dependency installs do not modify user-level agent discovery.
if (process.env.npm_config_global === "true") {
  const { runCli } = await import("../dist/cli/run-cli.js");
  const result = await runCli(["setup"]);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
