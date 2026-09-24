import { AppStateBackup, ExamPackage } from "../types";
import {
  getCachedAccessToken,
  clearAuthSession,
  notifyAuthExpired,
  isAuthExpiredError,
  formatGoogleAuthErrorMessage,
} from "./googleAuth";
import { syncExamToGAS, fetchExamFromGAS } from "./gasService";

export const GOOGLE_DRIVE_BACKUP_FOLDER_NAME = "SlideExam_CBT";
export const GOOGLE_DRIVE_BACKUP_SUBFOLDER_NAME = "Backup_Data_Aplikasi";
export const GOOGLE_DRIVE_DATA_SOAL_FOLDER_NAME = "Data_Soal";
export const GOOGLE_DRIVE_EXAMS_FOLDER_NAME = "Naskah_Soal"; // legacy compatibility

export class GoogleDriveAuthError extends Error {
  code = "AUTH_EXPIRED";
  constructor(
    message = "Sesi login Google Drive telah berakhir atau token akses kedaluwarsa. Silakan hubungkan ulang akun Google Anda untuk memperbarui izin akses."
  ) {
    super(message);
    this.name = "GoogleDriveAuthError";
  }
}

/**
 * Parses a failed Response from Google Drive API into a user-friendly Error.
 * Automatically clears expired sessions and dispatches auth-expired events.
 */
export async function parseGoogleDriveError(res: Response, fallbackMsg: string): Promise<Error> {
  let rawMsg = "";
  try {
    const data = await res.json();
    rawMsg = data?.error?.message || data?.message || "";
  } catch {
    try {
      rawMsg = await res.text();
    } catch {}
  }

  if (
    res.status === 401 ||
    rawMsg.toLowerCase().includes("invalid authentication credentials") ||
    rawMsg.toLowerCase().includes("oauth 2 access token") ||
    rawMsg.toLowerCase().includes("unauthenticated") ||
    rawMsg.toLowerCase().includes("invalid_token") ||
    rawMsg.toLowerCase().includes("login cookie")
  ) {
    notifyAuthExpired();
    return new GoogleDriveAuthError(
      "Sesi login Google Drive Anda telah berakhir (token kedaluwarsa). Silakan klik 'Hubungkan Akun Google' untuk masuk kembali dan memperbarui izin akses."
    );
  }

  if (res.status === 403) {
    if (rawMsg.toLowerCase().includes("quota") || rawMsg.toLowerCase().includes("rate")) {
      return new Error("Batas kuota akses Google Drive tercapai sementara. Silakan tunggu beberapa saat lagi.");
    }
    return new Error(
      "Akses ditolak oleh Google Drive. Pastikan akun memiliki izin atau bagikan file dengan akses 'Siapa saja yang memiliki link'."
    );
  }

  if (res.status === 404) {
    return new Error("File atau folder tidak ditemukan di Google Drive.");
  }

  return new Error(rawMsg || fallbackMsg);
}

export interface GoogleDriveFileItem {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
}

export interface GoogleDriveExamItem extends GoogleDriveFileItem {
  examCode?: string;
  examTitle?: string;
  subject?: string;
  gradeLevel?: string;
  questionCount?: number;
  totalScore?: number;
  durationMinutes?: number;
  sessionToken?: string;
}

export interface DataSoalScanResult {
  success: boolean;
  folderFound: boolean;
  folderCount: number;
  filesScanned: number;
  examsIndexed: number;
  items: GoogleDriveExamItem[];
  error?: string;
  scannedAt?: string;
}

/**
 * Generates standard Google Drive filename format:
 * [KodeSoal]_[NamaMataPelajaran]_[Kelas].json
 * Contoh: "PP-03_Pancasila_Kelas10.json" atau "MTK-12_Matematika_Kelas12.json"
 */
export function formatExamDriveFileName(exam: ExamPackage): string {
  const cleanKode = (exam.code || "SOAL")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  const cleanMapel = (exam.teacherProfile?.subject || exam.title || "MataPelajaran")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "_");

  const cleanKelas = (exam.teacherProfile?.gradeLevel || "Kelas")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "_");

  return `${cleanKode}_${cleanMapel}_${cleanKelas}.json`;
}

/**
 * Parses grade, subject, and exam code from a Google Drive file name
 * Supports:
 * 1. [KodeSoal]_[NamaMataPelajaran]_[Kelas].json (e.g. PP-03_Pancasila_Kelas10.json)
 * 2. [KodeSoal].json (e.g. PP-03.json)
 * 3. [KodeSoal]_[Rest]
 * 4. Legacy: [Kelas]_[MataPelajaran]_[KodeSoal].json
 */
