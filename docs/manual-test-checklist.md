# Manual Test Checklist

Run these checks after changes that affect capture, OCR, translation, settings, or IPC.

## Settings

- Save a valid API key, base URL, model, and optional proxy.
- Click **Test connection** with valid settings and confirm it reports success.
- Click **Test connection** with an invalid API key and confirm it reports an authentication error.
- Click **Test connection** with an invalid base URL and confirm it reports a URL or network error.
- Enter an invalid global shortcut and confirm the previous shortcut is preserved.
- Enter a shortcut already used by another app and confirm the previous shortcut is preserved.

## Capture Flow

- Start capture from the main window.
- Press `Esc` and confirm capture closes and status returns to ready.
- Drag a normal region with visible text and confirm OCR then translation runs.
- Drag a tiny region and confirm capture exits instead of leaving the app stuck.
- Capture an area with no text and confirm the result explains that no text was detected.

## Result Window

- Confirm long source and translation text scroll inside the result window.
- Drag the result window by its header.
- Copy source text.
- Copy translated text.
- Edit source text and retry translation.

## History

- Search by source text, translated text, and error text.
- Filter by done, error, OCR failed, and processing statuses.
- Copy source text from a history item.
- Copy translated text from a history item.
- Edit source text in a history item and retry translation.
- Delete a single history item.
- Clear all history.

## Display / DPI

- Test capture on the primary display.
- Test capture on a secondary display.
- Test result-window placement near selected regions at each screen edge.
- Repeat with Windows display scaling above 100%.
