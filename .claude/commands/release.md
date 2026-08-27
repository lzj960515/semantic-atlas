---
description: Verify, tag, publish, and read back one Semantic Atlas release
allowed-tools: Bash, Read
---

# Semantic Atlas Release Command

Semantic Atlas releases are npm-only. They have no database migration or
deployment step. A release starts from an already versioned candidate on
`main`; this command does not bump the package version or rewrite the candidate.

The protected `npm` GitHub environment owns the registry credential. Before a
tag or Release is created, the repository is configured for immutable releases
and that setting is read back. The release-published workflow verifies the
specific Release in a read-only gate before any tag checkout or npm credential
boundary. A dependent protected job repeats `pnpm release:verify`, checks the
tag against `package.json`, publishes with npm provenance, and performs public
read-back.

The v1 release is one intentional repository-history discontinuity. The
existing `lzj960515/semantic-atlas` repository keeps its public identity,
release environment, v0 tags, and Releases while its `main` branch changes to
the clean v1 history through an exact lease-checked push.

## 1. Confirm Repository Identity

```bash
git remote get-url origin
expected_remote_main="$(git ls-remote --heads origin refs/heads/main | awk '{print $1}')"
test -n "$expected_remote_main"
git fetch origin --tags
git status --short --branch
git branch --show-current
test "$(git rev-parse origin/main)" = "$expected_remote_main"
git diff --check
```

Run only from a clean `main` worktree for the intended public source repository:

```text
https://github.com/lzj960515/semantic-atlas.git
```

For `v1.0.0`, `origin/main` and the candidate intentionally have unrelated
histories. Keep `expected_remote_main` in the same shell through publication;
it is the lease that prevents replacing a branch changed after this preflight.

## 2. Require Immutable GitHub Releases

```bash
gh api --method PUT "repos/lzj960515/semantic-atlas/immutable-releases"
test "$(gh api "repos/lzj960515/semantic-atlas/immutable-releases" --jq '.enabled')" = "true"
```

The repository setting must be enabled and confirmed before creating the tag or
GitHub Release. Stop if the authenticated release owner cannot change or read
this setting; an annotated Git tag alone is not immutable.

## 3. Confirm Candidate Version

```bash
version="$(node -p "require('./package.json').version")"
tag="v${version}"
npm view semantic-atlas version --json
npm view "semantic-atlas@${version}" version --json
git tag --list "$tag"
```

The local version must be stable SemVer, absent from npm, and absent from local
and remote tags. An already published npm version or existing tag is retained;
inspect and reconcile its identity instead of overwriting it.

## 4. Verify Source Candidate

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

Read every gate result. The command covers source and contract tests, Node 24
typecheck and build, render behavior, packed package contents and privacy, an
anonymous clean installation, the public v0.4-to-v1 transition, package dry-run,
and Git diff checks.

## 5. Create Annotated Tag Identity

```bash
git rev-parse HEAD
git tag -a "$tag" -m "Semantic Atlas ${tag}"
git cat-file -t "refs/tags/${tag}"
git rev-parse "${tag}^{commit}"
```

The tag must be annotated and resolve to the exact verified candidate commit.
If any check fails before push, retain the candidate and remove only the new
local tag after confirming it was never published remotely.

## 6. Direct V1 Main Cutover And Publish Release Identity

```bash
git push --force-with-lease=refs/heads/main:${expected_remote_main} origin HEAD:refs/heads/main
test "$(git ls-remote --heads origin refs/heads/main | awk '{print $1}')" = "$(git rev-parse HEAD)"
git push origin "refs/tags/${tag}"
gh release create "$tag" \
  --verify-tag \
  --title "Semantic Atlas ${tag}" \
  --generate-notes
test "$(gh release view "$tag" --json isImmutable --jq '.isImmutable')" = "true"
```

The lease-checked `main` push is the only intended v1 history replacement; v0
tags and Releases stay present. Publishing the non-prerelease GitHub Release is
the only event that starts npm publication. The published Release must report
`isImmutable: true`; the workflow independently reads the REST Release in a
read-only gate and stops before tag checkout, protected-environment access, or
OIDC permission unless its tag matches and `immutable` is exactly `true`.
Pushes and pull requests run CI but cannot publish.

## 7. Follow The Exact Workflow

```bash
release_commit="$(git rev-parse "${tag}^{commit}")"
gh run list --workflow release.yml --event release --commit "$release_commit" \
  --limit 1 --json databaseId,status,conclusion,url
run_id="$(gh run list --workflow release.yml --event release \
  --commit "$release_commit" --limit 1 --json databaseId \
  --jq '.[0].databaseId')"
gh run watch "$run_id" --exit-status
gh run view "$run_id" --json status,conclusion,url,headSha
```

GitHub can take a few seconds to expose the run. Repeat the bounded lookup until
it returns the run for the release commit, then watch that exact run.

## 8. Public Read-Back

```bash
gh release view "$tag" --json tagName,publishedAt,url,isPrerelease,isImmutable
npm view "semantic-atlas@${version}" version dist.shasum dist.integrity --json
npm view semantic-atlas dist-tags.latest --json
git ls-remote --tags origin "refs/tags/${tag}" "refs/tags/${tag}^{}"
git status --short --branch
```

Confirm the workflow succeeded, the GitHub Release is public, immutable, and not
a prerelease, npm reports the exact version as `latest` with integrity metadata,
the remote annotated tag resolves to the candidate commit, and the worktree is
clean.

## Failure Semantics

- A candidate-gate failure stays local for repair and a complete verification
  rerun.
- A main push rejected by the lease triggers a fresh remote inspection and a
  complete candidate verification before choosing a new expected SHA. The
  release never falls back to an unqualified force push.
- A tag push failure reuses the same verified commit and annotated tag.
- A GitHub workflow failure is inspected with
  `gh run view "$run_id" --log-failed`; check npm before choosing recovery.
- A transient workflow failure can rerun against the same immutable Release only
  while npm confirms that version is absent.
- A source correction after tag or npm publication uses a new patch version.
- Existing Git tags, GitHub Releases, and npm versions are preserved and
  reconciled. The one authorized v1 `main` discontinuity remains bounded by its
  recorded lease.

---

**Now release the current verified Semantic Atlas package version.**
