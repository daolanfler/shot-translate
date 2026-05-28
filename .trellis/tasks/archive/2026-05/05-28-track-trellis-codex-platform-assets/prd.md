# Track Trellis Codex platform assets

## Goal

Track the generated Trellis Codex platform assets in the repository so new Codex App worktrees and sessions have the Trellis workflow skills, agents, and hooks available without manually rerunning `trellis init --codex`.

## Context

The repository already uses Trellis for task and workflow management, but `.agents/` and `.codex/` were ignored. That means a newly-created Git worktree does not include Codex-facing Trellis skills such as `trellis-finish-work`, even though the main checkout has them locally.

Running `trellis init --codex --skip-existing -y -u Qi` in this worktree generated the missing Codex platform assets. The current uncommitted changes for this task are:

- `.agents/skills/trellis-*`
- `.codex/agents/trellis-*.toml`
- `.codex/hooks/*`
- `.codex/hooks.json`
- `.codex/config.toml`
- `.gitignore` updates to stop ignoring `.agents/` and `.codex/`

## Requirements

- Commit Trellis Codex platform assets that are needed by Codex App sessions.
- Keep local runtime and identity files ignored, including `.trellis/.developer`, `.trellis/.runtime/`, and `.trellis/.template-hashes.json`.
- Do not include unrelated task archive, journal, or session runtime files.
- Preserve the existing Trellis task/spec content.

## Acceptance Criteria

- [ ] `.agents/skills/trellis-finish-work/SKILL.md` is tracked.
- [ ] `.codex/config.toml`, `.codex/hooks.json`, hooks, and Trellis agent definitions are tracked.
- [ ] New worktrees receive the Codex-facing Trellis assets from Git.
- [ ] Local Trellis runtime files remain ignored.
