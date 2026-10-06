#!/usr/bin/env bash
# Repair a dependabot npm PR whose lockfile lost a nested optional peer.
#
# Why this exists (QODER.md §8 G19): dependabot's lockfile edit omits entries
# marked `"optional": true, "peer": true`. `npm ci` still requires them for
# sync, so every freshly generated branch dies the same way, ~7-9 s in:
#   EUSAGE ... Missing: @swc/helpers@0.5.23 from lock file
# Updating the branch does NOT restore the entry, and the defect reappears on
# each new generation, so the repair is a recurring tax rather than a one-time
# fix. Until the underlying peer conflict is gone (see the runbook), this script
# performs the repair as a repeatable, guarded operation instead of an
# improvised per-PR hand edit.
#
# What it guarantees:
#   - works in a throwaway detached worktree; the caller's current branch,
#     index and working tree are never touched;
#   - proves the defect first (`npm ci --dry-run` must fail BEFORE), so a clean
#     branch is reported as needing no repair rather than silently rewritten;
#   - proves the repair (`npm ci --dry-run` must pass AFTER);
#   - proves the repair changed resolution only: an entry that already existed
#     must keep its exact version and must not disappear. Additions are the
#     whole point — the dropped peer entry is what gets restored — so they are
#     reported, never counted as a bump;
#   - pushes only with --push, only to a dependabot/* branch, and only if the
#     remote tip has not moved underneath us.
#
# Usage:
#   scripts/repair-dependabot-lock.sh <pr-number> [<pr-number> ...]
#   scripts/repair-dependabot-lock.sh --push 153 150
#   scripts/repair-dependabot-lock.sh --self-test   # check the guard logic only
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" || exit 1

PUSH=0
SELFTEST=0
PRS=()
for arg in "$@"; do
  case "$arg" in
    --push | -p) PUSH=1 ;;
    --self-test | -s) SELFTEST=1 ;;
    -h | --help)
      sed -n '1,40p' "${BASH_SOURCE[0]}" | grep '^#' | sed 's/^#\{0,1\} //'
      exit 0
      ;;
    *[!0-9]*)
      echo "ERROR: unexpected argument '$arg' (want PR numbers)" >&2
      exit 2
      ;;
    *) PRS+=("$arg") ;;
  esac
done

