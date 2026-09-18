export interface Run<T> {
  purpose: string;
  state: "completed" | "failed";
  result?: T;
  failure?: string;
}

export function run<T>(purpose: string, action: () => T): Run<T> {
  try {
    return { purpose, state: "completed", result: action() };
  } catch (error) {
    return { purpose, state: "failed", failure: String(error) };
  }
}