export function parseExamInfoFromDriveFileName(fileName: string): {
  gradeLevel?: string;
  subject?: string;
  examCode?: string;
  examTitle?: string;
} {
  const cleanName = fileName.replace(/\.json$/i, "").trim();

  // Pattern 1: Standalone code (e.g. PP-03 or [PP-03])
  if (!cleanName.includes("_")) {
    const code = cleanName.replace(/^[\[\(]|[\]\)]$/g, "").toUpperCase();
    return {
      examCode: code,
      examTitle: `Ujian ${code}`,
    };
  }

  const parts = cleanName.split("_");

  // Pattern 2: [KodeSoal]_[NamaMataPelajaran]_[Kelas] (New standard format)
  // When parts[0] is code (e.g. PP-03, MTK-12, IPA-01)
  const firstPartClean = parts[0].replace(/^[\[\(]|[\]\)]$/g, "").toUpperCase();
  const lastPartClean = parts[parts.length - 1].replace(/^[\[\(]|[\]\)]$/g, "").toUpperCase();

  // If first part has typical code format (uppercase/numbers/dashes, e.g. PP-03)
  if (/^[A-Z0-9-]{2,12}$/i.test(firstPartClean) && !firstPartClean.startsWith("KELAS")) {
    const examCode = firstPartClean;
    const subject = parts.length > 1 ? parts[1].replace(/_/g, " ").trim() : "";
    const gradeLevel = parts.length > 2 ? parts.slice(2).join(" ").trim() : undefined;
    return {
      examCode,
      subject: subject || undefined,
      gradeLevel,
      examTitle: subject ? `${subject} (${examCode})` : `Ujian ${examCode}`,
    };
  }

  // Pattern 3: Legacy kelas_mata pelajaran_kode soal (e.g. Kelas VI_Pendidikan Pancasila_PP-01)
  if (parts.length >= 3 && /^[A-Z0-9-]{2,12}$/i.test(lastPartClean)) {
    const gradeLevel = parts[0].trim();
    const subject = parts.slice(1, -1).join(" ").trim();
    const examCode = lastPartClean;
    return {
      gradeLevel,
      subject,
      examCode,
      examTitle: `${subject} (${examCode})`,
    };
  }

  // Pattern 4: Legacy SOAL_[CODE]_[TITLE]
  if (cleanName.startsWith("SOAL_")) {
    const afterPrefix = cleanName.replace(/^SOAL_/i, "");
    const legacyParts = afterPrefix.split("_");
    const examCode = legacyParts[0] || "";
    const examTitle = legacyParts.slice(1).join(" ") || afterPrefix;
    return { examCode, examTitle };
  }

  return { examTitle: cleanName };
}

/**
 * Extracts Google Drive File ID from various link formats or raw ID.
 * Handles:
 * - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * - https://drive.google.com/file/d/FILE_ID/edit
 * - https://drive.google.com/open?id=FILE_ID
 * - https://drive.google.com/uc?id=FILE_ID&export=download
 * - https://docs.google.com/file/d/FILE_ID/...
 * - https://drive.google.com/uc?export=download&id=FILE_ID
 * - https://drive.usercontent.google.com/download?id=FILE_ID
 * - Raw alphanumeric file ID (20-70 chars)
 * - Identifies if a folder link was mistakenly pasted
 */
export function extractGoogleDriveFileId(input: string): {
  fileId: string | null;
  isFolder: boolean;
  error?: string;
} {
  if (!input) {
    return { fileId: null, isFolder: false, error: "Link atau ID Google Drive tidak boleh kosong." };
  }
  const trimmed = input.trim();

  // Check if user accidentally pasted a Google Drive folder link
  if (trimmed.includes("/folders/") || trimmed.includes("folder/")) {
    return {
      fileId: null,
      isFolder: true,
      error: "Tautan yang Anda tempel adalah link FOLDER Google Drive. Silakan buka file naskah soal (.json), klik Bagikan/Dapatkan Link, lalu tempelkan link FILE tersebut.",
    };
  }

  // 1. Match /file/d/FILE_ID
  const matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{20,70})/i);
  if (matchFileD && matchFileD[1]) {
    return { fileId: matchFileD[1], isFolder: false };
  }

  // 2. Match [?&]id=FILE_ID
  const matchIdParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,70})/i);
  if (matchIdParam && matchIdParam[1]) {
    return { fileId: matchIdParam[1], isFolder: false };
  }

  // 3. Match /d/FILE_ID
  const matchD = trimmed.match(/\/d\/([a-zA-Z0-9_-]{20,70})/i);
  if (matchD && matchD[1]) {
    return { fileId: matchD[1], isFolder: false };
  }

  // 4. Raw file ID (alphanumeric, underscores, hyphens)
  if (/^[a-zA-Z0-9_-]{20,70}$/.test(trimmed)) {
    return { fileId: trimmed, isFolder: false };
  }

  return {
    fileId: null,
    isFolder: false,
    error: "Format link Google Drive tidak dikenali. Pastikan link memiliki format https://drive.google.com/file/d/... atau ID file Google Drive yang valid.",
  };
}

const ROOT_FOLDER_CACHE_KEY = "slideexam_gdrive_root_folder_id";
const BACKUP_SUBFOLDER_CACHE_KEY = "slideexam_gdrive_backup_subfolder_id";

let cachedRootFolderId: string | null = null;
let rootFolderPromise: Promise<string> | null = null;

let cachedBackupSubfolderId: string | null = null;
let backupSubfolderPromise: Promise<string> | null = null;

/**
 * Searches for or reuses the dedicated backup folder on the user's Google Drive.
 * Caches folder ID in memory and localStorage to strictly prevent creating duplicate folders on changes.
 */
