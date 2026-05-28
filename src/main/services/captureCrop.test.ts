import { describe, expect, it } from "vitest";
import { calculateCaptureCropRect } from "./captureCrop";

describe("calculateCaptureCropRect", () => {
  it("maps work-area screen coordinates to bitmap coordinates", () => {
    expect(
      calculateCaptureCropRect(
        { x: 150, y: 260, width: 200, height: 100 },
        { x: 100, y: 200, width: 400, height: 300 },
        { width: 800, height: 600 }
      )
    ).toEqual({ x: 100, y: 120, width: 400, height: 200 });
  });

  it("clamps selections at bitmap edges", () => {
    expect(
      calculateCaptureCropRect(
        { x: 90, y: 190, width: 500, height: 400 },
        { x: 100, y: 200, width: 400, height: 300 },
        { width: 800, height: 600 }
      )
    ).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it("preserves a minimum one-pixel crop for tiny edge selections", () => {
    expect(
      calculateCaptureCropRect(
        { x: 499.8, y: 499.8, width: 0.1, height: 0.1 },
        { x: 100, y: 200, width: 400, height: 300 },
        { width: 800, height: 600 }
      )
    ).toEqual({ x: 799, y: 599, width: 1, height: 1 });
  });
});
