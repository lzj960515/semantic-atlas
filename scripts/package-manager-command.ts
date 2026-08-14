export type PackageManager = "npm" | "pnpm";

export interface PackageManagerRuntime {
  readonly platform: NodeJS.Platform;
  readonly nodeExecutable: string;
  readonly packageManagerEntry: string | undefined;
}

export interface PackageManagerInvocation {
  readonly executable: string;
  readonly arguments: readonly string[];
}

export function resolvePackageManagerInvocation(
  packageManager: PackageManager,
  arguments_: readonly string[],
  runtime: PackageManagerRuntime,
): PackageManagerInvocation {
  if (runtime.platform !== "win32") {
    return { executable: packageManager, arguments: arguments_ };
  }

  if (!runtime.packageManagerEntry) {
    throw new Error(
      `Run package verification through ${packageManager} on Windows so its JavaScript entry is available`,
    );
  }

  return {
    executable: runtime.nodeExecutable,
    arguments: [runtime.packageManagerEntry, ...arguments_],
  };
}
