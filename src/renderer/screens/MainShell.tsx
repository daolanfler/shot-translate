import { useEffect, useMemo, useState } from "react";
import type { AppEvent, AppSettings, HistoryItem } from "../../shared/types";

const targetLanguageOptions = [
  { value: "zh-CN", label: "Chinese (Simplified)" },
  { value: "en", label: "English" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" }
];

const ocrLanguageOptions = [
  { value: "eng", label: "English" },
  { value: "chi_sim", label: "Chinese (Simplified)" },
  { value: "chi_tra", label: "Chinese (Traditional)" },
  { value: "jpn", label: "Japanese" },
  { value: "kor", label: "Korean" },
  { value: "fra", label: "French" },
  { value: "deu", label: "German" }
];

export function MainShell() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busyMessage, setBusyMessage] = useState<string>("");
  const [notice, setNotice] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"settings" | "history">("settings");

  async function refreshHistory() {
    const items = await window.shotTranslate.listHistory();
    setHistory(items);
  }

  useEffect(() => {
    window.shotTranslate.getSettings().then(setSettings);
    void refreshHistory();

    return window.shotTranslate.onAppEvent((event: AppEvent) => {
      if (event.type === "history-updated") {
        void refreshHistory();
      }

      if (event.type === "settings-updated" && event.payload?.message) {
        setNotice(event.payload.message);
      }

      if (event.type === "workflow-status") {
        setBusyMessage(event.payload?.busy ? event.payload?.message ?? "Working..." : "");
      }
    });
  }, []);

  const statusText = useMemo(() => {
    if (busyMessage) {
      return busyMessage;
    }

    if (!settings?.apiKey) {
      return "Add an API key before translating.";
    }

    return "Ready";
  }, [busyMessage, settings?.apiKey]);

  async function saveSettings(patch: Partial<AppSettings>) {
    if (!settings) {
      return;
    }

    const next = { ...settings, ...patch };
    setSettings(next);
    const result = await window.shotTranslate.updateSettings(patch);
    setSettings(result.settings);
    if (!result.shortcutRegistered) {
      setNotice("Shortcut registration failed. It may already be used by another app.");
    }
  }

  if (!settings) {
    return <div className="boot-screen">Loading settings...</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Shot Translate</p>
          <h1>Windows screenshot translation</h1>
          <p className="sidebar-copy">
            Trigger a region capture, run local OCR, then send text to an OpenAI-compatible
            translation API.
          </p>
        </div>
        <div className="status-card">
          <span>Status</span>
          <strong>{statusText}</strong>
          <button className="primary-button" onClick={() => window.shotTranslate.startCapture()}>
            Capture Now
          </button>
        </div>
      </aside>

      <main className="content-panel">
        <div className="tab-row">
          <button
            className={activeTab === "settings" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("settings")}
          >
            Settings
          </button>
          <button
            className={activeTab === "history" ? "tab-button active" : "tab-button"}
            onClick={() => setActiveTab("history")}
          >
            History
          </button>
        </div>

        {notice ? <div className="notice-banner">{notice}</div> : null}

        {activeTab === "settings" ? (
          <section className="card-grid">
            <section className="card">
              <h2>Capture</h2>
              <label className="field">
                <span>Global shortcut</span>
                <input
                  value={settings.shortcut}
                  onChange={(event) => setSettings({ ...settings, shortcut: event.target.value })}
                  onBlur={(event) => void saveSettings({ shortcut: event.target.value })}
                />
              </label>
              <label className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.launchOnStartup}
                  onChange={(event) => void saveSettings({ launchOnStartup: event.target.checked })}
                />
                <span>Launch on Windows startup</span>
              </label>
            </section>

            <section className="card">
              <h2>Translation API</h2>
              <label className="field">
                <span>API base URL</span>
                <input
                  value={settings.apiBaseUrl}
                  onChange={(event) => setSettings({ ...settings, apiBaseUrl: event.target.value })}
                  onBlur={(event) => void saveSettings({ apiBaseUrl: event.target.value })}
                />
              </label>
              <label className="field">
                <span>Model</span>
                <input
                  value={settings.model}
                  onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                  onBlur={(event) => void saveSettings({ model: event.target.value })}
                />
              </label>
              <label className="field">
                <span>API key</span>
                <input
                  type="password"
                  value={settings.apiKey}
                  placeholder="sk-..."
                  onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                  onBlur={(event) => void saveSettings({ apiKey: event.target.value })}
                />
              </label>
              <label className="field">
                <span>HTTP proxy optional</span>
                <input
                  value={settings.apiProxyUrl}
                  placeholder="http://127.0.0.1:7890"
                  onChange={(event) => setSettings({ ...settings, apiProxyUrl: event.target.value })}
                  onBlur={(event) => void saveSettings({ apiProxyUrl: event.target.value })}
                />
              </label>
            </section>

            <section className="card">
              <h2>Language</h2>
              <label className="field">
                <span>Target language</span>
                <select
                  value={settings.targetLanguage}
                  onChange={(event) => void saveSettings({ targetLanguage: event.target.value })}
                >
                  {targetLanguageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="field checkbox-group">
                <legend>OCR languages</legend>
                <p className="checkbox-group-hint">
                  Which Tesseract packs to load. Each adds 5-40&nbsp;MB on first use.
                </p>
                {ocrLanguageOptions.map((option) => {
                  const checked = settings.ocrLanguages.includes(option.value);
                  return (
                    <label className="checkbox-field" key={option.value}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = event.target.checked
                            ? Array.from(new Set([...settings.ocrLanguages, option.value]))
                            : settings.ocrLanguages.filter((value) => value !== option.value);
                          // Guarantee at least one language so OCR can run.
                          const safe = next.length > 0 ? next : ["eng"];
                          void saveSettings({ ocrLanguages: safe });
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </fieldset>
            </section>
          </section>
        ) : (
          <section className="history-panel">
            <div className="history-toolbar">
              <div>
                <h2>Recent translations</h2>
                <p>Stored locally without saving original screenshots.</p>
              </div>
              <button className="secondary-button" onClick={() => window.shotTranslate.clearHistory()}>
                Clear History
              </button>
            </div>

            <div className="history-list">
              {history.length === 0 ? <div className="empty-state">No translations yet.</div> : null}
              {history.map((item) => (
                <article className="history-item" key={item.id}>
                  <header>
                    <strong>{new Date(item.createdAt).toLocaleString()}</strong>
                    <span className={`pill pill-${item.status}`}>{item.status}</span>
                  </header>
                  <p className="history-source">{item.sourceText || item.errorMessage || "No source text"}</p>
                  <p className="history-target">{item.translatedText || "No translation yet"}</p>
                  <div className="history-actions">
                    <button
                      className="secondary-button"
                      disabled={!item.sourceText}
                      onClick={() => window.shotTranslate.retryHistoryItem(item.id)}
                    >
                      Retry
                    </button>
                    <button
                      className="secondary-button"
                      disabled={!item.translatedText}
                      onClick={() => window.shotTranslate.writeClipboardText(item.translatedText)}
                    >
                      Copy
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
