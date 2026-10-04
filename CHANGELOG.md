# Changelog

All notable changes to this project are documented here.

**This file is hand-maintained.** Nothing generates it: no make target and no
workflow runs a changelog generator, so the "generated from Conventional
Commits — do not edit by hand" claim this file previously carried was false, and
`docs/CHANGELOG.md` repeated it. Conventional Commits is a *convention* here —
not machine-enforced and not machine-consumed (`CONTRIBUTING.md` → *Commit
style*).

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Known incompleteness — do not treat this file as the change record.** The
> entries below stop at the repository scaffold and do **not** cover the ~164
> PRs merged since. Authoritative history is `git log` and the GitHub PR list.
> Either backfill this file or delete it; leaving it as a stub that claims to be
> generated is the worst of the three options.

## [Unreleased]

### Added
- Repository scaffold: monorepo layout, governance documents, CI/CD workflows,
  Docker topology, Django backend skeleton (11 apps), Next.js frontend skeleton,
  compliance documentation (ADRs, compliance matrix).
