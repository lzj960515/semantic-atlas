# [2026-09-03] history | Documentation changes

- Defined `semantic-atlas@2.3.0` as the manual project-registration and
  on-demand Web loading release.
- Added the bounded initial Human Map Inspection map for validated project
  registration, opaque one-project loading, and isolated unavailable results.
- Added the versioned user-local project list and the single validating,
  idempotent `semantic-atlas project add [path]` registration entry point.
- Made parameterless `web` start from registered projects in any directory,
  while explicit `web --repo` paths remain temporary and unmerged.
- Split the Web catalog from map loading so the browser requests only the
  selected opaque project ID, retains one current model and SVG set, and keeps
  unavailable projects isolated.
- Kept registration paths out of the browser and separate from tracked YAML and
  immutable accuracy observations.
