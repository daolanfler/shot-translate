import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Home,
  KeyRound,
  Languages,
  Loader2,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  WandSparkles
} from "lucide-react";
import type {
  AppEvent,
  AppSettings,
  HistoryItem,
  HistoryStatus,
  ServiceResult
} from "../../shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const targetLanguageOptions = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" }
];

const ocrLanguageOptions = [
  { value: "eng", label: "English" },
  { value: "chi_sim", label: "简体中文" },
  { value: "chi_tra", label: "繁體中文" },
  { value: "jpn", label: "日本語" },
  { value: "kor", label: "한국어" },
  { value: "fra", label: "Français" },
  { value: "deu", label: "Deutsch" }
];

const apiBaseUrlOptions = [
  { value: "https://api.openai.com/v1", label: "OpenAI" },
  { value: "custom", label: "自定义" }
];

type PageKey = "home" | "history" | "api" | "settings";
type SaveState = "idle" | "saving" | "saved" | "error";
type HistoryFilter = "all" | "success" | "failed" | "processing";

const navItems: Array<{ key: PageKey; label: string; icon: typeof Home }> = [
  { key: "home", label: "首页", icon: Home },
  { key: "history", label: "历史", icon: Clock3 },
  { key: "api", label: "模型/API", icon: WandSparkles },
  { key: "settings", label: "设置", icon: Settings }
];

function isProcessingStatus(status: HistoryStatus) {
  return status === "pending" || status === "ocr_processing" || status === "translating";
}

function statusLabel(status: HistoryItem["status"]): string {
  switch (status) {
    case "ocr_processing":
      return "OCR";
    case "ocr_failed":
      return "OCR 失败";
    case "translating":
      return "翻译中";
    case "success":
      return "成功";
    case "error":
      return "失败";
    default:
      return "等待中";
  }
}

