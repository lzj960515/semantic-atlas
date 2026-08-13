import { extname } from "node:path";

import { runGit } from "./git-command.js";
import type { GitRepository } from "./types.js";

export interface SupportedRepositoryLanguage {
  readonly language: string;
  readonly support: "supported";
}

export interface UnsupportedRepositoryLanguage {
  readonly language: string;
  readonly support: "unsupported";
  readonly reason: string;
}

export type RepositoryLanguageSupport =
  | SupportedRepositoryLanguage
  | UnsupportedRepositoryLanguage;

const languageByExtension = new Map<string, string>([
  [".c", "c"],
  [".cc", "cpp"],
  [".cpp", "cpp"],
  [".cs", "csharp"],
  [".cts", "typescript"],
  [".cxx", "cpp"],
  [".go", "go"],
  [".h", "c"],
  [".hpp", "cpp"],
  [".java", "java"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".kt", "kotlin"],
  [".kts", "kotlin"],
  [".mjs", "javascript"],
  [".mts", "typescript"],
  [".php", "php"],
  [".py", "python"],
  [".rb", "ruby"],
  [".rs", "rust"],
  [".scala", "scala"],
  [".swift", "swift"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
  [".vue", "vue"],
]);

const supportedLanguages = new Set(["javascript", "typescript"]);

export async function inspectRepositoryLanguages(
  repository: GitRepository,
): Promise<readonly RepositoryLanguageSupport[]> {
  const output = await runGit(repository.worktreeRoot, [
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ]);
  const languages = new Set(output.toString("utf8")
    .split("\0")
    .flatMap((path) => {
      const language = languageByExtension.get(extname(path).toLowerCase());
      return language === undefined ? [] : [language];
    }));

  if (languages.size === 0) {
    return [{
      language: "unknown",
      support: "unsupported",
      reason: "No supported TypeScript or JavaScript source files were found.",
    }];
  }
  return [...languages]
    .sort((left, right) => left.localeCompare(right))
    .map((language): RepositoryLanguageSupport => (
      supportedLanguages.has(language)
        ? { language, support: "supported" }
        : {
            language,
            support: "unsupported",
            reason: `Semantic Atlas v0.1 does not structurally index ${language} source files.`,
          }
    ));
}

export function hasSupportedRepositoryLanguage(
  languages: readonly RepositoryLanguageSupport[],
): boolean {
  return languages.some(({ support }) => support === "supported");
}
