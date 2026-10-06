# jolarca — activate the one authoritative virtualenv, from anywhere in the repo.
#
# WHY THIS FILE EXISTS (QODER.md §8 G37, incident JOL-PROC-20261006-02).
# `make bootstrap` *creates* .venv and nothing in this repository ever activated it:
# measured 2026-10-06, `git grep -nI 'activate' -- '*.md' Makefile scripts '*.yml'`
# returned **no match** in any tracked file, so no reader of CONTRIBUTING.md's setup
# block was ever told to. Every Makefile target stayed immune because it invokes
# $(ROOT)/.venv/bin/python explicitly, so all seven gates of `make verify` reported
# PASS while hand-typed commands ran somewhere else: `ruff` resolved to
# ~/.local/bin/ruff at **0.16.5** against the **0.16.6** pinned in
# `backend/requirements/dev.txt` and installed by CI, and bare `python` was absent
# from PATH entirely. A local "pass" was therefore measured with tools CI does not
# run — §8 G14's failure mode, in the interactive shell G14's own detector states it
# cannot see, because it is always invoked as `.venv/bin/python …`.
#
# Usage:
#   source scripts/activate.sh     # this shell only
#   make shell                     # a fresh shell with it already active
#
# The `(.venv)` prompt label is a consequence, not the goal: it follows VIRTUAL_ENV,
# which the venv's own activate script sets and this wrapper ensures. A label is
# per-process and dies with its shell — which is exactly how "my venv is broken"
# readings arise on this host. The venv's own bin/activate does the work, so a
# rebuilt or relocated venv needs no change here.

if [ -n "${ZSH_EVAL_CONTEXT:-}" ]; then
  # zsh: the sourced file's path is only reachable through an expansion zsh parses,
  # so it stays inside eval and never reaches a POSIX shell reading this file.
  __jolarca_src=$(eval 'printf %s "${(%):-%N}"' 2>/dev/null || echo "$0")
elif [ -n "${BASH_SOURCE:-}" ]; then
  __jolarca_src="${BASH_SOURCE[0]}"
else
  __jolarca_src="$0"
fi

# Executing this file cannot activate anything: it would set variables in a child
# that exits immediately. Refuse loudly instead of silently doing nothing.
if [ "$__jolarca_src" = "$0" ]; then
  echo "jolarca: activate.sh must be SOURCED, not executed ->  source scripts/activate.sh" >&2
  unset __jolarca_src
  return 2 2>/dev/null || exit 2
fi

__jolarca_root=$(cd -- "$(dirname -- "$__jolarca_src")/.." && pwd)
__jolarca_venv="$__jolarca_root/.venv"
unset __jolarca_src

if [ ! -f "$__jolarca_venv/bin/activate" ]; then
  echo "jolarca: no interpreter at $__jolarca_venv ->  run 'make bootstrap' first" >&2
  unset __jolarca_root __jolarca_venv
  return 1
fi

if [ "${VIRTUAL_ENV:-}" = "$__jolarca_venv" ]; then
  # Already active. Re-sourcing would prepend .venv/bin a second time and leave the
  # duplicates PATH hygiene exists to avoid, so only re-assert the label's input.
  export VIRTUAL_ENV="$__jolarca_venv"
else
  # A different venv in front would keep winning PATH resolution after activation,
  # so drop it first if we can; otherwise say so instead of pretending otherwise.
  if [ -n "${VIRTUAL_ENV:-}" ]; then
    if [ -n "$(type -t deactivate 2>/dev/null)" ]; then
      deactivate
    else
      echo "jolarca: another venv is active ($VIRTUAL_ENV) and defines no deactivate;" \
        "open a new shell if tools resolve outside $__jolarca_venv" >&2
    fi
  fi
  # bin/activate is mode 644 on this host (created by `python3 -m virtualenv`),
  # so it is sourced, never executed.
  # shellcheck disable=SC1091
  . "$__jolarca_venv/bin/activate"
fi

# Prove the activation rather than asserting it. A tool that still resolves outside
# the venv means something re-ordered PATH *after* this ran — the ~/.bashrc env.sh
# hijack recorded in §8 G14/G37 — and the operator learns it here instead of from a
# lint verdict that quietly came from a different version.
__jolarca_stray=""
for __jolarca_tool in python ruff mypy pytest django-admin; do
  __jolarca_where=$(command -v "$__jolarca_tool" 2>/dev/null || true)
  case "$__jolarca_where" in
  "$__jolarca_venv"/bin/*) ;;
  *) __jolarca_stray="${__jolarca_stray:+$__jolarca_stray }$__jolarca_tool" ;;
  esac
done

if [ -n "$__jolarca_stray" ]; then
  echo "jolarca: NOT resolving from .venv: $__jolarca_stray" >&2
  echo "jolarca: something repended PATH after activation — do not trust local lint/test output" >&2
else
  __jolarca_py=$("${__jolarca_venv}/bin/python" --version 2>&1 | awk '{print $2}')
  __jolarca_ruff=$("${__jolarca_venv}/bin/python" -m ruff --version 2>&1 | awk '{print $2}')
  __jolarca_dj=$("${__jolarca_venv}/bin/python" -c 'import django; print(django.get_version())' 2>/dev/null || echo unknown)
  echo "jolarca: .venv active — python ${__jolarca_py}, ruff ${__jolarca_ruff}, Django ${__jolarca_dj}"
  unset __jolarca_py __jolarca_ruff __jolarca_dj
fi

unset __jolarca_root __jolarca_venv __jolarca_stray __jolarca_tool __jolarca_where
