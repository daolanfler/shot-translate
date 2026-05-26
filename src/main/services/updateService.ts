import { app, type BrowserWindow } from "electron";
import electronUpdater, {
  type AppUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo
} from "electron-updater";
import type { UpdateSettings, UpdateSource, UpdateState, UpdateStatus } from "../../shared/types";
import { readJsonFile, writeJsonFile } from "./store";

interface UpdateConfig {
  source: UpdateSource;
}

const DEFAULT_SOURCE: UpdateSource = "mirror";
const UPDATE_CONFIG_FILE = "update-settings.json";
const DIRECT_UPDATE_FEED_URL = "https://github.com/daolanfler/shot-translate/releases/latest/download/";
const MIRROR_UPDATE_FEED_URL = `https://ghfast.top/${DIRECT_UPDATE_FEED_URL}`;

export class UpdateService {
  private readonly autoUpdater: AppUpdater;
  private readonly getMainWindow: () => BrowserWindow | null;
  private source: UpdateSource;
  private state: UpdateState;

  constructor(getMainWindow: () => BrowserWindow | null) {
    const { autoUpdater } = electronUpdater;
    this.autoUpdater = autoUpdater;
    this.getMainWindow = getMainWindow;
    this.source = this.loadSource();
    this.state = this.createState("idle");

    this.configureUpdater();
    this.registerUpdaterEvents();

    if (!app.isPackaged) {
      this.updateState({
        status: "disabled",
        errorMessage: "Development mode does not check for updates."
      });
    }
  }

  getState(): UpdateState {
    return { ...this.state };
  }

  getSettings(): UpdateSettings {
    return {
      source: this.source,
      feedUrl: this.getFeedUrl(this.source)
    };
  }

  async setSource(source: unknown): Promise<UpdateSettings> {
    if (this.state.isChecking || this.state.isDownloading) {
      throw new Error("Cannot change update source while an update operation is active.");
    }

    this.source = this.parseSource(source);
    await this.saveConfig();
    this.configureFeedUrl();
    this.updateState({
      status: app.isPackaged ? "idle" : "disabled",
      source: this.source,
      availableVersion: null,
      downloadProgress: null,
      errorMessage: app.isPackaged ? null : "Development mode does not check for updates."
    });
    return this.getSettings();
  }

  startStartupCheck(): void {
    if (!app.isPackaged) {
      return;
    }

    void this.checkForUpdates();
  }

  async checkForUpdates(): Promise<UpdateState> {
    if (!app.isPackaged) {
      this.updateState({
        status: "disabled",
        errorMessage: "Development mode does not check for updates."
      });
      return this.getState();
    }

    if (this.state.isChecking || this.state.isDownloading) {
      return this.getState();
    }

    this.configureFeedUrl();
    this.updateState({
      status: "checking",
      availableVersion: null,
      downloadProgress: null,
      errorMessage: null
    });

    try {
      await this.autoUpdater.checkForUpdates();
    } catch (error) {
      this.updateState({
        status: "error",
        errorMessage: this.formatError(error)
      });
    }

    return this.getState();
  }

  async downloadUpdate(): Promise<UpdateState> {
    if (!app.isPackaged) {
      this.updateState({
        status: "disabled",
        errorMessage: "Development mode does not download updates."
      });
      return this.getState();
    }

    if (!this.state.isUpdateAvailable || this.state.isDownloading) {
      return this.getState();
    }

    this.updateState({
      status: "downloading",
      downloadProgress: 0,
      errorMessage: null
    });

    try {
      await this.autoUpdater.downloadUpdate();
    } catch (error) {
      this.updateState({
        status: "error",
        errorMessage: this.formatError(error)
      });
    }

    return this.getState();
  }

  installUpdate(): void {
    if (!this.state.isUpdateDownloaded) {
      return;
    }

    this.autoUpdater.quitAndInstall(false, true);
  }

  private configureUpdater(): void {
    this.autoUpdater.autoDownload = false;
    this.autoUpdater.autoInstallOnAppQuit = false;
    this.autoUpdater.allowPrerelease = false;
    this.configureFeedUrl();
  }

  private configureFeedUrl(): void {
    this.autoUpdater.setFeedURL({
      provider: "generic",
      url: this.getFeedUrl(this.source)
    });
  }

  private registerUpdaterEvents(): void {
    this.autoUpdater.on("checking-for-update", () => {
      this.updateState({ status: "checking", errorMessage: null });
    });

    this.autoUpdater.on("update-available", (info: UpdateInfo) => {
      this.updateState({
        status: "available",
        availableVersion: info.version,
        downloadProgress: null,
        errorMessage: null
      });
    });

    this.autoUpdater.on("update-not-available", () => {
      this.updateState({
        status: "not-available",
        availableVersion: null,
        downloadProgress: null,
        errorMessage: null
      });
    });

    this.autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      this.updateState({
        status: "downloading",
        downloadProgress: Math.round(progress.percent),
        errorMessage: null
      });
    });

    this.autoUpdater.on("update-downloaded", (event: UpdateDownloadedEvent) => {
      this.updateState({
        status: "downloaded",
        availableVersion: event.version,
        downloadProgress: 100,
        errorMessage: null
      });
    });

    this.autoUpdater.on("error", (error: Error) => {
      this.updateState({
        status: "error",
        errorMessage: this.formatError(error)
      });
    });
  }

  private updateState(nextState: Partial<UpdateState>): void {
    const status = nextState.status ?? this.state.status;
    const source = nextState.source ?? this.source;

    this.state = {
      ...this.state,
      ...nextState,
      status,
      source,
      currentVersion: app.getVersion(),
      isChecking: status === "checking",
      isUpdateAvailable: status === "available",
      isDownloading: status === "downloading",
      isUpdateDownloaded: status === "downloaded"
    };

    this.sendState();
  }

  private sendState(): void {
    const window = this.getMainWindow();

    if (!window || window.isDestroyed()) {
      return;
    }

    window.webContents.send("updates:state-changed", this.getState());
  }

  private createState(status: UpdateStatus): UpdateState {
    return {
      status,
      source: this.source,
      currentVersion: app.getVersion(),
      availableVersion: null,
      downloadProgress: null,
      errorMessage: null,
      isChecking: status === "checking",
      isUpdateAvailable: status === "available",
      isDownloading: status === "downloading",
      isUpdateDownloaded: status === "downloaded"
    };
  }

  private getFeedUrl(source: UpdateSource): string {
    return source === "github" ? DIRECT_UPDATE_FEED_URL : MIRROR_UPDATE_FEED_URL;
  }

  private loadSource(): UpdateSource {
    const config = readJsonFile<Partial<UpdateConfig>>(UPDATE_CONFIG_FILE, {});
    return this.parseSource(config.source);
  }

  private async saveConfig(): Promise<void> {
    await writeJsonFile(UPDATE_CONFIG_FILE, { source: this.source });
  }

  private parseSource(source: unknown): UpdateSource {
    return source === "github" || source === "mirror" ? source : DEFAULT_SOURCE;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error && error.message.trim()) {
      return `${error.message}. You can switch the update source and retry.`;
    }

    return "Update check failed. You can switch the update source and retry.";
  }
}
