import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
}

/**
 * Translation of a few `KeyboardEvent.key` values that don't already match
 * Electron's accelerator key names. Anything not in this map is passed
 * through after a per-shape normalisation.
 */
const KEY_TO_ACCELERATOR: Record<string, string> = {
  Enter: "Return",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
  "+": "Plus"
};

const FUNCTION_KEY = /^F([1-9]|1[0-9]|2[0-4])$/;
const NAMED_KEYS = new Set([
  "Tab",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown"
]);

function isModifierKey(key: string): boolean {
  return key === "Control" || key === "Alt" || key === "Shift" || key === "Meta";
}

function collectModifiers(event: KeyboardEvent): string[] {
  const mods: string[] = [];
  // Electron's CommandOrControl maps to Cmd on macOS and Ctrl on Win/Linux.
  if (event.ctrlKey || event.metaKey) mods.push("CommandOrControl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  return mods;
}

function normaliseKey(key: string): string | null {
  if (KEY_TO_ACCELERATOR[key]) return KEY_TO_ACCELERATOR[key];
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (FUNCTION_KEY.test(key)) return key;
  if (NAMED_KEYS.has(key)) return key;
  // Punctuation / symbols (most are accepted as-is by Electron).
  if (key.length === 1) return key;
  return null;
}

export function KeybindingInput({ value, onChange, placeholder, id }: Props) {
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!recording) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        setRecording(false);
        inputRef.current?.blur();
        return;
      }

      // Wait until a non-modifier key is pressed.
      if (isModifierKey(event.key)) {
        return;
      }

      const main = normaliseKey(event.key);
      if (!main) {
        return;
      }

      const mods = collectModifiers(event);

      // Require at least one modifier UNLESS it's a function key —
      // single-letter or single-digit global shortcuts would intercept
      // every keystroke and break normal typing.
      if (mods.length === 0 && !FUNCTION_KEY.test(main)) {
        return;
      }

      const accelerator = [...mods, main].join("+");
      onChange(accelerator);
      setRecording(false);
      inputRef.current?.blur();
    }

    // Capture phase + window-level so we beat the input's default handling.
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [recording, onChange]);

  return (
    <Input
      ref={inputRef}
      id={id}
      readOnly
      value={recording ? "Press a key combo…" : value}
      placeholder={placeholder ?? "Click to record a shortcut"}
      onFocus={() => setRecording(true)}
      onBlur={() => setRecording(false)}
      className={cn(
        "cursor-pointer caret-transparent select-none",
        recording && "ring-2 ring-ring/60 ring-offset-1"
      )}
    />
  );
}