export async function getOrCreateSlideExamFolder(accessToken: string): Promise<string> {
  if (rootFolderPromise) {
    return rootFolderPromise;
  }

  rootFolderPromise = (async () => {
    try {
      // 1. Check in-memory or localStorage cache first
      let storedId = cachedRootFolderId;
      if (!storedId && typeof window !== "undefined") {
        storedId = localStorage.getItem(ROOT_FOLDER_CACHE_KEY);
      }

      if (storedId) {
        try {
          const verifyRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${storedId}?fields=id,name,trashed&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (verifyRes.ok) {
            const fileData = await verifyRes.json();
            if (fileData && fileData.id && !fileData.trashed) {
              cachedRootFolderId = fileData.id;
              if (typeof window !== "undefined") {
                localStorage.setItem(ROOT_FOLDER_CACHE_KEY, fileData.id);
              }
              return fileData.id;
            }
          }
        } catch {
          // Verification failed, proceed to search
        }
      }

      // 2. Search for existing folder named 'SlideExam_CBT' or containing 'SlideExam'
      const query = `mimeType='application/vnd.google-apps.folder' and (name='${GOOGLE_DRIVE_BACKUP_FOLDER_NAME}' or name contains 'SlideExam') and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

      const searchRes = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.files && data.files.length > 0) {
          const exact = data.files.find((f: any) => f.name === GOOGLE_DRIVE_BACKUP_FOLDER_NAME);
          const foundId = exact ? exact.id : data.files[0].id;
          cachedRootFolderId = foundId;
          if (typeof window !== "undefined") {
            localStorage.setItem(ROOT_FOLDER_CACHE_KEY, foundId);
          }
          return foundId;
        }
      }

      // 3. Create folder only if truly none exists
      const createUrl = "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true";
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: GOOGLE_DRIVE_BACKUP_FOLDER_NAME,
          mimeType: "application/vnd.google-apps.folder",
          description: "Folder Arsip dan Cadangan Data Naskah Soal & CBT SlideExam",
        }),
      });

      if (!createRes.ok) {
        throw await parseGoogleDriveError(
          createRes,
          `Gagal membuat folder ${GOOGLE_DRIVE_BACKUP_FOLDER_NAME} di Google Drive.`
        );
      }

      const created = await createRes.json();
      cachedRootFolderId = created.id;
      if (typeof window !== "undefined") {
        localStorage.setItem(ROOT_FOLDER_CACHE_KEY, created.id);
      }
      return created.id;
    } finally {
      rootFolderPromise = null;
    }
  })();

  return rootFolderPromise;
}

/**
 * Searches for or reuses the 'Backup_Data_Aplikasi' subfolder inside the root folder.
 * Caches folder ID to prevent duplicate subfolder creation.
 */
export async function getOrCreateBackupDataSubfolder(accessToken: string): Promise<string> {
  if (backupSubfolderPromise) {
    return backupSubfolderPromise;
  }

  backupSubfolderPromise = (async () => {
    try {
      // 1. Check in-memory or localStorage cache first
      let storedSubId = cachedBackupSubfolderId;
      if (!storedSubId && typeof window !== "undefined") {
        storedSubId = localStorage.getItem(BACKUP_SUBFOLDER_CACHE_KEY);
      }

      if (storedSubId) {
        try {
          const verifyRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${storedSubId}?fields=id,name,trashed&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (verifyRes.ok) {
            const fileData = await verifyRes.json();
            if (fileData && fileData.id && !fileData.trashed) {
              cachedBackupSubfolderId = fileData.id;
              if (typeof window !== "undefined") {
                localStorage.setItem(BACKUP_SUBFOLDER_CACHE_KEY, fileData.id);
              }
              return fileData.id;
            }
          }
        } catch {}
      }

      const rootFolderId = await getOrCreateSlideExamFolder(accessToken);

      // 2. Search for existing subfolder inside root folder
      const query = `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and (name='${GOOGLE_DRIVE_BACKUP_SUBFOLDER_NAME}' or name='${GOOGLE_DRIVE_EXAMS_FOLDER_NAME}' or name contains 'Backup') and trashed=false`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        query
      )}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true`;

      const searchRes = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.files && data.files.length > 0) {
          const exactMatch = data.files.find((f: any) => f.name === GOOGLE_DRIVE_BACKUP_SUBFOLDER_NAME);
          const foundId = exactMatch ? exactMatch.id : data.files[0].id;
          cachedBackupSubfolderId = foundId;
          if (typeof window !== "undefined") {
            localStorage.setItem(BACKUP_SUBFOLDER_CACHE_KEY, foundId);
          }
          return foundId;
        }
      }

      // 3. Create subfolder 'Backup_Data_Aplikasi'
      const createUrl = "https://www.googleapis.com/drive/v3/files?supportsAllDrives=true";
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: GOOGLE_DRIVE_BACKUP_SUBFOLDER_NAME,
          parents: [rootFolderId],
          mimeType: "application/vnd.google-apps.folder",
          description: "Sub folder backup data aplikasi untuk naskah soal dan cadangan data SlideExam CBT",
        }),
      });

      if (!createRes.ok) {
        return rootFolderId; // fallback to root if subfolder creation fails
      }

      const created = await createRes.json();
      cachedBackupSubfolderId = created.id;
      if (typeof window !== "undefined") {
        localStorage.setItem(BACKUP_SUBFOLDER_CACHE_KEY, created.id);
      }
      return created.id;
    } finally {
      backupSubfolderPromise = null;
    }
  })();

  return backupSubfolderPromise;
}

/**
 * Legacy alias for backwards compatibility
 */
export async function getOrCreateExamsSubfolder(accessToken: string): Promise<string> {
  return getOrCreateBackupDataSubfolder(accessToken);
}

/**
 * Make file readable to anyone with link (for student access without requiring student login)
 */
