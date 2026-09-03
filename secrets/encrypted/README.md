# Encrypted secrets root (ADR-003 amendment, R3 convention)

Files committed here MUST be genuine SOPS output (`sops --encrypt --in-place`).
Plaintext in this directory is a security incident: remove from history and
rotate. Decrypt for use: `SOPS_AGE_KEY_FILE=<identity> sops -d <file>` —
never into a tracked path.

Cross-project references:
- Church-platform tree: `journeyoflife-org/jol-infrastructure/docs/security/sops-rollout-instructions.md`
- Marketplace tree: `jolarca-dev/jolarca-compliance/SOPS-PUBLICATION.md`
