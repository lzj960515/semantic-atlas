---
description: Verify, version, publish, and validate a Semantic Atlas npm release
argument-hint: [patch|minor]
allowed-tools: Bash, Read
---

# Semantic Atlas Release Command

Semantic Atlas is an npm-only release. It has no database migration or
deployment step. The local command verifies and versions the release, pushes
its Git commit and tag, and publishes the matching GitHub Release. The
`Publish npm package` GitHub Actions workflow owns npm authentication and
provenance publication through the protected `npm` environment.

## Version input

`$ARGUMENTS` must be one of:

- `patch` for backward-compatible fixes and documentation releases.
- `minor` for backward-compatible features.

Use `patch` when no argument is provided. Commit the release candidate before
starting this workflow so the version commit contains only release metadata
and current-version documentation references.

## Execution steps

### 1. Confirm repository state

```bash
git fetch origin
git status --short --branch
git merge-base --is-ancestor origin/main HEAD
```

Run the release from `main` with a clean worktree. The local branch may be
ahead of `origin/main`, and it must contain the current remote branch.

### 2. Confirm the current version

```bash
npm view semantic-atlas version --json
node -p "require('./package.json').version"
```

The local package version must equal the published npm version before bumping.
Resolve version drift before creating release metadata.

### 3. Verify the release candidate

```bash
pnpm typecheck
pnpm contracts:check
pnpm test
pnpm build
pnpm package:verify
pnpm validation:backend
pnpm evaluation:validate
pnpm evaluation:results
pnpm evaluation:discovery
npm pack --dry-run --silent
git diff --check
```

Read every command result and stop before versioning when a gate fails.

### 4. Bump the version and align public documentation

```bash
previous_version="$(node -p "require('./package.json').version")"
npm version <patch|minor> --no-git-tag-version
version="$(node -p "require('./package.json').version")"
```

Update the Quick start install command and both current tag references in the
Skill install section of `README.md` and `README.zh-CN.md`. Historical dogfood
evidence keeps the version that was actually tested.

```bash
PREVIOUS_VERSION="$previous_version" RELEASE_VERSION="$version" node --input-type=module <<'NODE'
import { readFileSync, writeFileSync } from "node:fs";

const previousVersion = process.env.PREVIOUS_VERSION;
const releaseVersion = process.env.RELEASE_VERSION;
const readmes = ["README.md", "README.zh-CN.md"];

for (const readme of readmes) {
  let content = readFileSync(readme, "utf8");
  const currentInstall = `npm install --global semantic-atlas@${previousVersion}`;
  const releaseInstall = `npm install --global semantic-atlas@${releaseVersion}`;
  const installOccurrences = content.split(currentInstall).length - 1;
  if (installOccurrences !== 1) {
    throw new Error(`${readme} expected one current install reference`);
  }
  content = content.replace(currentInstall, releaseInstall);

  const currentTag = `v${previousVersion}`;
  const releaseTag = `v${releaseVersion}`;
  const skillUrl = `tree/${currentTag}/.agents/skills/semantic-atlas`;
  const skillUrlIndex = content.indexOf(skillUrl);
  const skillSectionStart = content.lastIndexOf("\n### ", skillUrlIndex);
  const nextSectionStart = content.indexOf("\n### ", skillUrlIndex);
  if (skillUrlIndex < 0 || skillSectionStart < 0 || nextSectionStart < 0) {
    throw new Error(`${readme} is missing the current Skill install section`);
  }

  const skillSection = content.slice(skillSectionStart, nextSectionStart);
  const tagOccurrences = skillSection.split(currentTag).length - 1;
  if (tagOccurrences !== 2) {
    throw new Error(
      `${readme} expected two current tag references in the Skill install section`,
    );
  }
  const releaseSkillSection = skillSection.split(currentTag).join(releaseTag);
  content =
    content.slice(0, skillSectionStart)
    + releaseSkillSection
    + content.slice(nextSectionStart);

  writeFileSync(readme, content);
}
NODE
```

### 5. Verify and create the release commit and tag

```bash
pnpm package:verify
npm pack --dry-run --silent
git diff --check
git diff -- package.json README.md README.zh-CN.md
git add package.json README.md README.zh-CN.md
git commit -m "chore(release): prepare v${version}"
git tag -a "v${version}" -m "Semantic Atlas v${version}"
```

Confirm the commit contains the package version and the three current-version
references in each README, while the v0.1.1 dogfood report remains historical.

### 6. Push the release commit and tag

```bash
git push origin main --follow-tags
```

Ordinary push CI validates `main` and the tag. The pushed tag remains the
immutable source identity for the GitHub Release and npm provenance.

### 7. Publish the GitHub Release

```bash
gh release create "v${version}" \
  --verify-tag \
  --title "Semantic Atlas v${version}" \
  --generate-notes
```

Publishing the GitHub Release triggers the `Publish npm package` workflow.
That workflow checks the release tag against `package.json`, repeats the
package gates, and publishes through `NPM_TOKEN` with provenance.

### 8. Follow the automated publication

```bash
release_commit="$(git rev-parse "v${version}^{commit}")"
gh run list --workflow release.yml --event release --commit "$release_commit" --limit 1 --json databaseId,status,conclusion,url
run_id="$(gh run list --workflow release.yml --event release --commit "$release_commit" --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "$run_id" --exit-status
```

GitHub can take a few seconds to expose a newly triggered run. Repeat the two
`gh run list` commands until they return its database ID, then watch that exact
run to completion.

### 9. Verify the published release

```bash
gh run view "$run_id" --json status,conclusion,url,headSha
gh release view "v${version}" --json tagName,publishedAt,url
npm view "semantic-atlas@${version}" version dist-tags.latest dist.shasum dist.integrity --json
git ls-remote --tags origin "refs/tags/v${version}" "refs/tags/v${version}^{}"
git status --short --branch
```

Confirm that the workflow succeeded, npm reports the new version as `latest`,
the remote annotated tag resolves to the release commit, the GitHub Release is
public, and the local worktree is clean.

## Failure semantics

- A local verification failure keeps the candidate unversioned for repair and
  a complete rerun of the gates.
- A post-bump verification failure keeps the uncommitted version changes for
  repair before any tag or push.
- A Git push failure is retried with the existing release commit and tag so
  their identity remains paired.
- A workflow failure is inspected with `gh run view "$run_id" --log-failed`
  and an npm version read before recovery is chosen.
- A transient workflow or environment failure is rerun against the same tag
  when npm has not accepted the version.
- A source correction after tag publication uses an explicit new patch
  version, preserving the released tag and audit history.
- An npm version that is already public is preserved while Git, GitHub Release,
  workflow, and provenance evidence are reconciled.

---

**Now execute the Semantic Atlas release using `$ARGUMENTS`.**
