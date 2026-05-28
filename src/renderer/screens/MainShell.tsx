import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppShell,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NavLink,
  Paper,
  PasswordInput,
  Progress,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title
} from "@mantine/core";
import {
  IconAlertCircle,
  IconCamera,
  IconCheck,
  IconClipboard,
  IconDownload,
  IconHistory,
  IconLanguage,
  IconRefresh,
  IconRocket,
  IconSettings,
  IconTrash,
  IconWorld
} from "@tabler/icons-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import type {
  AppEvent,
  AppSettings,
  HistoryItem,
  OcrLanguageProfile,
  ServiceResult,
  UpdateSource,
  UpdateStatus
} from "../../shared/types";
import { useUpdateState } from "../hooks/useUpdateState";
import { UpdateService } from "../services/UpdateService";

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

const ocrLanguageProfiles: Array<{
  value: OcrLanguageProfile;
  label: string;
  description: string;
  languages: string[];
}> = [
  {
    value: "zh-en",
    label: "Chinese + English",
    description: "Best default for Chinese/English screenshots.",
    languages: ["eng", "chi_sim"]
  },
  {
    value: "english",
    label: "English only",
    description: "Fastest option for English UI text.",
    languages: ["eng"]
  },
  {
    value: "cjk",
    label: "CJK mixed",
    description: "Broader Chinese/Japanese/Korean coverage, slower.",
    languages: ["eng", "chi_sim", "chi_tra", "jpn", "kor"]
  },
  {
    value: "manual",
    label: "Manual",
    description: "Choose exact Tesseract language packs.",
    languages: []
  }
];

function statusLabel(status: HistoryItem["status"]): string {
  switch (status) {
    case "ocr_processing":
      return "OCR";
    case "ocr_failed":
      return "OCR failed";
    case "translating":
      return "Translating";
    case "low_confidence":
      return "Review OCR";
    case "success":
      return "Done";
    case "error":
      return "Error";
    default:
      return "Pending";
  }
}

function historyBadgeColor(status: HistoryItem["status"]): string {
  switch (status) {
    case "success":
      return "green";
    case "low_confidence":
      return "yellow";
    case "error":
    case "ocr_failed":
      return "red";
    case "translating":
    case "ocr_processing":
    case "pending":
      return "blue";
    default:
      return "gray";
  }
}

function updateStatusLabel(status: UpdateStatus | undefined): string {
  switch (status) {
    case "checking":
      return "Checking";
    case "available":
      return "Update available";
    case "downloading":
      return "Downloading";
    case "downloaded":
      return "Downloaded";
    case "not-available":
      return "Up to date";
    case "error":
      return "Failed";
    case "disabled":
      return "Development mode";
    default:
      return "Idle";
  }
}

function updateBadgeColor(status: UpdateStatus | undefined): string {
  switch (status) {
    case "available":
    case "downloading":
      return "blue";
    case "downloaded":
    case "not-available":
      return "green";
    case "error":
      return "red";
    case "disabled":
      return "gray";
    default:
      return "dark";
  }
}

