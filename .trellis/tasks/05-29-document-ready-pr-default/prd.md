# Document ready PR default

## Goal

Document the repository preference that Codex-created pull requests should be opened ready for review by default.

## Requirements

- Update `AGENTS.md` with the PR readiness convention.
- Keep the rule scoped to Codex-created GitHub pull requests.
- Preserve the existing draft option when the user explicitly requests a draft.

## Acceptance Criteria

- [ ] `AGENTS.md` tells Codex to create ready PRs by default.
- [ ] The guidance still allows draft PRs when explicitly requested.