export async function makeFilePubliclyReadable(accessToken: string, fileId: string): Promise<boolean> {
  try {
    const permUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`;
    const res = await fetch(permUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("Could not set public permission on Drive file:", err);
    return false;
  }
}

/**
 * Saves or updates a single ExamPackage to Google Drive.
 * Format nama file: kelas_mata pelajaran_kode soal.json
 * Folder: sub folder backup data aplikasi (SlideExam_CBT/Backup_Data_Aplikasi)
 */
export async function saveExamToGoogleDrive(
  accessToken: string,
  exam: ExamPackage
): Promise<{ fileId: string; fileName: string; webViewLink?: string; downloadUrl: string }> {
  const folderId = await getOrCreateBackupDataSubfolder(accessToken);
  const fileName = formatExamDriveFileName(exam);

  const examToSave: ExamPackage = {
    ...exam,
    gdriveFileName: fileName,
    gdriveSyncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const fileContent = JSON.stringify(examToSave, null, 2);

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  // Check if we can update an existing file (by exam.gdriveFileId or by filename in folder)
  let targetFileId = exam.gdriveFileId;

  if (!targetFileId) {
    // Check if a file with same name exists in folder
    try {
      const q = `'${folderId}' in parents and name='${fileName}' and trashed=false`;
      const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (searchRes.ok) {
        const data = await searchRes.json();
        if (data.files && data.files.length > 0) {
          targetFileId = data.files[0].id;
        }
      }
    } catch (e) {
      console.warn("Drive search by filename skipped", e);
    }
  }

  let finalFileId = "";
  let webViewLink = "";

  if (targetFileId) {
    // Update existing file content & metadata
    const metadata = {
      name: fileName,
      description: `Naskah Soal SlideExam: ${exam.title} (${exam.code}) - ${exam.questions.length} butir - Disimpan: ${new Date().toLocaleString("id-ID")}`,
    };

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      fileContent +
      closeDelim;

    const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=multipart&fields=id,name,webViewLink`;
    const res = await fetch(updateUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (res.ok) {
      const data = await res.json();
      finalFileId = data.id;
      webViewLink = data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`;
    }
  }

  if (!finalFileId) {
    // Create new file in sub folder backup data aplikasi
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: "application/json",
      description: `Naskah Soal SlideExam: ${exam.title} (${exam.code}) - ${exam.questions.length} butir - Disimpan: ${new Date().toLocaleString("id-ID")}`,
    };

    const multipartRequestBody =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/json\r\n\r\n" +
      fileContent +
      closeDelim;

    const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink";
    const res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!res.ok) {
      throw await parseGoogleDriveError(res, "Gagal menyimpan naskah soal ke Google Drive.");
    }

    const created = await res.json();
    finalFileId = created.id;
    webViewLink = created.webViewLink || `https://drive.google.com/file/d/${created.id}/view`;
  }

  // Ensure public read permission for seamless student loading without login
  await makeFilePubliclyReadable(accessToken, finalFileId);

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${finalFileId}?alt=media`;

  const examComplete: ExamPackage = {
    ...examToSave,
    gdriveFileId: finalFileId,
    gdriveFileName: fileName,
    gdriveWebViewLink: webViewLink,
  };

  // Cache in localStorage immediately for instant offline/reload resolution
  try {
    localStorage.setItem(`gdrive_cache_${finalFileId}`, JSON.stringify(examComplete));
    if (exam.code) {
      localStorage.setItem(`gdrive_code_${exam.code.toUpperCase()}`, JSON.stringify(examComplete));
    }
  } catch {}

  // 1. Dual-sync to Google Apps Script & Sheets for reliable multi-device student access
  try {
    await syncExamToGAS(examComplete, exam.tokens);
  } catch (syncErr) {
    console.warn("GAS sync during Drive save:", syncErr);
  }

  // 2. Register in local server Drive index & share registry so student short links resolve without Google sign-in
  try {
    await fetch("/api/gdrive/register-exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: exam.code,
        fileId: finalFileId,
        fileName,
        webViewLink,
        downloadUrl,
        exam: examComplete,
        accessToken,
      }),
    });
  } catch (e) {
    console.warn("Background Drive registration skipped:", e);
  }

  try {
    await fetch("/api/exams/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exam: examComplete,
        token: exam.sessionToken,
        tokens: exam.tokens || [],
      }),
    });
  } catch {}

  return {
    fileId: finalFileId,
    fileName,
    webViewLink,
    downloadUrl,
  };
}

/**
 * Auto-scans the 'Data_Soal' folder (and any subfolders) in Google Drive recursively.
 * Intelligently mitigates teacher manual naming mistakes:
 * 1. Searches user's Drive for any folder named 'Data_Soal', 'Data Soal', etc. (including inside SlideExam_CBT).
 * 2. Traverses all nested subfolders recursively using Breadth-First Search (BFS).
 * 3. Retrieves all .json files across all discovered subfolders with pagination handling.
 * 4. Resiliently inspects each file: if the file name lacks a code or was manually misnamed
 *    (e.g., 'soal_pancasila.json' or 'Ulangan Harian 1.json'), it reads the JSON content to extract
 *    the TRUE exam.code and exam.title directly from the package structure.
 * 5. Auto-indexes discovered exams into localStorage and registers them with the server API (/api/gdrive/register-exam)
 *    so students can immediately join with ?code=... without naming hurdles.
 */
export async function autoScanDataSoalFolder(
  accessTokenOrNull?: string | null
): Promise<DataSoalScanResult> {
  const token = accessTokenOrNull || getCachedAccessToken();
  if (!token) {
    return {
      success: false,
      folderFound: false,
      folderCount: 0,
      filesScanned: 0,
      examsIndexed: 0,
      items: [],
      error: "Token akses Google Drive tidak tersedia. Silakan hubungkan akun Google terlebih dahulu.",
    };
  }

  try {
    // 1. Gather seed candidate folder IDs
    const candidateFolderIds = new Set<string>();

    // A. Query user's Drive for any folder named 'Data_Soal', 'Data Soal', or legacy 'Naskah_Soal'
    try {
      const folderQuery = `mimeType='application/vnd.google-apps.folder' and (name='${GOOGLE_DRIVE_DATA_SOAL_FOLDER_NAME}' or name='Data Soal' or name='data_soal' or name='Data-Soal' or name='${GOOGLE_DRIVE_EXAMS_FOLDER_NAME}') and trashed=false`;
      const fSearchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
        folderQuery
      )}&fields=files(id,name)&supportsAllDrives=true&includeItemsFromAllDrives=true&pageSize=50`;
      const fRes = await fetch(fSearchUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (fRes.ok) {
        const fData = await fRes.json();
        if (fData.files && Array.isArray(fData.files)) {
          for (const folder of fData.files) {
            candidateFolderIds.add(folder.id);
          }
        }
      }
    } catch (err) {
      console.warn("Data_Soal folder search query error:", err);
    }

    // B. Also include Backup_Data_Aplikasi and root SlideExam_CBT folder
    try {
      const rootId = await getOrCreateSlideExamFolder(token);
      if (rootId) candidateFolderIds.add(rootId);
      const backupId = await getOrCreateBackupDataSubfolder(token);
      if (backupId) candidateFolderIds.add(backupId);
    } catch (err) {
      console.warn("Root folder fetch in autoScan error:", err);
    }

    // 2. Recursive BFS traversal to discover all subfolders
    const visitedFolderIds = new Set<string>();
    const folderQueue: string[] = Array.from(candidateFolderIds);

    while (folderQueue.length > 0) {
      const currentFolderId = folderQueue.shift()!;
      if (visitedFolderIds.has(currentFolderId)) continue;
      visitedFolderIds.add(currentFolderId);

      let pageToken: string | undefined = undefined;
      let depthLimit = 0;
      do {
        depthLimit++;
        const subQuery = `'${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        let subUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          subQuery
        )}&fields=nextPageToken,files(id,name)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        if (pageToken) subUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

        const subRes = await fetch(subUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!subRes.ok) break;
        const subData = await subRes.json();
        if (subData.files && Array.isArray(subData.files)) {
          for (const sub of subData.files) {
            if (!visitedFolderIds.has(sub.id) && !folderQueue.includes(sub.id)) {
              folderQueue.push(sub.id);
            }
          }
        }
        pageToken = subData.nextPageToken;
      } while (pageToken && depthLimit < 20);
    }

    // 3. Query all JSON files across all visited folders
    const discoveredFilesMap = new Map<string, any>();

    for (const folderId of visitedFolderIds) {
      let pageToken: string | undefined = undefined;
      let fileLimit = 0;
      do {
        fileLimit++;
        const fileQuery = `'${folderId}' in parents and mimeType='application/json' and trashed=false`;
        let fileUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          fileQuery
        )}&fields=nextPageToken,files(id,name,createdTime,modifiedTime,size,webViewLink,description)&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true`;
        if (pageToken) fileUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

        const fileRes = await fetch(fileUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!fileRes.ok) break;
        const fileData = await fileRes.json();
        if (fileData.files && Array.isArray(fileData.files)) {
          for (const f of fileData.files) {
            // Exclude whole-app backups
            if (!f.name.startsWith("SlideExam_CBT_Backup_")) {
              discoveredFilesMap.set(f.id, f);
            }
          }
        }
        pageToken = fileData.nextPageToken;
      } while (pageToken && fileLimit < 20);
    }

    // 4. Resilient Exam Processing & Auto-indexing
    // Mitigate teacher manual naming mistakes by reading internal exam payload if code is ambiguous
    const examItems: GoogleDriveExamItem[] = [];
    const filesList = Array.from(discoveredFilesMap.values());

    for (const f of filesList) {
      const parsedInfo = parseExamInfoFromDriveFileName(f.name);
      let resolvedCode = parsedInfo.examCode || "";
      let resolvedTitle = parsedInfo.examTitle || f.name.replace(/\.json$/i, "");
      let resolvedSubject = parsedInfo.subject;
      let resolvedGradeLevel = parsedInfo.gradeLevel;
      let questionCount: number | undefined = undefined;
      let totalScore: number | undefined = undefined;
      let durationMinutes: number | undefined = undefined;
      let sessionToken: string | undefined = undefined;
      let examPayload: ExamPackage | null = null;

      // Check localStorage cache first
      let cachedExamStr: string | null = null;
      try {
        cachedExamStr = localStorage.getItem(`gdrive_cache_${f.id}`);
      } catch {}

      if (cachedExamStr) {
        try {
          examPayload = JSON.parse(cachedExamStr);
        } catch {}
      }

      // If not cached, or if filename lacked code or had manual generic naming, inspect JSON content
      if (!examPayload && (!resolvedCode || resolvedCode.startsWith("SOAL") || !resolvedSubject)) {
        try {
          const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (dlRes.ok) {
            const rawJson = await dlRes.json();
            if (rawJson && Array.isArray(rawJson.questions) && rawJson.questions.length > 0) {
              examPayload = rawJson;
            }
          }
        } catch (inspectErr) {
          console.warn(`Could not inspect JSON content for ${f.name}:`, inspectErr);
        }
      }

      // If examPayload is verified, extract true values regardless of manual filename errors
      if (examPayload) {
        if (examPayload.code) {
          resolvedCode = examPayload.code.trim().toUpperCase();
        }
        if (examPayload.title) {
          resolvedTitle = examPayload.title.trim();
        }
        if (examPayload.teacherProfile?.subject) {
          resolvedSubject = examPayload.teacherProfile.subject;
        }
        if (examPayload.teacherProfile?.gradeLevel) {
          resolvedGradeLevel = examPayload.teacherProfile.gradeLevel;
        }
        if (Array.isArray(examPayload.questions)) {
          questionCount = examPayload.questions.length;
        }
        if (examPayload.totalScore !== undefined) {
          totalScore = examPayload.totalScore;
        }
        if (examPayload.durationMinutes !== undefined) {
          durationMinutes = examPayload.durationMinutes;
        }
        if (examPayload.sessionToken) {
          sessionToken = examPayload.sessionToken;
        }

        // Cache in localStorage by ID and by Code
        try {
          localStorage.setItem(`gdrive_cache_${f.id}`, JSON.stringify(examPayload));
          if (resolvedCode) {
            localStorage.setItem(`gdrive_code_${resolvedCode}`, JSON.stringify(examPayload));
          }
        } catch {}

        // Ensure file is publicly readable so students don't face permission screens
        makeFilePubliclyReadable(token, f.id).catch(() => {});

        // Register to server so student devices can resolve via Express backend
        try {
          fetch("/api/gdrive/register-exam", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              code: resolvedCode,
              fileId: f.id,
              fileName: f.name,
              webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
              downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`,
              exam: examPayload,
              accessToken: token,
            }),
          }).catch(() => {});
        } catch {}
      }

      examItems.push({
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
        examCode: resolvedCode,
        examTitle: resolvedTitle,
        subject: resolvedSubject,
        gradeLevel: resolvedGradeLevel,
        questionCount,
        totalScore,
        durationMinutes,
        sessionToken,
      });
    }

    // Sort by modifiedTime descending
    examItems.sort((a, b) => (b.modifiedTime || "").localeCompare(a.modifiedTime || ""));

    // Save scan cache in localStorage
    try {
      localStorage.setItem("slideexam_scanned_data_soal_exams", JSON.stringify(examItems));
      localStorage.setItem("slideexam_last_data_soal_scan_time", new Date().toISOString());
    } catch {}

    return {
      success: true,
      folderFound: visitedFolderIds.size > 0,
      folderCount: visitedFolderIds.size,
      filesScanned: filesList.length,
      examsIndexed: examItems.length,
      items: examItems,
      scannedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    console.error("autoScanDataSoalFolder error:", err);
    return {
      success: false,
      folderFound: false,
      folderCount: 0,
      filesScanned: 0,
      examsIndexed: 0,
      items: [],
      error: err?.message || "Gagal memindai folder Data_Soal di Google Drive.",
    };
  }
}

/**
 * Explicit alias for autoScanDataSoalFolder to support recursive scanning calls
 */
export const scanDataSoalFolderRecursively = autoScanDataSoalFolder;

/**
 * Lists all individual exam packages from Google Drive.
 * Uses recursive autoScanDataSoalFolder across Data_Soal, Backup_Data_Aplikasi, and root.
 */
export async function listExamsFromGoogleDrive(accessToken: string): Promise<GoogleDriveExamItem[]> {
  try {
    const scanResult = await autoScanDataSoalFolder(accessToken);
    if (scanResult.success && scanResult.items.length > 0) {
      return scanResult.items;
    }
  } catch (err) {
    console.warn("autoScanDataSoalFolder in listExams error, falling back to direct search:", err);
  }

  const rootFolderId = await getOrCreateSlideExamFolder(accessToken);
  const backupFolderId = await getOrCreateBackupDataSubfolder(accessToken);

  // Fallback search across backup subfolder, root folder for .json files
  const query = `('${backupFolderId}' in parents or '${rootFolderId}' in parents) and trashed=false and mimeType='application/json'`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    query
  )}&orderBy=modifiedTime desc&fields=files(id,name,createdTime,modifiedTime,size,webViewLink,description)`;

  const res = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw await parseGoogleDriveError(res, "Gagal memuat daftar naskah soal dari Google Drive.");
  }

  const data = await res.json();
  const rawFiles: any[] = data.files || [];

  return rawFiles
    .filter((f) => !f.name.startsWith("SlideExam_CBT_Backup_")) // exclude full app backups
    .map((f) => {
      const parsedInfo = parseExamInfoFromDriveFileName(f.name);

      return {
        id: f.id,
        name: f.name,
        createdTime: f.createdTime,
        modifiedTime: f.modifiedTime,
        size: f.size,
        webViewLink: f.webViewLink,
        examCode: parsedInfo.examCode || "",
        examTitle: parsedInfo.examTitle || f.name,
        subject: parsedInfo.subject,
        gradeLevel: parsedInfo.gradeLevel,
      };
    });
}

/**
 * Performs a server-side proxy request for Google Drive JSON content (e.g. ExamPackage),
 * bypassing browser CORS, cookie, and Google Workspace tenant restrictions for student devices (phones, tablets, laptops).
 *
 * @param fileIdOrUrl Google Drive file ID or full Google Drive URL
 * @param accessTokenOrNull Optional OAuth access token if available (teacher auth), otherwise falls back to public access
 * @returns Parsed JSON content / ExamPackage or null if not found
 */
export async function fetchGoogleDriveJsonViaProxy<T = ExamPackage>(
  fileIdOrUrl: string,
  accessTokenOrNull?: string | null
): Promise<T | null> {
  const cleanInput = (fileIdOrUrl || "").trim();
  if (!cleanInput) return null;

  // Extract fileId if full Google Drive link or query was provided
  const extracted = extractGoogleDriveFileId(cleanInput);
  const targetFileId = extracted.fileId || cleanInput;

  if (!targetFileId) return null;

  try {
    const proxyHeaders: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
    };
    if (accessTokenOrNull) {
      proxyHeaders.Authorization = `Bearer ${accessTokenOrNull}`;
    }

    // 1. Try primary server-side proxy route: /api/gdrive/exam/:fileId
    let proxyRes = await fetch(`/api/gdrive/exam/${encodeURIComponent(targetFileId)}`, {
      headers: proxyHeaders,
    });

    // If failed with token, retry proxy without token (for public sharing links)
    if (!proxyRes.ok && accessTokenOrNull) {
      proxyRes = await fetch(`/api/gdrive/exam/${encodeURIComponent(targetFileId)}`, {
        headers: { Accept: "application/json, text/plain, */*" },
      });
    }

    // 2. Fallback to /api/gdrive/proxy?fileId=... route if not ok
    if (!proxyRes.ok) {
      proxyRes = await fetch(`/api/gdrive/proxy?fileId=${encodeURIComponent(targetFileId)}`, {
        headers: proxyHeaders,
      });
    }

    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data) {
        const payload: any = data.exam || (Array.isArray(data.questions) ? data : null) || (data.item?.exam ? data.item.exam : null) || data;
        if (payload && (Array.isArray(payload.questions) || payload.title || payload.id)) {
          const completeResult = {
            ...payload,
            gdriveFileId: targetFileId,
            gdriveSyncedAt: payload.gdriveSyncedAt || new Date().toISOString(),
          };

          // Cache locally for subsequent instant loads and offline resilience
          try {
            localStorage.setItem(`gdrive_cache_${targetFileId}`, JSON.stringify(completeResult));
            if (completeResult.code) {
              localStorage.setItem(`gdrive_code_${String(completeResult.code).toUpperCase()}`, JSON.stringify(completeResult));
            }
          } catch {}

          return completeResult as T;
        }
      }
    }
  } catch (err) {
    console.warn(`[fetchGoogleDriveJsonViaProxy] Server proxy request failed for fileId: ${targetFileId}:`, err);
  }

  return null;
}

/**
 * Aliases for fetchGoogleDriveJsonViaProxy for ergonomic naming across student and teacher components.
 */
export const fetchDriveJsonViaServerProxy = fetchGoogleDriveJsonViaProxy;
export const fetchExamViaServerProxy = fetchGoogleDriveJsonViaProxy;

/**
 * Loads an ExamPackage from Google Drive by file ID.
 * Resilient multi-tier strategy: Local cache -> Server proxy -> Firestore -> Direct fetch.
 */
export async function loadExamFromGoogleDrive(
  accessTokenOrNull: string | null,
  fileId: string
): Promise<ExamPackage> {
  if (!fileId) {
    throw new Error("ID File Google Drive tidak valid.");
  }

  // Tier 1: Check browser local cache
  try {
    const cached = localStorage.getItem(`gdrive_cache_${fileId}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Tier 2: Try server-side proxy (bypasses CORS, cookie, and Google Workspace restrictions)
  try {
    const proxyExam = await fetchGoogleDriveJsonViaProxy<ExamPackage>(fileId, accessTokenOrNull);
    if (proxyExam && Array.isArray(proxyExam.questions) && proxyExam.questions.length > 0) {
      return proxyExam;
    }
  } catch (err) {
    console.warn("Server proxy download failed, trying Firestore and direct:", err);
  }

  // Tier 3: Try Google Apps Script / Sheets lookup (acts as official cloud proxy to Drive)
  try {
    const gasResult = await fetchExamFromGAS("", fileId);
    if (gasResult && gasResult.success && gasResult.exam && Array.isArray(gasResult.exam.questions)) {
      const result: ExamPackage = {
        ...gasResult.exam,
        gdriveFileId: fileId,
      };
      try {
        localStorage.setItem(`gdrive_cache_${fileId}`, JSON.stringify(result));
        if (result.code) {
          localStorage.setItem(`gdrive_code_${result.code.toUpperCase()}`, JSON.stringify(result));
        }
      } catch {}
      return result;
    }
  } catch (gasErr) {
    console.warn("GAS lookup for fileId failed, continuing to next tier:", gasErr);
  }

  // Tier 4: Direct fetch with token (if valid) or fallback to public proxy
  let json: any = null;
  if (accessTokenOrNull) {
    try {
      const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${accessTokenOrNull}` },
      });
      if (res.ok) {
        json = await res.json();
      } else if (res.status === 401) {
        notifyAuthExpired();
      }
    } catch (e) {
      console.warn("Direct Drive API fetch error:", e);
    }
  }

  // If not retrieved yet, try server proxy without token one more time
  if (!json || !Array.isArray(json.questions)) {
    try {
      const fallbackProxy = await fetch(`/api/gdrive/exam/${encodeURIComponent(fileId)}`);
      if (fallbackProxy.ok) {
        const proxyData = await fallbackProxy.json();
        if (proxyData.success && proxyData.exam && Array.isArray(proxyData.exam.questions)) {
          json = proxyData.exam;
        }
      }
    } catch {}
  }

  if (!json || !Array.isArray(json.questions)) {
    throw new Error(
      "Gagal memuat naskah soal dari Google Drive. Pastikan file dibagikan dengan akses 'Siapa saja yang memiliki link' atau minta guru membagikan naskah kembali."
    );
  }

  const exam: ExamPackage = {
    ...json,
    gdriveFileId: fileId,
    gdriveSyncedAt: json.gdriveSyncedAt || new Date().toISOString(),
  };

  try {
    localStorage.setItem(`gdrive_cache_${fileId}`, JSON.stringify(exam));
    if (exam.code) {
      localStorage.setItem(`gdrive_code_${exam.code.toUpperCase()}`, JSON.stringify(exam));
    }
  } catch {}

  return exam;
}

