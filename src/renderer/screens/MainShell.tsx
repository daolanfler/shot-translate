import { useEffect, useMemo, useState } from "react";
import { Camera, ClipboardCopy, RotateCcw, Trash2 } from "lucide-react";
import type { AppEvent, AppSettings, HistoryItem } from "../../shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { KeybindingInput } from "@/components/keybinding-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

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

type BadgeTone = "default" | "secondary" | "destructive" | "outline";

function statusBadgeTone(status: HistoryItem["status"]): BadgeTone {
  switch (status) {
    case "success":
      return "default";
    case "error":
    case "ocr_failed":
      return "destructive";
    case "translating":
    case "ocr_processing":
    case "pending":
      return "secondary";
    default:
      return "outline";
  }
}

function statusLabel(status: HistoryItem["status"]): string {
  switch (status) {
    case "ocr_processing":
      return "OCR";
    case "ocr_failed":
      return "OCR failed";
    case "translating":
      return "Translating";
    case "success":
      return "Done";
    case "error":
      return "Error";
    default:
      return "Pending";
  }
}

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
        setBusyMessage(event.payload?.busy ? event.payload?.message ?? "Working…" : "");
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
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading settings…
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[256px_1fr] bg-background text-foreground">
      <aside className="flex flex-col justify-between gap-8 border-r bg-card p-6">
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            Shot Translate
          </p>
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            Capture &amp; translate
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Trigger a region capture, run local OCR, then send the text to an
            OpenAI-compatible translation API.
          </p>
        </div>

        <Card className="gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              Status
            </span>
            <span
              className={
                busyMessage
                  ? "h-1.5 w-1.5 animate-pulse rounded-full bg-primary"
                  : settings.apiKey
                    ? "h-1.5 w-1.5 rounded-full bg-success"
                    : "h-1.5 w-1.5 rounded-full bg-muted-foreground/40"
              }
            />
          </div>
          <p className="text-md font-medium leading-snug">{statusText}</p>
          <Button
            size="sm"
            className="mt-1 w-full"
            onClick={() => window.shotTranslate.startCapture()}
          >
            <Camera className="size-4" />
            Capture now
          </Button>
        </Card>
      </aside>

      <main className="flex h-full min-h-0 flex-col gap-4 overflow-hidden p-6">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "settings" | "history")}
          className="flex h-full min-h-0 flex-col gap-4"
        >
          <TabsList>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {notice ? (
            <div className="rounded-md border border-primary/20 bg-accent px-3 py-2 text-sm text-accent-foreground">
              {notice}
            </div>
          ) : null}

          <TabsContent value="settings" className="mt-0 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="gap-4 p-5">
              <h2 className="text-md font-semibold">Capture</h2>
              <div className="flex flex-col gap-2">
                <Label htmlFor="shortcut">Global shortcut</Label>
                <KeybindingInput
                  id="shortcut"
                  value={settings.shortcut}
                  onChange={(next) => void saveSettings({ shortcut: next })}
                />
                <p className="text-xs text-muted-foreground">
                  Click the field, then press the key combo you want. Esc cancels.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="launchOnStartup"
                  checked={settings.launchOnStartup}
                  onCheckedChange={(checked) =>
                    void saveSettings({ launchOnStartup: checked === true })
                  }
                />
                <Label htmlFor="launchOnStartup" className="text-sm font-normal">
                  Launch on Windows startup
                </Label>
              </div>
            </Card>

            <Card className="gap-4 p-5">
              <h2 className="text-md font-semibold">Translation API</h2>
              <div className="flex flex-col gap-2">
                <Label htmlFor="apiBaseUrl">API base URL</Label>
                <Input
                  id="apiBaseUrl"
                  value={settings.apiBaseUrl}
                  onChange={(event) =>
                    setSettings({ ...settings, apiBaseUrl: event.target.value })
                  }
                  onBlur={(event) => void saveSettings({ apiBaseUrl: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={settings.model}
                  onChange={(event) => setSettings({ ...settings, model: event.target.value })}
                  onBlur={(event) => void saveSettings({ model: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="apiKey">API key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  placeholder="sk-…"
                  value={settings.apiKey}
                  onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
                  onBlur={(event) => void saveSettings({ apiKey: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="apiProxyUrl">HTTP proxy (optional)</Label>
                <Input
                  id="apiProxyUrl"
                  placeholder="http://127.0.0.1:7890"
                  value={settings.apiProxyUrl}
                  onChange={(event) =>
                    setSettings({ ...settings, apiProxyUrl: event.target.value })
                  }
                  onBlur={(event) => void saveSettings({ apiProxyUrl: event.target.value })}
                />
              </div>
            </Card>

            <Card className="gap-4 p-5 lg:col-span-2">
              <h2 className="text-md font-semibold">Languages</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="targetLanguage">Target language</Label>
                  <Select
                    value={settings.targetLanguage}
                    onValueChange={(value) => void saveSettings({ targetLanguage: value })}
                  >
                    <SelectTrigger id="targetLanguage" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {targetLanguageOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <fieldset className="flex flex-col gap-3">
                  <div>
                    <Label>OCR languages</Label>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Which Tesseract packs to load. Each adds 5–40 MB on first use.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ocrLanguageOptions.map((option) => {
                      const checked = settings.ocrLanguages.includes(option.value);
                      return (
                        <label
                          className="flex items-center gap-2 text-sm"
                          key={option.value}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              const next = value
                                ? Array.from(
                                    new Set([...settings.ocrLanguages, option.value])
                                  )
                                : settings.ocrLanguages.filter((v) => v !== option.value);
                              const safe = next.length > 0 ? next : ["eng"];
                              void saveSettings({ ocrLanguages: safe });
                            }}
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-0 flex h-full min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-md font-semibold">Recent translations</h2>
                <p className="text-sm text-muted-foreground">
                  Stored locally; original screenshots are never persisted.
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.shotTranslate.clearHistory()}
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
            </div>
            <Separator />
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col gap-2 pr-3">
                {history.length === 0 ? (
                  <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No translations yet.
                  </div>
                ) : null}
                {history.map((item) => (
                  <Card key={item.id} className="gap-2 p-4">
                    <header className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                      <Badge variant={statusBadgeTone(item.status)}>
                        {statusLabel(item.status)}
                      </Badge>
                    </header>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {item.sourceText || item.errorMessage || "No source text"}
                    </p>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {item.translatedText || "No translation yet"}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!item.sourceText}
                        onClick={() => window.shotTranslate.retryHistoryItem(item.id)}
                      >
                        <RotateCcw className="size-3.5" />
                        Retry
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!item.translatedText}
                        onClick={() =>
                          window.shotTranslate.writeClipboardText(item.translatedText)
                        }
                      >
                        <ClipboardCopy className="size-3.5" />
                        Copy
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
