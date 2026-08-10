import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

export interface GitFixture {
  readonly directory: string;
  git(...arguments_: string[]): Promise<string>;
  write(relativePath: string, contents: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createGitFixture(): Promise<GitFixture> {
  const directory = await mkdtemp(join(tmpdir(), "semantic-atlas-git-"));

  async function git(...arguments_: string[]): Promise<string> {
    const { stdout } = await executeFile("git", arguments_, {
      cwd: directory,
      encoding: "utf8",
    });
    return stdout.trim();
  }

  async function write(relativePath: string, contents: string): Promise<void> {
    const absolutePath = join(directory, relativePath);
    await mkdir(join(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, contents);
  }

  await git("init", "--initial-branch=main");
  await git("config", "user.name", "Semantic Atlas Tests");
  await git("config", "user.email", "tests@semantic-atlas.invalid");
  await write("package.json", '{"type":"module"}\n');
  await write("src/example.ts", "export const value = 1;\n");
  await git("add", ".");
  await git("commit", "-m", "test: initialize fixture");

  return {
    directory,
    git,
    write,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