export function MainShell() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [busyMessage, setBusyMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [dismissedUpdateVersion, setDismissedUpdateVersion] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<ServiceResult | null>(null);
  const [testingApi, setTestingApi] = useState(false);
  const { updateState } = useUpdateState();
  const location = useLocation();
  const navigate = useNavigate();

  const updateVersion = updateState?.availableVersion ?? null;
  const shouldShowUpdateModal =
    updateState?.isUpdateAvailable === true &&
    updateVersion !== null &&
    dismissedUpdateVersion !== updateVersion;

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
    setNotice(result.message);
  }

  async function testApiConnection() {
    if (!settings) {
      return;
    }

    setTestingApi(true);
    try {
      const result = await window.shotTranslate.testApiConnection(settings);
      setApiResult(result);
      setNotice(result.message);
    } finally {
      setTestingApi(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-sm text-muted-foreground">
        Loading settings...
      </div>
    );
  }

  return (
    <>
      <Modal
        opened={shouldShowUpdateModal}
        onClose={() => setDismissedUpdateVersion(updateVersion)}
        title="New version available"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Current version v{updateState?.currentVersion}; available version v{updateVersion}.
          </Text>
          <Text size="sm" c="dimmed">
            Download now and install after the package is ready.
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setDismissedUpdateVersion(updateVersion)}>
              Later
            </Button>
            <Button leftSection={<IconDownload size={16} />} onClick={() => void UpdateService.downloadUpdate()}>
              Download
            </Button>
          </Group>
        </Stack>
      </Modal>

      <AppShell navbar={{ width: 248, breakpoint: 0 }} padding="lg" bg="gray.0">
        <AppShell.Navbar p="md" bg="white" style={{ display: "flex", flexDirection: "column" }}>
          <Stack gap="sm" pb="md">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size="lg" radius="md" variant="light" color="blue">
                <IconLanguage size={20} />
              </ThemeIcon>
              <div>
                <Title order={4} c="blue" style={{ lineHeight: 1.1 }}>
                  Shot Translate
                </Title>
                <Text size="xs" c="dimmed">
                  Capture OCR translator
                </Text>
              </div>
            </Group>
          </Stack>

          <Divider />

          <Stack gap={4} mt="md" style={{ flex: 1 }}>
            <NavLink
              data-testid="nav-settings"
              label="Settings"
              leftSection={<IconSettings size={20} />}
              active={location.pathname === "/settings"}
              onClick={() => navigate("/settings")}
              variant="filled"
              style={{ borderRadius: 8 }}
            />
            <NavLink
              data-testid="nav-history"
              label="History"
              leftSection={<IconHistory size={20} />}
              active={location.pathname === "/history"}
              onClick={() => navigate("/history")}
              variant="filled"
              style={{ borderRadius: 8 }}
            />
            <NavLink
              data-testid="nav-updates"
              label="Updates"
              leftSection={<IconWorld size={20} />}
              rightSection={
                updateState?.isUpdateAvailable ? (
                  <Badge size="xs" color="blue" variant="light">
                    New
                  </Badge>
                ) : null
              }
              active={location.pathname === "/updates"}
              onClick={() => navigate("/updates")}
              variant="filled"
              style={{ borderRadius: 8 }}
            />
          </Stack>

          <Paper withBorder p="md" radius="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Status
                </Text>
                <ThemeIcon
                  size={18}
                  radius="xl"
                  color={busyMessage ? "blue" : settings.apiKey ? "green" : "gray"}
                  variant="light"
                >
                  <IconCheck size={12} />
                </ThemeIcon>
              </Group>
              <Text size="sm" fw={600}>
                {statusText}
              </Text>
              <Button size="xs" fullWidth leftSection={<IconCamera size={15} />} onClick={() => window.shotTranslate.startCapture()}>
                Capture now
              </Button>
            </Stack>
          </Paper>
        </AppShell.Navbar>

        <AppShell.Main>
          <ScrollArea h="calc(100vh - 32px)" offsetScrollbars>
            <Stack gap="lg" maw={880} mx="auto" pb="lg">
              {notice ? (
                <Alert color="blue" variant="light" title="Notice" withCloseButton onClose={() => setNotice("")}>
                  {notice}
                </Alert>
              ) : null}

              <Routes>
                <Route path="/" element={<Navigate to="/settings" replace />} />
                <Route
                  path="/settings"
                  element={
                    <SettingsView
                      apiResult={apiResult}
                      settings={settings}
                      saveSettings={saveSettings}
                      testApiConnection={testApiConnection}
                      testingApi={testingApi}
                    />
                  }
                />
                <Route path="/history" element={<HistoryView history={history} refreshHistory={refreshHistory} />} />
                <Route path="/updates" element={<UpdatesView />} />
                <Route path="*" element={<Navigate to="/settings" replace />} />
              </Routes>
            </Stack>
          </ScrollArea>
        </AppShell.Main>
      </AppShell>
    </>
  );
}

