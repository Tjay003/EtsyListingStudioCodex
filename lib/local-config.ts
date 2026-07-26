import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { LocalStudioConfigV1 } from "./contracts";
import { STUDIO_SCHEMA_VERSION } from "./contracts";
import { assertExistingDirectory, readJson, writeJsonAtomic } from "./fs-utils";

const execFileAsync = promisify(execFile);
const CONFIG_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  ".etsy-studio.local.json",
);

function emptyConfig(): LocalStudioConfigV1 {
  return {
    schema_version: STUDIO_SCHEMA_VERSION,
    active_root: null,
    recent_roots: [],
  };
}

export async function readLocalConfig(): Promise<LocalStudioConfigV1> {
  if (process.env.ETSY_STUDIO_WORKSPACE) {
    return {
      schema_version: STUDIO_SCHEMA_VERSION,
      active_root: await assertExistingDirectory(
        process.env.ETSY_STUDIO_WORKSPACE,
      ),
      recent_roots: [],
    };
  }

  try {
    const parsed = await readJson<LocalStudioConfigV1>(CONFIG_PATH);
    return {
      ...emptyConfig(),
      ...parsed,
      recent_roots: Array.isArray(parsed.recent_roots)
        ? parsed.recent_roots.filter((item) => typeof item === "string")
        : [],
    };
  } catch {
    return emptyConfig();
  }
}

export async function setActiveWorkspace(root: string) {
  const resolved = await assertExistingDirectory(root);
  const current = await readLocalConfig();
  const recent = [
    resolved,
    ...current.recent_roots.filter(
      (candidate) => candidate.toLocaleLowerCase() !== resolved.toLocaleLowerCase(),
    ),
  ].slice(0, 8);
  const next: LocalStudioConfigV1 = {
    schema_version: STUDIO_SCHEMA_VERSION,
    active_root: resolved,
    recent_roots: recent,
  };
  await writeJsonAtomic(CONFIG_PATH, next);
  return next;
}

export async function getActiveWorkspace() {
  const config = await readLocalConfig();
  if (!config.active_root) return null;
  try {
    await access(config.active_root);
    return config.active_root;
  } catch {
    return null;
  }
}

export async function pickWindowsFolder() {
  if (process.platform !== "win32") {
    throw new Error("The system folder picker is currently Windows-only.");
  }

  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
    "$dialog.Description = 'Choose your Etsy product root folder'",
    "$dialog.ShowNewFolderButton = $false",
    "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {",
    "  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "  Write-Output $dialog.SelectedPath",
    "}",
  ].join("; ");

  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-STA", "-Command", script],
    { windowsHide: true, encoding: "utf8", timeout: 5 * 60_000 },
  );
  const selected = stdout.trim();
  return selected || null;
}
