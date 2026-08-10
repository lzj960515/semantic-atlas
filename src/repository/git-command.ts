import { execFile } from "node:child_process";

const READ_ONLY_GIT_ENVIRONMENT = {
  ...process.env,
  // Git must not refresh the target repository's index during inspection.
  GIT_OPTIONAL_LOCKS: "0",
};

export async function runGit(
  workingDirectory: string,
  arguments_: readonly string[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", workingDirectory, ...arguments_],
      {
        encoding: "buffer",
        env: READ_ONLY_GIT_ENVIRONMENT,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

export async function runGitText(
  workingDirectory: string,
  arguments_: readonly string[],
): Promise<string> {
  return (await runGit(workingDirectory, arguments_)).toString("utf8").trim();
}
