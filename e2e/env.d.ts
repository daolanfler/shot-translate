import type { ShotTranslateApi } from "../src/shared/types";

declare global {
  interface Window {
    shotTranslate: ShotTranslateApi;
  }
}

export {};
