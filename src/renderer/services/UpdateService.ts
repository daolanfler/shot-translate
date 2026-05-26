import type { UpdateSettings, UpdateSource, UpdateState } from "../../shared/types";

export class UpdateService {
  static getState(): Promise<UpdateState> {
    return window.shotTranslate.getUpdateState();
  }

  static getSettings(): Promise<UpdateSettings> {
    return window.shotTranslate.getUpdateSettings();
  }

  static setSource(source: UpdateSource): Promise<UpdateSettings> {
    return window.shotTranslate.setUpdateSource(source);
  }

  static checkForUpdates(): Promise<UpdateState> {
    return window.shotTranslate.checkForUpdates();
  }

  static downloadUpdate(): Promise<UpdateState> {
    return window.shotTranslate.downloadUpdate();
  }

  static installUpdate(): Promise<void> {
    return window.shotTranslate.installUpdate();
  }

  static onStateChanged(callback: (state: UpdateState) => void): () => void {
    return window.shotTranslate.onUpdateStateChanged(callback);
  }
}
