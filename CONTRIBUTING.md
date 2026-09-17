# Contributing to Semantic Atlas

English and Chinese contributions are welcome. This guide applies to people and
coding agents working on the Semantic Atlas product, including from a fork or
from a project that uses the installed CLI and Skills.

## Find the owning repository

The upstream product repository is
[lzj960515/semantic-atlas](https://github.com/lzj960515/semantic-atlas), and its
integration branch is `main`. Product issues and pull requests belong there.
A local checkout or a fork does not change that upstream ownership.

First identify what needs to change:

- CLI behavior, the Viewer, bundled Skills, and their documentation belong in
  this repository. When a problem appears while using an installed copy, trace
  it to this source and contribute the fix upstream.
- A consuming project's `docs/business-map/*.yaml` belongs to that project.
  Keep its business knowledge and private source evidence in its own repository.

Read [AGENTS.md](AGENTS.md) and its product documentation pointers before making
product changes. Check [open issues](https://github.com/lzj960515/semantic-atlas/issues)
and [pull requests](https://github.com/lzj960515/semantic-atlas/pulls) for existing
work. Use the bilingual issue templates when reporting a reproducible bug or
proposing a behavior change.

## Work from the upstream branch

Inspect the actual remotes before choosing a base or push destination:

```bash
git remote -v
gh repo view --json nameWithOwner,isFork,parent,defaultBranchRef
```

In a fork, `origin` normally points to your fork. Keep it as your push target and
use a remote pointing to `https://github.com/lzj960515/semantic-atlas.git` as the
upstream base. When that remote is absent, add it under an available name; this
example uses `upstream`:

```bash
git remote add upstream https://github.com/lzj960515/semantic-atlas.git
git fetch upstream
git switch -c codex/describe-the-change upstream/main
```

When an existing remote already points to the canonical repository, fetch and
use that remote's `main` instead. Preserve unrelated local changes; a separate
worktree can keep the contribution isolated. Follow the worktree conventions in
[AGENTS.md](AGENTS.md#git-and-task-state).

## Implement and verify

Use Node.js 24 and the pnpm version declared in `package.json`:

```bash
pnpm install --frozen-lockfile
pnpm release:verify
```

Keep each contribution focused on the reported outcome and its necessary
impacts. Protect changed behavior with relevant tests; for Skill behavior,
exercise natural tasks in fresh contexts and inspect the resulting actions and
artifacts. [Development](README.md#development) explains the source gate, and
[evaluation](docs/evaluation.md) defines the evidence standard. Documentation-only
changes need accurate content and working links; report the checks actually run.

Update stable knowledge in its authoritative page and add an independent record
following [documentation change rules](docs/changes/README.md). Business-changing
work follows the observation and independent-review workflow in
[AGENTS.md](AGENTS.md#accuracy-workflow). Keep private observations and temporary
evaluation artifacts outside the Git diff.

Use single-line English Conventional Commits, for example:

```bash
git commit -m "fix(viewer): preserve text selection while dragging cards"
```

Supported types are `feat`, `fix`, `docs`, `style`, `refactor`, `test`, and `chore`.

## Submit to the upstream project

Push the contribution branch to a repository you can write, then open a PR with
**base repository `lzj960515/semantic-atlas`, base branch `main`**, and your branch
as the head. Set the destination explicitly so the CLI cannot silently open the
PR against the fork. For a fork contribution:

```bash
git push -u origin codex/describe-the-change
gh pr create --repo lzj960515/semantic-atlas --base main \
  --head "<fork-owner>:codex/describe-the-change"
```

Replace `<fork-owner>` with the actual fork owner. For a branch in the canonical
repository, use its branch name directly as `--head`. Use the PR template to
explain the problem, resulting behavior, related issue, actual verification, and
any remaining delivery boundary. Reserve `Closes #N` for issues fully resolved
by the contribution.

Check that the created PR targets the canonical repository and intended branch.
Respond to review and verify CI on the latest head before requesting integration.
A local commit or a push to a fork is an intermediate state; report the upstream
PR URL and its actual review/merge state when handing off the contribution.

Maintainers handle versioning and publication through the repository's release
workflow. A contribution can merge independently of a package release or an
update to installed Skills.
