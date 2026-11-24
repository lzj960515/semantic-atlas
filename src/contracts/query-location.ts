import type { NavigationAnchor } from "./map.js";

/** A current repository-relative file position, with one-based line and column. */
export interface QuerySourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
}

export type NavigationAnchorResolution = "located" | "hint" | "missing" | "ambiguous";

/** Resolution describes navigation only; it does not confirm business behavior. */
export type ResolvedNavigationAnchor = NavigationAnchor & {
  readonly resolution: NavigationAnchorResolution;
  readonly location?: QuerySourceLocation;
};
