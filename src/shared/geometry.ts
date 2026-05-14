/**
 * Geometry helpers shared between main and renderer processes. Keep this file
 * free of Node / DOM globals so both sides can import it without bundler tricks.
 */

/**
 * Clamp a numeric value into the inclusive `[min, max]` range. If `min > max`
 * the result is `min` (i.e. min wins), matching the behaviour of
 * `Math.max(min, Math.min(value, max))`.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}
