export interface SqliteRuntimeState {
  readonly nodeVersion: string;
  readonly execArguments: readonly string[];
  readonly sqliteAvailable: boolean;
}

export function requiresSqliteCompatibilityProcess(runtime: SqliteRuntimeState): boolean {
  const nodeMajor = Number.parseInt(runtime.nodeVersion, 10);
  const warningAlreadyDisabled = runtime.execArguments.some((argument) => (
    argument === "--no-warnings"
    || argument === "--disable-warning=ExperimentalWarning"
  ));
  if (nodeMajor < 24 && !warningAlreadyDisabled) {
    return true;
  }

  return !runtime.sqliteAvailable;
}

export function createSqliteCompatibilityArguments(
  entryPoint: string,
  applicationArguments: readonly string[],
  inheritedExecArguments: readonly string[] = [],
): readonly string[] {
  const loaderArguments = inheritedExecArguments.filter((argument) => (
    argument !== "--experimental-sqlite"
    && argument !== "--no-experimental-sqlite"
  ));
  return [
    "--experimental-sqlite",
    "--disable-warning=ExperimentalWarning",
    ...loaderArguments,
    entryPoint,
    ...applicationArguments,
  ];
}