/**
 * Loads an exam directly using a pasted Google Drive link or file ID.
 * Parses the link, validates that it's not a folder, and downloads the exam package.
 */
export async function loadExamFromGoogleDriveUrlOrId(
  urlOrId: string,
  accessTokenOrNull?: string | null
): Promise<ExamPackage> {
  const extracted = extractGoogleDriveFileId(urlOrId);
  if (extracted.error || !extracted.fileId) {
    throw new Error(extracted.error || "Gagal mengekstrak ID file Google Drive dari tautan yang diberikan.");
  }

  return await loadExamFromGoogleDrive(accessTokenOrNull || null, extracted.fileId);
}

/**
 * Searches and automatically loads an exam from Google Drive by exam code or file name.
 * Also intelligently recognizes if the user pasted a direct Google Drive link or file ID!
 * Fulfills requirement: "ketika siswa membuka link maka app akan otomatis mencari nama soal yang sesuai"
 */
export async function findAndLoadExamFromDriveByCode(
  codeOrQuery: string,
  accessTokenOrNull?: string | null
): Promise<ExamPackage | null> {
  const cleanQuery = (codeOrQuery || "").trim();
  if (!cleanQuery) return null;

  // Tier 0: Check if cleanQuery is a Google Drive URL or direct Google Drive File ID
  if (
    cleanQuery.includes("drive.google.com") ||
    cleanQuery.includes("docs.google.com") ||
    cleanQuery.includes("/file/d/") ||
    cleanQuery.includes("id=") ||
    /^[a-zA-Z0-9_-]{25,60}$/.test(cleanQuery)
  ) {
    const extracted = extractGoogleDriveFileId(cleanQuery);
    if (extracted.fileId) {
      try {
        const loadedFromLink = await loadExamFromGoogleDrive(accessTokenOrNull || null, extracted.fileId);
        if (loadedFromLink && Array.isArray(loadedFromLink.questions)) {
          return loadedFromLink;
        }
      } catch (err) {
        console.warn("Direct link loading in code search failed:", err);
      }
    }
  }

  // Tier 1: Check localStorage cache
  try {
    const cached = localStorage.getItem(`gdrive_code_${cleanQuery.toUpperCase()}`);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
        return parsed;
      }
    }
  } catch {}

  // Tier 2: Check server Google Drive registry search endpoint
  try {
    const searchRes = await fetch(`/api/gdrive/search?q=${encodeURIComponent(cleanQuery)}`);
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.success && searchData.item) {
        if (searchData.item.exam && Array.isArray(searchData.item.exam.questions)) {
          return searchData.item.exam;
        }
        if (searchData.item.fileId) {
          return await loadExamFromGoogleDrive(accessTokenOrNull || null, searchData.item.fileId);
        }
      }
    }
  } catch (err) {
    console.warn("Server search failed:", err);
  }

  // Tier 3: Check Google Apps Script / Sheets by code
  try {
    const gasRes = await fetchExamFromGAS(cleanQuery);
    if (gasRes.exam && Array.isArray(gasRes.exam.questions)) {
      return gasRes.exam;
    }
  } catch {}

  // Tier 4: Check server /api/exams/by-code/:code
  try {
    const apiRes = await fetch(`/api/exams/by-code/${encodeURIComponent(cleanQuery)}`);
    if (apiRes.ok) {
      const d = await apiRes.json();
      if (d.success && d.exam && Array.isArray(d.exam.questions)) {
        return d.exam;
      }
    }
  } catch {}

  // Tier 5: If access token available, auto-scan Data_Soal recursively or search Drive directly
  const tokenToUse = accessTokenOrNull || getCachedAccessToken();
  if (tokenToUse) {
    try {
      // 5a. Try recursive autoScanDataSoalFolder
      const scanResult = await autoScanDataSoalFolder(tokenToUse);
      if (scanResult.success && scanResult.items.length > 0) {
        const found = scanResult.items.find(
          (it) =>
            it.examCode?.toUpperCase() === cleanQuery.toUpperCase() ||
            it.name.toUpperCase().includes(cleanQuery.toUpperCase()) ||
            it.id === cleanQuery
        );
        if (found) {
          return await loadExamFromGoogleDrive(tokenToUse, found.id);
        }
      }

      // 5b. Direct query across backup and root folder as fallback
      const backupFolderId = await getOrCreateBackupDataSubfolder(tokenToUse);
      const rootFolderId = await getOrCreateSlideExamFolder(tokenToUse);
      const q = `('${backupFolderId}' in parents or '${rootFolderId}' in parents) and name contains '${cleanQuery}' and trashed=false and mimeType='application/json'`;
      const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`;
      const res = await fetch(searchUrl, {
        headers: { Authorization: `Bearer ${tokenToUse}` },
      });
      if (res.ok) {
        const d = await res.json();
        if (d.files && d.files.length > 0) {
          return await loadExamFromGoogleDrive(tokenToUse, d.files[0].id);
        }
      }
    } catch (err) {
      console.warn("Direct Drive API search failed:", err);
    }
  }

  return null;
}

/**
 * Deletes an exam package file from Google Drive.
 */
export async function deleteExamFromGoogleDrive(accessToken: string, fileId: string): Promise<void> {
  const deleteUrl = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    throw await parseGoogleDriveError(res, "Gagal menghapus naskah soal dari Google Drive.");
  }
}

/**
 * Uploads a full backup JSON into the 'SlideExam_CBT' folder on Google Drive.
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  backupData: AppStateBackup
): Promise<GoogleDriveFileItem> {
  const folderId = await getOrCreateSlideExamFolder(accessToken);
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `SlideExam_CBT_Backup_${timestamp}.json`;

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/json",
    description: `Cadangan data SlideExam CBT dibuat pada ${now.toLocaleString("id-ID")}`,
  };

  const fileContent = JSON.stringify(backupData, null, 2);
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    fileContent +
    closeDelim;

  const uploadUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime,modifiedTime,size";
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    throw await parseGoogleDriveError(res, "Gagal mengunggah file backup ke Google Drive.");
  }

  const uploadedFile = await res.json();
  return uploadedFile;
}

/**
 * Lists all backup files inside the 'SlideExam_CBT' folder.
 */
export async function listBackupsFromGoogleDrive(accessToken: string): Promise<GoogleDriveFileItem[]> {
  const folderId = await getOrCreateSlideExamFolder(accessToken);
  const query = `'${folderId}' in parents and trashed=false and name contains 'Backup' and mimeType='application/json'`;
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&orderBy=createdTime desc&fields=files(id,name,createdTime,modifiedTime,size)`;

  const res = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw await parseGoogleDriveError(res, "Gagal memuat daftar backup dari folder SlideExam_CBT.");
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Downloads and parses backup data from a Google Drive file.
 */
export async function downloadBackupFromGoogleDrive(
  accessToken: string,
  fileId: string
): Promise<AppStateBackup> {
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw await parseGoogleDriveError(res, "Gagal mengunduh file backup dari Google Drive.");
  }

  const json = await res.json();
  return json as AppStateBackup;
}

