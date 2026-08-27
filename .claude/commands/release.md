---
description: Verify, tag, publish, and read back one Semantic Atlas release
allowed-tools: Bash, Read
---

# Semantic Atlas Release Command

Semantic Atlas releases are npm-only. They have no database migration or
deployment step. A release starts from an already versioned candidate on
`main`; this command does not bump the package version or rewrite the candidate.

The protected `npm` GitHub environment owns the registry credential. Local
steps create and publish an annotated Git tag plus a GitHub Release. The
release-published workflow repeats `pnpm release:verify`, checks the tag against
`package.json`, publishes with npm provenance, and performs public read-back.

## 1. Confirm Repository Identity

```bash
git remote get-url origin
git fetch origin --tags
git status --short --branch
git branch --show-current
git merge-base --is-ancestor origin/main HEAD
git diff --check
```

Run only from a clean `main` worktree for the intended public source repository:

```text
https://github.com/lzj960515/semantic-atlas.git
```

The candidate must contain `origin/main`; reconcile any remote difference
before creating release identity.

## 2. Confirm Candidate Version

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

## 3. Verify Source Candidate

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

Read every gate result. The command covers source and contract tests, Node 24
typecheck and build, render behavior, packed package contents and privacy, an
anonymous clean installation, the public v0.4-to-v1 transition, package dry-run,
and Git diff checks.

## 4. Create Immutable Tag Identity

```bash
git rev-parse HEAD
git tag -a "$tag" -m "Semantic Atlas ${tag}"
git cat-file -t "refs/tags/${tag}"
git rev-parse "${tag}^{commit}"
```

The tag must be annotated and resolve to the exact verified candidate commit.
If any check fails before push, retain the candidate and remove only the new
local tag after confirming it was never published remotely.

## 5. Publish Git And GitHub Release Identity

```bash
git push origin main
git push origin "refs/tags/${tag}"
gh release create "$tag" \
  --verify-tag \
  --title "Semantic Atlas ${tag}" \
  --generate-notes
```

Publishing the non-prerelease GitHub Release is the only event that starts npm
publication. Pushes and pull requests run CI but cannot publish.

## 6. Follow The Exact Workflow

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

## 7. Public Read-Back

```bash
gh release view "$tag" --json tagName,publishedAt,url,isPrerelease
npm view "semantic-atlas@${version}" version dist.shasum dist.integrity --json
npm view semantic-atlas dist-tags.latest --json
git ls-remote --tags origin "refs/tags/${tag}" "refs/tags/${tag}^{}"
git status --short --branch
```

Confirm the workflow succeeded, the GitHub Release is public and not a
prerelease, npm reports the exact version as `latest` with integrity metadata,
the remote annotated tag resolves to the candidate commit, and the worktree is
clean.

## Failure Semantics

- A candidate-gate failure stays local for repair and a complete verification
  rerun.
- A push failure reuses the same verified commit and annotated tag.
- A GitHub workflow failure is inspected with
  `gh run view "$run_id" --log-failed`; check npm before choosing recovery.
- A transient workflow failure can rerun against the same immutable tag only
  while npm confirms that version is absent.
- A source correction after tag or npm publication uses a new patch version.
- Existing Git, GitHub Release, and npm identities are preserved and reconciled;
  release recovery never moves or overwrites them.

---

**Now release the current verified Semantic Atlas package version.**
