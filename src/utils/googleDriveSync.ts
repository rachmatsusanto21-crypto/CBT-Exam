import { ExamPackage, AppStateBackup } from "../types";
import {
  saveExamToGoogleDrive,
  uploadBackupToGoogleDrive,
  listExamsFromGoogleDrive,
  loadExamFromGoogleDrive,
  listBackupsFromGoogleDrive,
} from "./googleDrive";
import { getCachedAccessToken, getValidDriveToken } from "./googleAuth";
import { createFullAppBackup, saveExamPackages, getExamPackages } from "./storage";

const AUTO_SYNC_STORAGE_KEY = "slideexam_gdrive_autosync_enabled";
const LAST_SYNC_STORAGE_KEY = "slideexam_gdrive_last_sync_time";

export type DriveSyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface DriveSyncState {
  status: DriveSyncStatus;
  lastSyncedAt: string | null;
  message?: string;
  syncedExamTitle?: string;
}

let currentSyncState: DriveSyncState = {
  status: "idle",
  lastSyncedAt: (() => {
    try {
      return typeof window !== "undefined" ? localStorage.getItem(LAST_SYNC_STORAGE_KEY) : null;
    } catch {
      return null;
    }
  })(),
};

type SyncListener = (state: DriveSyncState) => void;
const listeners = new Set<SyncListener>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener({ ...currentSyncState });
    } catch (e) {
      console.warn("Drive sync listener error", e);
    }
  });
}

export function subscribeToDriveSync(listener: SyncListener): () => void {
  listeners.add(listener);
  listener({ ...currentSyncState });
  return () => {
    listeners.delete(listener);
  };
}

export function getDriveSyncState(): DriveSyncState {
  return { ...currentSyncState };
}

export function isDriveAutoSyncEnabled(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const val = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
    // Explicit opt-in only: defaults to false so changes in the app do not trigger unsolicited Google Drive saves
    return val === "true";
  } catch {
    return false;
  }
}

export function setDriveAutoSyncEnabled(enabled: boolean): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(AUTO_SYNC_STORAGE_KEY, enabled ? "true" : "false");
    }
  } catch (e) {
    console.warn("Could not save auto-sync preference", e);
  }
}

// Debounce timer for exam auto-sync
let examSyncTimer: any = null;

/**
 * Automatically syncs an exam package to Google Drive in the background (debounced).
 */
export function triggerExamAutoSyncToDrive(
  exam: ExamPackage,
  delayMs = 2500,
  onExamSaved?: (updatedExam: ExamPackage) => void
): void {
  if (!isDriveAutoSyncEnabled()) return;
  const token = getCachedAccessToken();
  if (!token) return; // User hasn't connected or authenticated Drive

  if (examSyncTimer) {
    clearTimeout(examSyncTimer);
  }

  currentSyncState = {
    ...currentSyncState,
    status: "syncing",
    message: `Menyinkronkan naskah "${exam.title}" ke Google Drive...`,
    syncedExamTitle: exam.title,
  };
  notifyListeners();

  examSyncTimer = setTimeout(async () => {
    try {
      const activeToken = (await getValidDriveToken()) || token;
      if (!activeToken) {
        currentSyncState = {
          ...currentSyncState,
          status: "idle",
          message: "Perlu menghubungkan akun Google Drive untuk sinkronisasi otomatis.",
        };
        notifyListeners();
        return;
      }

      const res = await saveExamToGoogleDrive(activeToken, exam);
      const nowIso = new Date().toISOString();
      const updatedExam: ExamPackage = {
        ...exam,
        gdriveFileId: res.fileId,
        gdriveWebViewLink: res.webViewLink,
        gdriveDownloadLink: res.downloadUrl,
        gdriveSyncedAt: nowIso,
        updatedAt: nowIso,
      };

      if (typeof window !== "undefined") {
        localStorage.setItem(LAST_SYNC_STORAGE_KEY, nowIso);
      }

      currentSyncState = {
        status: "synced",
        lastSyncedAt: nowIso,
        message: `Naskah "${exam.title}" tersimpan otomatis di Google Drive`,
        syncedExamTitle: exam.title,
      };
      notifyListeners();

      if (onExamSaved) {
        onExamSaved(updatedExam);
      }

      // Revert status to idle after 4 seconds
      setTimeout(() => {
        if (currentSyncState.status === "synced") {
          currentSyncState = { ...currentSyncState, status: "idle" };
          notifyListeners();
        }
      }, 4000);
    } catch (err: any) {
      console.warn("Auto-sync to Google Drive error:", err);
      currentSyncState = {
        ...currentSyncState,
        status: "error",
        message: err?.message || "Gagal sinkronisasi otomatis ke Google Drive.",
      };
      notifyListeners();
    }
  }, delayMs);
}