# The guard checks its own comparison logic before it touches any branch; the
# call sits after the definitions, and `--self-test` stops there.
if [ ${#PRS[@]} -eq 0 ] && [ "$SELFTEST" -eq 0 ]; then
  echo "ERROR: no PR number given." >&2
  echo "usage: scripts/repair-dependabot-lock.sh [--push] <pr-number> ..." >&2
  exit 2
fi

for tool in jq npm gh git; do
  command -v "$tool" >/dev/null || { echo "ERROR: $tool is required" >&2; exit 1; }
done

# Scratch lives under .state/ (gitignored) rather than /tmp, and mktemp gives a
# unique suffix so concurrent runs cannot collide on a shared worktree path.
SCRATCH_ROOT="$REPO_ROOT/.state"
[ -d "$SCRATCH_ROOT" ] || SCRATCH_ROOT="$REPO_ROOT"
WORKTREES=()

# Invoked indirectly via trap, which shellcheck cannot follow (SC2317).
# shellcheck disable=SC2317
cleanup() {
  local wt
  for wt in "${WORKTREES[@]}"; do
    git worktree remove --force "$wt" >/dev/null 2>&1
    rmdir "$wt" 2>/dev/null
  done
  git worktree prune >/dev/null 2>&1
}
trap cleanup EXIT INT TERM

# Version map of the lock: "entry-path version" per package entry. Keys are
# unique, which is what makes the before/after comparison below exact.
vermap() {
  jq -r '.packages | to_entries[] | "\(.key) \(.value.version // "-")"' "$1" | sort
}

# Compare two version maps. Sets MAP_APPEARED to the entries the repair added.
# Returns 1 when an existing entry changed version or vanished — the only two
# ways a resolution-only repair could still be smuggling a bump. Restoring the
# dropped peer shows up as an addition, which is expected and must pass.
MAP_APPEARED=""
compare_maps() {
  local before="$1" after="$2" moved vanished
  MAP_APPEARED=""
  moved="$(awk 'NR==FNR { v[$1] = $2; next } ($1 in v) && v[$1] != $2 { print $1 ": " v[$1] " -> " $2 }' "$before" "$after")"
  vanished="$(awk 'NR==FNR { p[$1] = 1; next } { seen[$1] = 1 } END { for (k in p) if (!(k in seen)) print k }' "$before" "$after")"
  MAP_APPEARED="$(awk 'NR==FNR { p[$1] = 1; next } !($1 in p) { print $1 }' "$before" "$after")"
  if [ -n "$moved" ]; then
    echo "existing entries changed version:" >&2
    printf '%s\n' "$moved" | head -20 | sed 's/^/  /' >&2
    return 1
  fi
  if [ -n "$vanished" ]; then
    echo "entries disappeared from the lock:" >&2
    printf '%s\n' "$vanished" | head -20 | sed 's/^/  /' >&2
    return 1
  fi
  return 0
}

self_test() {
  local d fails=0
  d="$(mktemp -d "${TMPDIR:-/tmp}/lockrepair-selftest-XXXXXX")" || return 1
  # 1. addition only — the exact shape of a correct peer repair: must pass.
  printf 'a 1.0.0\nb 2.0.0\n' >"$d/b1"
  printf 'a 1.0.0\nb 2.0.0\nnext-intl/next/node_modules/@swc/helpers 0.5.23\n' >"$d/a1"
  if compare_maps "$d/b1" "$d/a1" 2>/dev/null; then
    echo "self-test repair-adds-entry: accepted (correct)"
  else
    echo "self-test repair-adds-entry: WRONGLY REJECTED — the tool would refuse every PR" >&2
    fails=1
  fi
  # 2. a version that moves: must be rejected.
  printf 'a 1.0.0\n' >"$d/b2"
  printf 'a 1.1.0\n' >"$d/a2"
  if compare_maps "$d/b2" "$d/a2" 2>/dev/null; then
    echo "self-test version-moved: NOT DETECTED — a bump would ship as a fix" >&2
    fails=1
  else
    echo "self-test version-moved: DETECTED"
  fi
  # 3. an entry that vanishes: must be rejected.
  printf 'a 1.0.0\nb 2.0.0\n' >"$d/b3"
  printf 'a 1.0.0\n' >"$d/a3"
  if compare_maps "$d/b3" "$d/a3" 2>/dev/null; then
    echo "self-test entry-removed: NOT DETECTED" >&2
    fails=1
  else
    echo "self-test entry-removed: DETECTED"
  fi
  # 4. control — identical maps must pass, so cases 2 and 3 are not just noise.
  printf 'a 1.0.0\nb 2.0.0\n' >"$d/b4"
  cp "$d/b4" "$d/a4"
  if compare_maps "$d/b4" "$d/a4" 2>/dev/null; then
    echo "self-test control-identical: accepted (correct)"
  else
    echo "self-test control-identical: WRONGLY REJECTED" >&2
    fails=1
  fi
  rm -rf "$d"
  if [ "$fails" -ne 0 ]; then
    return 1
  fi
  echo "self_test OK — accepts repairs, rejects bumps, cannot pass by being silent"
  return 0
}

# A tool that rejects every valid repair is as useless as one that waves through
# every bump, and only one of those two failure modes shows up as red CI.
if ! self_test; then
  echo "ERROR: internal self-test failed; refusing to run." >&2
  exit 1
fi

if [ "$SELFTEST" -eq 1 ]; then
  exit 0
fi

EXIT_STATUS=0
SUMMARY=()

for pr in "${PRS[@]}"; do
  echo ""
  echo "=============== PR #$pr ==============="

  branch="$(gh pr view "$pr" --json headRefName -q .headRefName 2>/dev/null)"
  want_sha="$(gh pr view "$pr" --json headRefOid -q .headRefOid 2>/dev/null)"
  if [ -z "$branch" ] || [ -z "$want_sha" ]; then
    echo "SKIP: PR #$pr is not resolvable (closed, or gh auth problem)." >&2
    SUMMARY+=("#$pr SKIP unresolved")
    EXIT_STATUS=1
    continue
  fi
  case "$branch" in
    dependabot/*) echo "branch=$branch head=$want_sha" ;;
    *)
      echo "ABORT: '$branch' is not a dependabot branch — refusing to rewrite a human branch." >&2
      SUMMARY+=("#$pr ABORT not-dependabot")
      EXIT_STATUS=1
      continue
      ;;
  esac

  if ! git fetch -q origin "refs/heads/$branch"; then
    echo "ABORT: could not fetch $branch" >&2
    SUMMARY+=("#$pr ABORT fetch")
    EXIT_STATUS=1
    continue
  fi
  base_sha="$(git rev-parse FETCH_HEAD)"
  if [ "$base_sha" != "$want_sha" ]; then
    echo "ABORT: branch tip ($base_sha) differs from the PR head reported by gh ($want_sha)." >&2
    echo "  The branch moved mid-query. Re-run so the whole repair is based on one sha." >&2
    SUMMARY+=("#$pr ABORT sha-mismatch")
    EXIT_STATUS=1
    continue
  fi

  WT="$(mktemp -d "$SCRATCH_ROOT/lockrepair-$pr-XXXXXX")" || {
    echo "ABORT: mktemp failed" >&2
    SUMMARY+=("#$pr ABORT mktemp")
    EXIT_STATUS=1
    continue
  }
  if ! git worktree add --detach "$WT" "$base_sha" >/dev/null 2>&1; then
    echo "ABORT: could not create a worktree at $base_sha" >&2
    rmdir "$WT" 2>/dev/null
    SUMMARY+=("#$pr ABORT worktree")
    EXIT_STATUS=1
    continue
  fi
  WORKTREES+=("$WT")

  fe="$WT/frontend"
  lock="$fe/package-lock.json"
  if [ ! -f "$lock" ]; then
    echo "ABORT: no frontend/package-lock.json on $branch (this script is npm-only)." >&2
    SUMMARY+=("#$pr ABORT no lock")
    continue
  fi

  echo "--- BEFORE: does npm ci reject this lock? (the defect oracle) ---"
  (cd "$fe" && npm ci --dry-run --no-audit --no-fund) >"$WT/before.log" 2>&1
  before_rc=$?
  if [ "$before_rc" -eq 0 ]; then
    echo "OK: lock already syncs (exit 0) — nothing to repair, leaving the branch alone."
    SUMMARY+=("#$pr OK already-clean")
    continue
  fi
  echo "defect confirmed: npm ci --dry-run exit $before_rc"
  grep -oE "Missing: [^ ]+ from lock file" "$WT/before.log" | head -1 | sed 's/^/  /'
  grep -oE "ERESOLVE.*" "$WT/before.log" | head -1 | sed 's/^/  /'

  echo "--- REPAIR: recompute resolution only ---"
  vermap "$lock" >"$WT/map-before.txt"
  (cd "$fe" && npm install --package-lock-only --no-audit --no-fund) >"$WT/repair.log" 2>&1
  repair_rc=$?
  if [ "$repair_rc" -ne 0 ]; then
    echo "FAIL: npm install --package-lock-only exited $repair_rc — branch untouched:" >&2
    tail -5 "$WT/repair.log" >&2
    SUMMARY+=("#$pr FAIL regen")
    EXIT_STATUS=1
    continue
  fi

  echo "--- AFTER: must now sync ---"
  (cd "$fe" && npm ci --dry-run --no-audit --no-fund) >"$WT/after.log" 2>&1
  after_rc=$?
  if [ "$after_rc" -ne 0 ]; then
    echo "FAIL: still unsynced after repair (exit $after_rc) — DO NOT PUSH." >&2
    echo "  A different defect class is present; this script only fixes dropped lock entries:" >&2
    grep -oE "Missing: [^ ]+ from lock file|ERESOLVE.*" "$WT/after.log" | head -2 | sed 's/^/  /' >&2
    SUMMARY+=("#$pr FAIL still-unsynced")
    EXIT_STATUS=1
    continue
  fi
  echo "PASS: npm ci --dry-run exit 0"

  echo "--- INVARIANT: existing entries keep their version, none may vanish ---"
  vermap "$lock" >"$WT/map-after.txt"
  if ! compare_maps "$WT/map-before.txt" "$WT/map-after.txt"; then
    echo "FAIL: the repair altered resolution. Refusing to ship a bump dressed as a fix." >&2
    SUMMARY+=("#$pr FAIL version-moved")
    EXIT_STATUS=1
    continue
  fi
  echo "PASS: $(wc -l <"$WT/map-before.txt") entries unchanged; restored by the repair:"
  if [ -n "$MAP_APPEARED" ]; then
    printf '%s\n' "$MAP_APPEARED" | sed 's/^/  + /'
  else
    echo "  (none — yet the lock was unsynced before; inspect the diff)" >&2
  fi

  echo "--- DIFF SCOPE ---"
  numstat="$(git -C "$WT" diff --numstat)"
  printf '%s\n' "$numstat" | sed 's/^/  /'
  changed="$(printf '%s\n' "$numstat" | awk 'NF {print $3}')"
  if [ "$changed" != "frontend/package-lock.json" ]; then
    echo "FAIL: expected exactly frontend/package-lock.json to change." >&2
    SUMMARY+=("#$pr FAIL scope")
    EXIT_STATUS=1
    continue
  fi

  if [ "$PUSH" -eq 1 ]; then
    echo "--- PUSH ---"
    git -C "$WT" add frontend/package-lock.json
    if ! git -C "$WT" commit -q -F - <<'MSG'
fix(deps): restore lock entries dropped by dependabot

Regenerated resolution only (npm install --package-lock-only). Verified: every
package version in the lock is unchanged, package.json is untouched, and
npm ci --dry-run exits 0 on the result. See
docs/runbooks/dependabot-lock-peer-repair.md and QODER.md §8 G19.
MSG
    then
      echo "FAIL: commit failed" >&2
      SUMMARY+=("#$pr FAIL commit")
      EXIT_STATUS=1
      continue
    fi
    remote_sha="$(git -C "$WT" ls-remote origin "refs/heads/$branch" | cut -f1)"
    if [ "$remote_sha" != "$base_sha" ]; then
      echo "FAIL: $branch moved during the repair ($base_sha -> $remote_sha); not pushing." >&2
      SUMMARY+=("#$pr FAIL raced")
      EXIT_STATUS=1
      continue
    fi
    if git -C "$WT" push -q origin "HEAD:refs/heads/$branch"; then
      echo "PUSHED: $branch -> $(git -C "$WT" rev-parse --short HEAD)"
      SUMMARY+=("#$pr PUSHED")
    else
      echo "FAIL: push rejected." >&2
      SUMMARY+=("#$pr FAIL push")
      EXIT_STATUS=1
    fi
  else
    echo "DRY RUN: all checks passed; re-run with --push to deliver."
    SUMMARY+=("#$pr READY")
  fi
done

echo ""
echo "=============== SUMMARY ==============="
for s in "${SUMMARY[@]}"; do echo "  $s"; done
echo ""
echo "A push only clears the peer-drop failure. Dependabot regenerates the"
echo "branch on its next evaluation, so the defect can return (QODER.md §8 G19)."
exit "$EXIT_STATUS"
