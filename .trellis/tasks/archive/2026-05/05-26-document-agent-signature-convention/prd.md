# Document agent signature convention

## Goal

Record how AI agents should identify themselves in repository commits and GitHub review/comment text.

## Requirements

* Add an agent signature convention to `AGENTS.md`.
* For Codex-authored commits, require a `Co-authored-by` trailer for Codex.
* For GitHub PR reviews or comments created by Codex, require a `[Codex Review]` prefix.
* Keep the change documentation-only.

## Acceptance Criteria

* [ ] `AGENTS.md` clearly documents commit and review/comment signature expectations.
* [ ] The convention is discoverable near existing workflow guidance.

## Definition of Done

* Documentation updated.
* Change committed with the documented Codex co-author trailer.

## Out of Scope

* Changing GitHub connector authentication.
* Rewriting previous commits or comments.
