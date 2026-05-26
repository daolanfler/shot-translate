# Document shell environment preference

## Goal

Record the repository-specific shell preference so future Codex sessions use Git Bash on Windows when it is available.

## Requirements

* Add a Shell Environment section to `AGENTS.md`.
* State that on Windows, Codex should prefer Git Bash over PowerShell when Git Bash exists.
* State that PowerShell is the fallback when Git Bash is unavailable or a Windows-specific command requires it.
* Keep the change documentation-only.

## Acceptance Criteria

* [ ] `AGENTS.md` contains the shell preference in a clear, discoverable section.
* [ ] The preference does not conflict with existing project commands.

## Definition of Done

* Documentation updated.
* Git status reviewed.

## Out of Scope

* Code, build, or dependency changes.
* Changing Trellis or Codex runtime configuration.