function statusBadgeClass(status: HistoryItem["status"]) {
  if (status === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "error" || status === "ocr_failed") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function formatShortcut(shortcut: string) {
  return shortcut
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatDateGroup(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric"
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function previewText(...values: Array<string | undefined>) {
  const text = values.find((value) => value?.trim());
  return text?.trim() || "暂无内容";
}

function Section({
  title,
  description,
  children,
  action
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-white px-6 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function MainShell() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busyMessage, setBusyMessage] = useState<string>("");
  const [page, setPage] = useState<PageKey>("home");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [pageMessage, setPageMessage] = useState("");
  const [testingApi, setTestingApi] = useState(false);
  const [apiResult, setApiResult] = useState<ServiceResult | null>(null);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [sourceDrafts, setSourceDrafts] = useState<Record<string, string>>({});

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
        setPageMessage(event.payload.message);
      }

      if (event.type === "workflow-status") {
        setBusyMessage(event.payload?.busy ? event.payload?.message ?? "处理中..." : "");
      }
    });
  }, []);

  const latestItem = history[0];
  const shortcutParts = settings ? formatShortcut(settings.shortcut) : [];
  const statusText = useMemo(() => {
    if (busyMessage) {
      if (busyMessage.includes("OCR") || busyMessage.includes("Recognizing")) {
        return "OCR 识别中";
      }

      if (busyMessage.includes("Translating")) {
        return "正在翻译";
      }

      return busyMessage;
    }

    if (!settings?.apiKey) {
      return "缺少 API Key";
    }

    return "准备就绪";
  }, [busyMessage, settings?.apiKey]);

  const apiStatus = useMemo(() => {
    if (!settings?.apiKey) {
      return { label: "未配置", className: "bg-slate-100 text-slate-600" };
    }

    if (!apiResult) {
      return { label: "未测试", className: "bg-amber-50 text-amber-700" };
    }

    if (apiResult.ok) {
      return { label: "连接成功", className: "bg-emerald-50 text-emerald-700" };
    }

    return { label: "连接失败", className: "bg-red-50 text-red-700" };
  }, [apiResult, settings?.apiKey]);

  const filteredHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();

    return history.filter((item) => {
      const matchesFilter =
        historyFilter === "all"
          ? true
          : historyFilter === "failed"
            ? item.status === "error" || item.status === "ocr_failed"
            : historyFilter === "processing"
              ? isProcessingStatus(item.status)
              : item.status === "success";
      const haystack = [item.sourceText, item.translatedText, item.errorMessage ?? ""]
        .join("\n")
        .toLowerCase();
      return matchesFilter && (query ? haystack.includes(query) : true);
    });
  }, [history, historyFilter, historySearch]);

  const groupedHistory = useMemo(() => {
    const groups: Array<{ date: string; items: HistoryItem[] }> = [];

    for (const item of filteredHistory) {
      const date = formatDateGroup(item.createdAt);
      const last = groups.at(-1);

      if (last?.date === date) {
        last.items.push(item);
      } else {
        groups.push({ date, items: [item] });
      }
    }

    return groups;
  }, [filteredHistory]);

  async function saveSettings(patch: Partial<AppSettings>) {
    if (!settings) {
      return;
    }

    const next = { ...settings, ...patch };
    setSettings(next);
    setSaveState("saving");
    setPageMessage("");

    try {
      const result = await window.shotTranslate.updateSettings(patch);
      setSettings(result.settings);
      setSaveState(result.shortcutRegistered ? "saved" : "error");
      setPageMessage(result.message);
    } catch (error) {
      setSaveState("error");
      setPageMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function testApiConnection() {
    if (!settings) {
      return;
    }

    setTestingApi(true);
    const result = await window.shotTranslate.testApiConnection(settings);
    setApiResult(result);
    setTestingApi(false);
  }

  async function retryWithDraft(item: HistoryItem) {
    const sourceText = (sourceDrafts[item.id] ?? item.sourceText).trim();
    if (!sourceText) {
      setPageMessage("这条记录没有 OCR 原文，请重新截图。");
      return;
    }

    await window.shotTranslate.retryHistoryItem(item.id, sourceText);
  }

  if (!settings) {
    return (
      <div className="grid h-full place-items-center bg-[#f5f6f8] text-sm text-muted-foreground">
        正在加载...
      </div>
    );
  }

  const apiBasePreset =
    apiBaseUrlOptions.some((option) => option.value === settings.apiBaseUrl) ? settings.apiBaseUrl : "custom";

  const renderHome = () => (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <Section
        title="截图翻译"
        description="框选屏幕区域后，本地 OCR 会先识别文字，再调用模型翻译。"
        action={
          <Button size="lg" onClick={() => window.shotTranslate.startCapture()}>
            <Camera className="size-4" />
            截图翻译
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-xl border bg-slate-50 px-4 py-3 text-sm font-medium">
            <span className={cn("h-2 w-2 rounded-full", busyMessage ? "animate-pulse bg-primary" : "bg-emerald-500")} />
            {statusText}
          </span>
          <span className="inline-flex items-center gap-1 rounded-xl border bg-white px-4 py-3 font-mono text-sm font-semibold">
            {shortcutParts.map((part, index) => (
              <span className="contents" key={`${part}-${index}`}>
                {index > 0 ? <span className="text-muted-foreground">+</span> : null}
                <span>{part}</span>
              </span>
            ))}
          </span>
          <span className={cn("inline-flex items-center rounded-xl px-4 py-3 text-sm font-medium", apiStatus.className)}>
            {apiStatus.label}
          </span>
          {!settings.apiKey ? (
            <Button variant="outline" onClick={() => setPage("api")}>
              去配置模型/API
            </Button>
          ) : null}
        </div>
        <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-sm">
          {["截图", "OCR", "翻译"].map((step, index) => (
            <span
              className="rounded-xl border bg-slate-50 px-4 py-3 text-center font-medium text-slate-700"
              key={step}
            >
              {step}
            </span>
          )).flatMap((node, index, arr) =>
            index < arr.length - 1
              ? [node, <span className="text-center text-muted-foreground" key={`arrow-${index}`}>→</span>]
              : [node]
          )}
        </div>
      </Section>

      <Section title="最近一次" description="快速确认上一条翻译状态。">
        {latestItem ? (
          <button
            className="w-full rounded-2xl border bg-white px-5 py-4 text-left transition hover:border-primary/30 hover:bg-slate-50"
            onClick={() => {
              setExpandedHistoryId(latestItem.id);
              setPage("history");
            }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-muted-foreground">
                {formatTime(latestItem.createdAt)}
              </span>
              <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", statusBadgeClass(latestItem.status))}>
                {statusLabel(latestItem.status)}
              </span>
            </div>
            <p className="truncate text-base font-medium">{previewText(latestItem.sourceText, latestItem.errorMessage)}</p>
            <p className="mt-2 truncate text-sm text-muted-foreground">
              {previewText(latestItem.translatedText, latestItem.errorMessage)}
            </p>
          </button>
        ) : (
          <div className="rounded-2xl border border-dashed bg-slate-50 px-6 py-10 text-center text-sm text-muted-foreground">
            还没有翻译记录。点击“截图翻译”开始第一条。
          </div>
        )}
      </Section>
    </div>
  );

  const renderHistory = () => (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-xl bg-white pl-9"
            placeholder="搜索历史"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
          />
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1">
          {[
            ["all", "全部"],
            ["success", "成功"],
            ["failed", "失败"],
            ["processing", "处理中"]
          ].map(([value, label]) => (
            <button
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition",
                historyFilter === value && "bg-white text-foreground shadow-sm"
              )}
              key={value}
              onClick={() => setHistoryFilter(value as HistoryFilter)}
            >
              {label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => window.shotTranslate.clearHistory()}>
          <Trash2 className="size-4" />
          清空
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 pr-3">
        <div className="flex flex-col gap-6">
          {groupedHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white px-6 py-12 text-center text-sm text-muted-foreground">
              没有匹配的历史记录。
            </div>
          ) : null}
          {groupedHistory.map((group) => (
            <section className="flex flex-col gap-3" key={group.date}>
              <h3 className="px-1 text-sm font-semibold text-muted-foreground">{group.date}</h3>
              {group.items.map((item) => {
                const expanded = expandedHistoryId === item.id;
                const sourceDraft = sourceDrafts[item.id] ?? item.sourceText;
                const canRetry = sourceDraft.trim().length > 0 && !isProcessingStatus(item.status);

                return (
                  <article className="rounded-2xl border bg-white px-5 py-4" key={item.id}>
                    <button
                      className="w-full text-left"
                      onClick={() => setExpandedHistoryId(expanded ? null : item.id)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold text-muted-foreground">{formatTime(item.createdAt)}</span>
                        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", statusBadgeClass(item.status))}>
                          {statusLabel(item.status)}
                        </span>
                      </div>
                      <p className="mt-3 truncate text-base">{previewText(item.sourceText, item.errorMessage)}</p>
                      <p className="mt-2 truncate text-sm text-muted-foreground">
                        {previewText(item.translatedText, item.errorMessage)}
                      </p>
                    </button>

                    {expanded ? (
                      <div className="mt-4 border-t pt-4">
                        <div className="grid gap-3 lg:grid-cols-2">
                          <Field label="原文">
                            <textarea
                              className="min-h-28 resize-y rounded-xl border bg-slate-50 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              value={sourceDraft}
                              placeholder={item.errorMessage || "暂无原文"}
                              onChange={(event) =>
                                setSourceDrafts((drafts) => ({
                                  ...drafts,
                                  [item.id]: event.target.value
                                }))
                              }
                            />
                          </Field>
                          <div className="flex flex-col gap-2">
                            <span className="text-sm font-medium">译文</span>
                            <div className="min-h-28 rounded-xl border bg-slate-50 px-3 py-2 text-sm whitespace-pre-wrap break-words">
                              {item.translatedText || item.errorMessage || "暂无译文"}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" disabled={!sourceDraft.trim()} onClick={() => window.shotTranslate.writeClipboardText(sourceDraft)}>
                            <ClipboardCopy className="size-3.5" />
                            复制原文
                          </Button>
                          <Button variant="outline" size="sm" disabled={!item.translatedText} onClick={() => window.shotTranslate.writeClipboardText(item.translatedText)}>
                            <ClipboardCopy className="size-3.5" />
                            复制译文
                          </Button>
                          <Button variant="outline" size="sm" disabled={!canRetry} onClick={() => void retryWithDraft(item)}>
                            <RotateCcw className="size-3.5" />
                            重新翻译
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => window.shotTranslate.deleteHistoryItem(item.id)}>
                            <Trash2 className="size-3.5" />
                            删除
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  const renderApi = () => (
    <div className="flex flex-col gap-5">
      <Section
        title="模型/API"
        description="配置 OpenAI-compatible 接口并测试连接。"
        action={<span className={cn("rounded-full px-3 py-1 text-xs font-medium", apiStatus.className)}>{apiStatus.label}</span>}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="服务类型">
            <div className="rounded-xl border bg-slate-50 px-3 py-2 text-sm font-medium">OpenAI Compatible</div>
          </Field>
          <Field label="API Base">
            <Select
              value={apiBasePreset}
              onValueChange={(value) => {
                if (value !== "custom") {
                  void saveSettings({ apiBaseUrl: value });
                }
              }}
            >
              <SelectTrigger className="h-10 rounded-xl bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {apiBaseUrlOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="API Base URL">
            <Input
              className="h-10 rounded-xl bg-white"
              value={settings.apiBaseUrl}
              onChange={(event) => setSettings({ ...settings, apiBaseUrl: event.target.value })}
              onBlur={(event) => void saveSettings({ apiBaseUrl: event.target.value })}
            />
          </Field>
          <Field label="Model">
            <Input
              className="h-10 rounded-xl bg-white"
              value={settings.model}
              onChange={(event) => setSettings({ ...settings, model: event.target.value })}
              onBlur={(event) => void saveSettings({ model: event.target.value })}
            />
          </Field>
          <Field label="API Key">
            <Input
              className="h-10 rounded-xl bg-white"
              type="password"
              placeholder="sk-..."
              value={settings.apiKey}
              onChange={(event) => setSettings({ ...settings, apiKey: event.target.value })}
              onBlur={(event) => void saveSettings({ apiKey: event.target.value })}
            />
          </Field>
          <Field label="HTTP Proxy" hint="高级设置，可留空。">
            <Input
              className="h-10 rounded-xl bg-white"
              placeholder="http://127.0.0.1:7890"
              value={settings.apiProxyUrl}
              onChange={(event) => setSettings({ ...settings, apiProxyUrl: event.target.value })}
              onBlur={(event) => void saveSettings({ apiProxyUrl: event.target.value })}
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <p className={cn("text-sm", apiResult?.ok === false ? "text-red-700" : "text-muted-foreground")}>
            {apiResult ? apiResult.message : "建议首次截图前先测试连接。"}
          </p>
          <Button disabled={testingApi} onClick={() => void testApiConnection()}>
            {testingApi ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            测试连接
          </Button>
        </div>
      </Section>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col gap-5">
      <Section title="捕获设置" description="配置全局快捷键和启动行为。">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="当前快捷键">
            <div className="flex flex-wrap items-center gap-2">
              {shortcutParts.map((part, index) => (
                <span className="rounded-lg border bg-slate-50 px-3 py-2 font-mono text-sm font-semibold" key={`${part}-${index}`}>
                  {part}
                </span>
              ))}
            </div>
          </Field>
          <Field label="编辑快捷键" hint="例如 Alt+S 或 CommandOrControl+Shift+1。">
            <Input
              className="h-10 rounded-xl bg-white"
              value={settings.shortcut}
              onChange={(event) => setSettings({ ...settings, shortcut: event.target.value })}
              onBlur={(event) => void saveSettings({ shortcut: event.target.value })}
            />
          </Field>
        </div>
        <label className="mt-5 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <Checkbox
            checked={settings.launchOnStartup}
            onCheckedChange={(checked) => void saveSettings({ launchOnStartup: checked === true })}
          />
          开机启动
        </label>
      </Section>

      <Section title="语言" description="选择目标语言和 OCR 语言包。">
        <div className="grid gap-5 lg:grid-cols-2">
          <Field label="目标语言">
            <Select value={settings.targetLanguage} onValueChange={(value) => void saveSettings({ targetLanguage: value })}>
              <SelectTrigger className="h-10 rounded-xl bg-white">
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
          </Field>
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium">OCR 语言</span>
            <div className="grid grid-cols-2 gap-2">
              {ocrLanguageOptions.map((option) => {
                const checked = settings.ocrLanguages.includes(option.value);
                return (
                  <label className="flex items-center gap-2 rounded-xl border bg-slate-50 px-3 py-2 text-sm" key={option.value}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => {
                        const next = value
                          ? Array.from(new Set([...settings.ocrLanguages, option.value]))
                          : settings.ocrLanguages.filter((item) => item !== option.value);
                        void saveSettings({ ocrLanguages: next.length > 0 ? next : ["eng"] });
                      }}
                    />
                    {option.label}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );

  const pageTitle = navItems.find((item) => item.key === page)?.label ?? "首页";

  return (
    <div className="grid h-full grid-cols-[252px_1fr] bg-[#f4f5f7] text-foreground">
      <aside className="flex min-h-0 flex-col justify-between px-6 py-6">
        <div className="flex min-h-0 flex-col gap-8">
          <div className="flex items-center gap-3 px-1">
            <div className="grid size-8 place-items-center rounded-lg bg-amber-400 text-white shadow-sm">
              <Languages className="size-5" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">Shot Translate</p>
              <p className="text-xs text-muted-foreground">截图翻译</p>
            </div>
          </div>
          <nav className="flex flex-col gap-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <button
                  className={cn(
                    "flex h-12 items-center gap-3 rounded-xl px-4 text-left text-base font-medium text-slate-500 transition",
                    active && "bg-white text-slate-950 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
                  )}
                  key={item.key}
                  onClick={() => setPage(item.key)}
                >
                  <Icon className="size-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>
        <div className="rounded-2xl bg-white/70 px-4 py-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">本地 OCR</p>
          <p className="mt-1">截图不会保存到历史记录。</p>
        </div>
      </aside>

      <main className="min-w-0 p-5 pl-0">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] bg-white/80 px-10 py-8 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ring-1 ring-black/5">
          <header className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{pageTitle}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {page === "home"
                  ? "日常截图翻译入口"
                  : page === "history"
                    ? "查看和管理最近翻译"
                    : page === "api"
                      ? "连接翻译模型服务"
                      : "调整捕获和语言偏好"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {pageMessage ? <span className="max-w-sm truncate text-xs text-muted-foreground">{pageMessage}</span> : null}
              <span className="text-xs text-muted-foreground">
                {saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : saveState === "error" ? "保存失败" : ""}
              </span>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden">
            {page === "home" ? renderHome() : null}
            {page === "history" ? renderHistory() : null}
            {page === "api" ? renderApi() : null}
            {page === "settings" ? renderSettings() : null}
          </div>
        </div>
      </main>
    </div>
  );
}
