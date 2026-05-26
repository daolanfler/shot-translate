# Update gitignore for local agent files

## Goal

Keep repository status clean by ignoring local AI agent, Trellis workflow, and package-manager cache directories that are created during local development but should not be committed.

## Requirements

* Ignore local AI/tooling workspace directories at the repository root:
  * `.agents/`
  * `.claude/`
  * `.codex/`
  * `.trellis/`
* Ignore the local pnpm store directory `.pnpm-store/` when it exists in the repository root.
* Preserve existing build, log, environment, editor, and OCR data ignore rules.

## Acceptance Criteria

* [ ] `git status --porcelain` no longer reports `.agents/`, `.claude/`, `.codex/`, or `.trellis/` as untracked.
* [ ] `.gitignore` remains organized and readable.

## Definition of Done

* `.gitignore` updated with focused local-tooling ignore rules.
* Git status verified after the update.

## Technical Approach

Add a small "Local tooling" section to `.gitignore` and remove the now-redundant `.claude/settings.local.json` rule because the full `.claude/` directory will be ignored.

## Out of Scope

* Application code changes.
* Build, typecheck, or Electron runtime changes.
* Committing or archiving the Trellis task.

## Technical Notes

* Current untracked paths before the change: `.agents/`, `.claude/`, `.codex/`, `.trellis/`.
* Root directory also contains `.pnpm-store/`, which is local package-manager state.