function SettingsView({
  settings,
  saveSettings,
  apiResult,
  testApiConnection,
  testingApi
}: {
  settings: AppSettings;
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>;
  apiResult: ServiceResult | null;
  testApiConnection: () => Promise<void>;
  testingApi: boolean;
}) {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  return (
    <>
      <Stack gap={4}>
        <Title order={3}>Settings</Title>
        <Text size="sm" c="dimmed">
          Configure capture behavior, translation API access, and OCR languages.
        </Text>
      </Stack>

      <Paper withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={4}>Capture</Title>
            <Text size="sm" c="dimmed">
              Global shortcut and startup behavior.
            </Text>
          </div>
          <Button leftSection={<IconCamera size={16} />} onClick={() => window.shotTranslate.startCapture()}>
            Capture now
          </Button>
        </Group>

        <Stack gap="md">
          <TextInput
            label="Global shortcut"
            description="Use Electron accelerator syntax, such as Alt+S or CommandOrControl+Shift+1."
            value={draft.shortcut}
            onChange={(event) => setDraft({ ...draft, shortcut: event.currentTarget.value })}
            onBlur={() => void saveSettings({ shortcut: draft.shortcut })}
          />
          <Checkbox
            label="Launch on Windows startup"
            checked={settings.launchOnStartup}
            onChange={(event) => void saveSettings({ launchOnStartup: event.currentTarget.checked })}
          />
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="lg">
        <Title order={4} mb={4}>
          Translation API
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Configure an OpenAI-compatible API endpoint.
        </Text>

        <Stack gap="md">
          <TextInput
            label="API base URL"
            value={draft.apiBaseUrl}
            onChange={(event) => setDraft({ ...draft, apiBaseUrl: event.currentTarget.value })}
            onBlur={() => void saveSettings({ apiBaseUrl: draft.apiBaseUrl })}
          />
          <TextInput
            label="Model"
            value={draft.model}
            onChange={(event) => setDraft({ ...draft, model: event.currentTarget.value })}
            onBlur={() => void saveSettings({ model: draft.model })}
          />
          <PasswordInput
            label="API key"
            placeholder="sk-..."
            value={draft.apiKey}
            onChange={(event) => setDraft({ ...draft, apiKey: event.currentTarget.value })}
            onBlur={() => void saveSettings({ apiKey: draft.apiKey })}
          />
          <TextInput
            label="HTTP proxy"
            placeholder="http://127.0.0.1:7890"
            value={draft.apiProxyUrl}
            onChange={(event) => setDraft({ ...draft, apiProxyUrl: event.currentTarget.value })}
            onBlur={() => void saveSettings({ apiProxyUrl: draft.apiProxyUrl })}
          />
          <Group justify="space-between" align="center">
            <Text size="sm" c={apiResult?.ok === false ? "red" : "dimmed"}>
              {apiResult?.message ?? "Test the configured OpenAI-compatible endpoint before capture."}
            </Text>
            <Button variant="outline" loading={testingApi} onClick={() => void testApiConnection()}>
              Test connection
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder radius="md" p="lg">
        <Title order={4} mb={4}>
          Languages
        </Title>
        <Text size="sm" c="dimmed" mb="md">
          Choose the translation target and OCR profile loaded by Tesseract.
        </Text>

        <Stack gap="md">
          <Select
            label="Target language"
            data={targetLanguageOptions}
            value={settings.targetLanguage}
            onChange={(value) => value && void saveSettings({ targetLanguage: value })}
          />
          <SegmentedControl
            aria-label="OCR language profile"
            data={ocrLanguageProfiles.map((profile) => ({
              value: profile.value,
              label: profile.label
            }))}
            value={settings.ocrLanguageProfile}
            onChange={(value) => {
              const profile = ocrLanguageProfiles.find((candidate) => candidate.value === value);
              if (!profile) {
                return;
              }

              void saveSettings({
                ocrLanguageProfile: profile.value,
                ...(profile.value === "manual" ? {} : { ocrLanguages: profile.languages })
              });
            }}
          />
          <Text size="xs" c="dimmed">
            {ocrLanguageProfiles.find((profile) => profile.value === settings.ocrLanguageProfile)?.description}
          </Text>
          <Checkbox.Group
            label="OCR languages"
            description={
              settings.ocrLanguageProfile === "manual"
                ? "Manual mode lets you choose exact packs. More languages can slow recognition."
                : "Preset profiles manage OCR packs automatically. Switch to Manual to customize."
            }
            value={settings.ocrLanguages}
            readOnly={settings.ocrLanguageProfile !== "manual"}
            onChange={(value) => {
              void saveSettings({
                ocrLanguageProfile: "manual",
                ocrLanguages: value.length > 0 ? value : ["eng"]
              });
            }}
          >
            <Group mt="xs">
              {ocrLanguageOptions.map((option) => (
                <Checkbox
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  disabled={settings.ocrLanguageProfile !== "manual"}
                />
              ))}
            </Group>
          </Checkbox.Group>
        </Stack>
      </Paper>
    </>
  );
}

