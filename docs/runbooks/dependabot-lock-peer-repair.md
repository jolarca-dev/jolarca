# Runbook: dependabot npm PR red on `Missing: @swc/helpers from lock file`

**Symptoms:** every `frontend-*` CI job dies 7–9 s in with the same
`EUSAGE` line, e.g.

```
npm ci
npm error code EUSAGE
npm error Missing: @swc/helpers@0.5.23 from lock file
```

`gh pr update-branch` does **not** clear it, and the branch is already current
with `main`. QODER.md §8 G19.

**Cause (measured, not assumed):** dependabot's lockfile edit omits entries
marked `"optional": true, "peer": true`. `npm ci` still requires them for
package.json↔lock sync. On this repo the entry is nested at
`node_modules/next-intl/node_modules/@swc/helpers`. Its requirer is
`next-intl`'s nested `@swc/core`, which peers `@swc/helpers >= 0.5.17`, while
`next` pins exactly `0.5.15` — disjoint ranges, so npm must nest one copy.
`next-intl` itself declares `@swc/helpers` in no field, so bumping `next-intl`
cannot remove the requirement.

**Do not improvise a per-PR hand edit.** Use the codified repair, which works in
a throwaway worktree and refuses to push unless its own checks pass:

```bash
# 1. See it first — dry run proves the defect, applies the fix, verifies, pushes nothing.
scripts/repair-dependabot-lock.sh 153 150

# 2. Only if every line reads PASS / READY:
scripts/repair-dependabot-lock.sh --push 153 150

# 3. Confirm CI agrees, then triage as usual.
gh pr checks 153
```

The guard validates its own comparison logic before touching any branch
(`scripts/repair-dependabot-lock.sh` with `--self-test`), because a tool that rejected
every valid repair would be invisible until a PR stayed red for a week.

**What each check means:**

| step | passes when | a failure tells you |
|---|---|---|
| BEFORE | `npm ci --dry-run` exits **1** | the branch has no such defect, so it is left alone |
| REPAIR | `npm install --package-lock-only` exits 0 | registry/network problem |
| AFTER | `npm ci --dry-run` exits **0** | a **different** class is present (usually `ERESOLVE` from a coupled family split into single-package PRs) — this script cannot fix that |
| INVARIANT | no existing entry changed version, none vanished | the regeneration is smuggling a bump; never push it |
| DIFF SCOPE | only `frontend/package-lock.json` changed | something else moved; abort |

A correct repair is **11 lines added, 0 removed**, restoring exactly one entry.
Anything larger deserves a read before pushing.

**What this does *not* fix:** the underlying peer conflict. Dependabot
regenerates branches on its next evaluation, so the same defect returns on
freshly generated branches — this is a recurring tax, not a cure. The cure is
`next` + `eslint-config-next` at 16.3.8 with `eslint` held at 9: `next@16` pins
`@swc/helpers 0.5.23` itself, the `>= 0.5.17` peer is satisfied by the hoisted
copy, and `peer: true` lock entries fall 1 → 0, leaving nothing to drop. That
upgrade is gated on the `eslint-plugin-react-hooks` 7 decision in QODER.md §8
queue item 3(2), **not** on this repair.

Two traps recorded because both were hit:

- **Do not "fix" it with an npm `overrides` on `@swc/helpers`.** It removes the
  nested entry and passes `npm ci`, `tsc`, tests and `next build`, then breaks
  the standalone server at boot with
  `Cannot find module .../standalone/node_modules/@swc/helpers/esm/_interop_require_default.js`
  (`MODULE_NOT_FOUND`, from `next/dist/server/require-hook.js`). `next`'s exact
  `0.5.15` pin is load-bearing for the traced standalone runtime (PR #159).
- **Do not raise the `eslint` major to reach Next 16.** `eslint-config-next@16`
  vendors `eslint-plugin-react@7.37.5`, which peers `^3 … ^9.7`, and ESLint 10
  removed `context.getFilename()`; ESLint cannot even load a config (PR #154).

**Prevention:** none available locally — no CI job can see this before `npm ci`
runs, which is why it surfaces as red CI. `make check-deps-groups` keeps the
group topology honest (coupled families stay grouped, patch routes stay separate
from major routes), which limits how often the sibling `ERESOLVE` class appears.