// Debounce timer for full app state auto-backup
let backupSyncTimer: any = null;

/**
 * Triggers a full background backup sync to Google Drive.
 */
export function triggerFullBackupAutoSyncToDrive(delayMs = 4000): void {
  if (!isDriveAutoSyncEnabled()) return;
  const token = getCachedAccessToken();
  if (!token) return;

  if (backupSyncTimer) {
    clearTimeout(backupSyncTimer);
  }

  backupSyncTimer = setTimeout(async () => {
    try {
      const activeToken = (await getValidDriveToken()) || token;
      if (!activeToken) return;

      const backupData = createFullAppBackup();
      await uploadBackupToGoogleDrive(activeToken, backupData);
      const nowIso = new Date().toISOString();

      if (typeof window !== "undefined") {
        localStorage.setItem(LAST_SYNC_STORAGE_KEY, nowIso);
      }

      currentSyncState = {
        status: "synced",
        lastSyncedAt: nowIso,
        message: "Cadangan data lengkap CBT tersimpan di Google Drive",
      };
      notifyListeners();

      setTimeout(() => {
        if (currentSyncState.status === "synced") {
          currentSyncState = { ...currentSyncState, status: "idle" };
          notifyListeners();
        }
      }, 4000);
    } catch (err: any) {
      console.warn("Full backup auto-sync error:", err);
    }
  }, delayMs);
}

/**
 * Instant manual one-click sync to Google Drive
 */
export async function performImmediateDriveSync(
  exam: ExamPackage
): Promise<{ success: boolean; exam?: ExamPackage; error?: string }> {
  const token = (await getValidDriveToken()) || getCachedAccessToken();
  if (!token) {
    return {
      success: false,
      error: "Akun Google Drive belum terhubung. Silakan login akun Google Anda terlebih dahulu.",
    };
  }

  currentSyncState = {
    ...currentSyncState,
    status: "syncing",
    message: `Menyinkronkan naskah "${exam.title}" ke Google Drive...`,
  };
  notifyListeners();

  try {
    const res = await saveExamToGoogleDrive(token, exam);
    const nowIso = new Date().toISOString();
    const updatedExam: ExamPackage = {
      ...exam,
      gdriveFileId: res.fileId,
      gdriveWebViewLink: res.webViewLink,
      gdriveDownloadLink: res.downloadUrl,
      gdriveSyncedAt: nowIso,
      updatedAt: nowIso,
    };

    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_SYNC_STORAGE_KEY, nowIso);
    }

    currentSyncState = {
      status: "synced",
      lastSyncedAt: nowIso,
      message: `Naskah "${exam.title}" berhasil disinkronkan ke Google Drive!`,
      syncedExamTitle: exam.title,
    };
    notifyListeners();

    // Also trigger full app backup in background
    triggerFullBackupAutoSyncToDrive(1000);

    return { success: true, exam: updatedExam };
  } catch (err: any) {
    currentSyncState = {
      ...currentSyncState,
      status: "error",
      message: err?.message || "Gagal sinkronisasi ke Google Drive.",
    };
    notifyListeners();
    return { success: false, error: err?.message || "Gagal menyimpan ke Google Drive." };
  }
}