function HistoryView({ history, refreshHistory }: { history: HistoryItem[]; refreshHistory: () => Promise<void> }) {
  return (
    <>
      <Group justify="space-between" align="flex-start">
        <div>
          <Title order={3}>History</Title>
          <Text size="sm" c="dimmed">
            Recent translations are stored locally; screenshots are not persisted.
          </Text>
        </div>
        <Button
          variant="light"
          color="red"
          leftSection={<IconTrash size={16} />}
          onClick={async () => {
            await window.shotTranslate.clearHistory();
            await refreshHistory();
          }}
        >
          Clear
        </Button>
      </Group>

      <Stack gap="sm">
        {history.length === 0 ? (
          <Paper withBorder radius="md" p="xl" ta="center">
            <Text size="sm" c="dimmed">
              No translations yet.
            </Text>
          </Paper>
        ) : null}

        {history.map((item) => (
          <Paper key={item.id} withBorder radius="md" p="md">
            <Stack gap="xs">
              <Group justify="space-between" gap="sm">
                <Text size="xs" c="dimmed">
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
                <Badge color={historyBadgeColor(item.status)} variant="light">
                  {statusLabel(item.status)}
                </Badge>
              </Group>
              <Text size="sm" c="dimmed" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {item.sourceText || item.errorMessage || "No source text"}
              </Text>
              {item.errorMessage ? (
                <Text size="sm" c="red" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {item.errorMessage}
                </Text>
              ) : null}
              {item.ocrConfidence !== undefined ? (
                <Text size="xs" c={item.status === "low_confidence" ? "yellow.8" : "dimmed"}>
                  OCR confidence {Math.round(item.ocrConfidence)}%
                </Text>
              ) : null}
              <Text size="sm" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {item.translatedText || "No translation yet"}
              </Text>
              <Group justify="flex-end" gap="xs">
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconRefresh size={14} />}
                  disabled={!item.sourceText}
                  onClick={() => window.shotTranslate.retryHistoryItem(item.id, item.sourceText)}
                >
                  Retry
                </Button>
                <Button
                  variant="subtle"
                  size="xs"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  onClick={async () => {
                    await window.shotTranslate.deleteHistoryItem(item.id);
                    await refreshHistory();
                  }}
                >
                  Delete
                </Button>
                <Button
                  variant="subtle"
                  size="xs"
                  leftSection={<IconClipboard size={14} />}
                  disabled={!item.translatedText}
                  onClick={() => window.shotTranslate.writeClipboardText(item.translatedText)}
                >
                  Copy
                </Button>
              </Group>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </>
  );
}

function UpdatesView() {
  const { updateState } = useUpdateState();
  const updateProgress = updateState?.downloadProgress ?? 0;

  return (
    <>
      <Stack gap={4}>
        <Title order={3}>Updates</Title>
        <Text size="sm" c="dimmed">
          The app checks for releases at startup and waits for your confirmation before downloading.
        </Text>
      </Stack>

      <Paper withBorder radius="md" p="lg">
        <Group justify="space-between" align="flex-start" mb="md">
          <div>
            <Title order={4}>Application update</Title>
            <Text size="sm" c="dimmed">
              Switch sources if GitHub access is unstable.
            </Text>
          </div>
          <Badge color={updateBadgeColor(updateState?.status)} variant="light">
            {updateStatusLabel(updateState?.status)}
          </Badge>
        </Group>

        <Stack gap="md">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Update source
            </Text>
            <SegmentedControl
              value={updateState?.source ?? "mirror"}
              disabled={updateState?.isChecking || updateState?.isDownloading}
              onChange={(value) => {
                void UpdateService.setSource(value as UpdateSource);
              }}
              data={[
                { label: "ghfast mirror", value: "mirror" },
                { label: "GitHub", value: "github" }
              ]}
            />
          </Group>

          <Divider />

          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              Current version
            </Text>
            <Text size="sm" fw={600}>
              v{updateState?.currentVersion ?? "0.1.0"}
            </Text>
          </Group>

          {updateState?.availableVersion ? (
            <>
              <Divider />
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Available version
                </Text>
                <Text size="sm" fw={600}>
                  v{updateState.availableVersion}
                </Text>
              </Group>
            </>
          ) : null}

          {updateState?.isDownloading ? <Progress value={updateProgress} animated /> : null}

          {updateState?.errorMessage ? (
            <Alert color="red" icon={<IconAlertCircle size={18} />} title="Update failed">
              {updateState.errorMessage}
            </Alert>
          ) : null}

          <Group>
            <Button
              variant="outline"
              leftSection={<IconRefresh size={16} />}
              loading={updateState?.isChecking}
              disabled={updateState?.isDownloading}
              onClick={() => void UpdateService.checkForUpdates()}
            >
              Check for updates
            </Button>

            {updateState?.isUpdateAvailable ? (
              <Button
                leftSection={<IconDownload size={16} />}
                loading={updateState.isDownloading}
                onClick={() => void UpdateService.downloadUpdate()}
              >
                Download update
              </Button>
            ) : null}

            {updateState?.isUpdateDownloaded ? (
              <Button color="green" leftSection={<IconRocket size={16} />} onClick={() => void UpdateService.installUpdate()}>
                Restart and install
              </Button>
            ) : null}
          </Group>
        </Stack>
      </Paper>
    </>
  );
}
