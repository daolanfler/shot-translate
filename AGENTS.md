# AGENTS.md

This file documents project-specific instructions for coding agents working in this repository.

## Project Context

- This is a Windows desktop screenshot translation app.
- The app uses Electron, React, Vite, and TypeScript.
- The core workflow is: global shortcut or button -> region capture -> local OCR -> OpenAI-compatible translation API -> floating result window.
- The project is currently optimized for a minimal usable v1, not a polished Bob Translate clone.

## Development Rules

- Preserve the existing Electron + React architecture unless there is a clear reason to change it.
- Keep Electron privileged operations in the main process.
- Keep preload APIs narrow and IPC-based; do not expose broad Node.js capabilities to the renderer.
- Do not store screenshots in history. Only store recognized text, translated text, status, and errors.
- Do not write Tesseract language data into the repository root. OCR language data should be cached under Electron `userData`.
- Prefer small focused fixes over broad rewrites.
- Run `npm run build` after TypeScript or Electron workflow changes when feasible.

## Git Rules

- Make commits with concise imperative messages.
- Do not amend commits unless explicitly requested.
- Do not use `safe.directory` as a workaround for ownership problems unless explicitly requested by the user.
- If Git metadata permissions break due to sandbox ownership or ACLs, explain the exact permission issue before changing ACLs.

## Current Known Caveats

- Screenshot capture currently uses Electron `desktopCapturer` thumbnails and a renderer-side crop.
- Multi-display and Windows scaling behavior needs more real-machine testing.
- OCR uses Tesseract.js with `eng` and `chi_sim`.
- Translation currently targets OpenAI-compatible chat completions with an API key configured in the app UI.
