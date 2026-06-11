/**
 * Self-update for Object Model Browser: throttled on-load check against GitHub Releases and one-click
 * apply. Mirrors the pattern in Flexible Layouts but wired to this plugin's repo/manifest.
 *
 * Store-agnostic: the installPlugin callback is injected by the component (useMachineStore().installPlugin).
 */
import { ref } from "vue";

import { applyUpdate, checkForUpdate, type UpdateResult } from "dwc-plugin-runtime";

import i18n from "@/i18n";
import { useMachineStore } from "@/stores/machine";
import { LogLevel, useUiStore } from "@/stores/ui";

const OWNER = "jaysuk";
const REPO = "RRF-Alternative-Object-Model-Browser";
const PLUGIN_ID = "OmBrowser"; // manifest id (plugin.json "id")
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

const LS_ENABLED = "omBrowser.updateCheck.enabled";
const LS_LAST = "omBrowser.updateCheck.lastCheck";
const LS_DISMISSED = "omBrowser.updateCheck.dismissed";

export const updateState = ref<UpdateResult | null>(null);
export const checking = ref(false);
export const applying = ref(false);
/**
 * Set to true after a successful one-click update. Stale plugin code keeps running until the page
 * reloads — DWC's own install wizard prompts the same way. The UI shows a reload prompt when true.
 */
export const pendingReload = ref(false);

const t = (key: string, named?: Record<string, unknown>) =>
  i18n.global.t(`plugins.omBrowser.updates.${key}`, named ?? {});

function safeLS(key: string, value?: string): string | null {
  try {
    if (value !== undefined) { localStorage.setItem(key, value); return null; }
    return localStorage.getItem(key);
  } catch { return null; }
}

export function updateChecksEnabled(): boolean {
  return safeLS(LS_ENABLED) !== "false";
}
export function setUpdateChecksEnabled(on: boolean): void {
  safeLS(LS_ENABLED, on ? "true" : "false");
}

function currentVersion(): string {
  const plugins = (useMachineStore().model as { plugins?: Map<string, { version?: string }> }).plugins;
  return plugins?.get(PLUGIN_ID)?.version ?? "0.0.0";
}

/**
 * Run an update check. Throttled to once per day unless `force`d. With `notify`, raises a
 * one-off notification for a new compatible release. Never throws.
 */
export async function runUpdateCheck(opts: { force?: boolean; notify?: boolean } = {}): Promise<UpdateResult | null> {
  if (!opts.force) {
    if (!updateChecksEnabled()) return null;
    const last = Number(safeLS(LS_LAST) || 0);
    if (Date.now() - last < CHECK_INTERVAL_MS) return updateState.value;
  }

  checking.value = true;
  try {
    const result = await checkForUpdate({ owner: OWNER, repo: REPO, currentVersion: currentVersion() });
    updateState.value = result;
    safeLS(LS_LAST, String(Date.now()));
    if (opts.notify && result.updateAvailable && safeLS(LS_DISMISSED) !== result.latestVersion) {
      const message = result.scenario === "dwcUpdate"
        ? t("notifyDwc", { version: result.latestVersion, dwc: result.requiredDwc })
        : t("notifyPlugin", { version: result.latestVersion });
      useUiStore().makeNotification(LogLevel.info, t("title"), message);
    }
    return result;
  } finally {
    checking.value = false;
  }
}

export function dismissCurrentUpdate(): void {
  if (updateState.value?.latestVersion) {
    safeLS(LS_DISMISSED, updateState.value.latestVersion);
  }
}

/**
 * Apply the offered update: download the release ZIP and install it through DWC. On CORS failure
 * falls back to setting window.location.href to the asset URL so the browser downloads it directly.
 */
export async function applyUpdateNow(): Promise<void> {
  const result = updateState.value;
  const machine = useMachineStore();
  const ui = useUiStore();
  if (!result?.assetUrl || !result.assetName) {
    ui.makeNotification(LogLevel.warning, t("title"), t("applyFailed"));
    return;
  }

  applying.value = true;
  try {
    await applyUpdate({
      assetUrl: result.assetUrl,
      assetName: result.assetName,
      installPlugin: (filename, blob, start) => machine.installPlugin(filename, blob, start),
    });
    pendingReload.value = true;
    ui.makeNotification(LogLevel.success, t("title"), t("installedReload", { version: result.latestVersion }));
  } catch (e) {
    console.warn("[OmBrowser] update failed:", e);
    // CORS block: fall back to direct download link.
    ui.makeNotification(LogLevel.warning, t("title"), t("corsBlocked"));
    window.location.href = result.assetUrl;
  } finally {
    applying.value = false;
  }
}
