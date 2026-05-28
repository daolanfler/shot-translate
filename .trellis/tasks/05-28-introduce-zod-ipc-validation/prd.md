# Introduce Zod schemas for IPC payload validation

## Goal

Replace the current hand-written IPC payload validators with Zod schemas so main-process IPC boundaries have a single runtime validation source that can also infer TypeScript payload types.

## What I already know

* The merged PR added `src/main/ipcValidation.ts` with hand-written validators for settings patches, history IDs, capture submit payloads, result movement, clipboard text, renderer errors, and update sources.
* `src/main/ipcHandlers.ts` already routes unknown IPC payloads through validation helpers before calling privileged main-process behavior.
* Existing tests in `src/main/ipcValidation.test.ts` cover representative accept/reject paths for the current validators.
* Project specs already recommend Zod-first types for type-related decisions.

## Assumptions

* This should be a follow-up task, not part of the already merged PR.
* The first implementation should focus on main-process IPC payload validation rather than redesigning the entire preload API.
* Error messages should stay stable enough that renderer behavior and tests do not regress unnecessarily.

## Requirements

* Add Zod as a project dependency if it is not already present.
* Introduce schema-based validation for IPC payloads currently handled by `src/main/ipcValidation.ts`.
* Infer or align TypeScript types from schemas where that reduces duplication without creating churn in unrelated modules.
* Preserve the existing narrow preload API and renderer call sites.
* Keep sender/window-context authorization checks in `src/main/ipcHandlers.ts`; Zod should validate payload shape, not replace process-boundary authorization.
* Migrate in a focused way, with tests covering both valid payloads and rejection cases.

## Acceptance Criteria

* [ ] IPC payload validators use Zod schemas for the migrated payloads.
* [ ] Existing IPC validation behavior is preserved or intentionally documented where changed.
* [ ] Tests cover high-risk schemas: `capture:submit`, `settings:update`, `result:move`, renderer error logging, update source, and history retry inputs.
* [ ] `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.

## Definition of Done

* Tests added or updated for schema validation.
* Type-check and build are green.
* No renderer access to Electron/Node APIs is introduced.
* No unrelated IPC/channel redesign is included.

## Out of Scope

* Replacing the entire shared type system in one pass.
* Changing the preload API shape.
* Introducing a full IPC channel registry unless it is a small helper needed for schema reuse.
* Changing application behavior beyond validation error normalization.

## Technical Notes

* Likely files: `src/main/ipcValidation.ts`, `src/main/ipcValidation.test.ts`, `src/main/ipcHandlers.ts`, `src/shared/types.ts`, `package.json`, `pnpm-lock.yaml`.
* Relevant specs: `.trellis/spec/backend/type-safety.md`, `.trellis/spec/frontend/ipc-electron.md`, `.trellis/spec/shared/typescript.md`, `.trellis/spec/backend/quality.md`.
* Keep main-process imports relative when importing shared types.
