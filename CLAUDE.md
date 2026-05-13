# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Shot Translate** is a Windows desktop app that captures a screen region, runs local OCR (Tesseract.js), and translates the text via an OpenAI-compatible API. The stack is Electron + React + Vite + TypeScript.

## Commands

```bash
npm run dev          # Start all dev servers concurrently (renderer + main + electron)
npm run build        # Compile renderer (Vite → dist/) + main process (tsc → dist-electron/)
npm run dist         # Build and package NSIS installer for Windows
npm run start        # Launch the already-built app with electron
```

`npm run dev` runs three processes in parallel:
- `dev:renderer` — Vite dev server on `http://localhost:5173`
- `dev:main` — `tsc -w` for the Electron main process
- `dev:electron` — launches Electron once main is compiled

Run `npm run build` after any TypeScript or Electron workflow change before testing the packaged flow.

## Architecture

### Process Boundary

```
Renderer (React)  ←→  Preload (IPC bridge)  ←→  Main Process (Node/Electron)
```

- **Main process** (`src/main/`): app lifecycle, global shortcut, window management, IPC handlers, all Node.js / OS APIs.
- **Preload** (`src/preload/index.ts`): exposes a narrow `window.shotTranslate` API via `contextBridge`. This is the only allowed communication path — do not widen it.
- **Renderer** (`src/renderer/`): React UI. Calls preload API and listens to `app:event` broadcasts from main.
- **Shared types** (`src/shared/types.ts`): TypeScript interfaces shared across all three layers.

### Window Types

| Window | File | Notes |
|--------|------|-------|
| Main | `src/main/windows/mainWindow.ts` | Settings + history tabs, 1180×780 |
| Capture | `src/main/windows/captureWindow.ts` | Transparent overlay on every display, always-on-top |
| Result | `src/main/windows/resultWindow.ts` | Floating translation popup, always-on-top |

### Workflow

1. Global shortcut (`Ctrl+Shift+T` by default) or tray menu triggers capture
2. Transparent overlays open on all displays; user selects a region
3. Renderer crops the captured image and sends it to main via IPC
4. Main runs Tesseract.js OCR (`eng` + `chi_sim`)
5. Main calls the configured OpenAI-compatible API (with optional HTTP proxy via `undici`)
6. Result window shows the translation; entry saved to history (max 50 items)

### Services (`src/main/services/`)

| File | Responsibility |
|------|----------------|
| `ocr.ts` | Tesseract.js worker; language data cached at `{userData}/tessdata/` |
| `translator.ts` | OpenAI chat completions with proxy support via `undici.ProxyAgent` |
| `settings.ts` | Read/write `{userData}/settings.json` |
| `history.ts` | Read/write `{userData}/history.json`, enforces 50-item limit |
| `store.ts` | JSON file I/O helpers |

### TypeScript Configuration

- `tsconfig.json` — renderer (ESNext modules, `bundler` resolution, JSX)
- `tsconfig.electron.json` — main + preload (CommonJS modules, no JSX)

## Key Constraints

- Keep privileged Electron operations in the main process only.
- Never store raw screenshots in history — only OCR text, translated text, status, and errors.
- Do not write Tesseract language data into the repository root; always cache under `app.getPath("userData")`.
- Multi-display behavior and Windows DPI scaling are not fully tested on real hardware.
- Prefer small focused fixes over broad rewrites.
