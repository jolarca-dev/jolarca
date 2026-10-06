# Encrypted secrets root (ADR-003 amendment, R3 convention)

Files committed here MUST be genuine SOPS output (`sops --encrypt --in-place`).
Plaintext in this directory is a security incident: remove from history and
rotate. Decrypt for use: `SOPS_AGE_KEY_FILE=<identity> sops -d <file>` —
never into a tracked path. The rollout instructions are in the sibling jol-infrastructure
checkout (church) at docs/security/sops-rollout-instructions.md, and the publication notes
in the jolarca-compliance checkout as SOPS-PUBLICATION.md. Both live outside this
repository, so neither is cited as a path of this one — §8 G38 brought this file into C2's
scope on 2026-10-06, and a backticked path inside it would have to resolve here.
