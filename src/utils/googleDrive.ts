import { AppStateBackup, ExamPackage } from "../types";
import { getCachedAccessToken } from "./googleAuth";

export const GOOGLE_DRIVE_BACKUP_FOLDER_NAME = "SlideExam_CBT";
export const GOOGLE_DRIVE_BACKUP_SUBFOLDER_NAME = "Backup_Data_Aplikasi";
export const GOOGLE_DRIVE_EXAMS_FOLDER_NAME = "Naskah_Soal"; // legacy compatibility

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

/**
 * Generates standard Google Drive filename format:
 * kelas_mata pelajaran_kode soal.json
 * Contoh: "Kelas VI_Pendidikan Pancasila_PP-01.json"
 */
export function formatExamDriveFileName(exam: ExamPackage): string {
  const cleanKelas = (exam.teacherProfile?.gradeLevel || "Kelas VI")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, " ");

  const cleanMapel = (exam.teacherProfile?.subject || exam.title || "Mata Pelajaran")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, " ");

  const cleanKode = (exam.code || "SOAL")
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  return `${cleanKelas}_${cleanMapel}_${cleanKode}.json`;
}

/**
 * Parses grade, subject, and exam code from a Google Drive file name
 */
export function parseExamInfoFromDriveFileName(fileName: string): {
  gradeLevel?: string;
  subject?: string;
  examCode?: string;
  examTitle?: string;
} {
  const cleanName = fileName.replace(/\.json$/i, "").trim();

  // Pattern 1: kelas_mata pelajaran_kode soal (e.g. Kelas VI_Pendidikan Pancasila_PP-01)
  const parts = cleanName.split("_");
  if (parts.length >= 3) {
    const gradeLevel = parts[0].trim();
    const subject = parts.slice(1, -1).join(" ").trim();
    const examCode = parts[parts.length - 1].trim().toUpperCase();
    return {
      gradeLevel,
      subject,
      examCode,
      examTitle: `${subject} (${examCode})`,
    };
  }

  // Pattern 2: Legacy SOAL_[CODE]_[TITLE]
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
 * Searches for or creates the dedicated backup folder 'SlideExam_CBT' on the user's Google Drive.
 * Strictly avoids creating any other folder names.
 */
export async function getOrCreateSlideExamFolder(accessToken: string): Promise<string> {
  const query = `mimeType='application/vnd.google-apps.folder' and name='${GOOGLE_DRIVE_BACKUP_FOLDER_NAME}' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchRes.ok) {
    const errData = await searchRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Gagal mencari folder ${GOOGLE_DRIVE_BACKUP_FOLDER_NAME} di Google Drive.`);
  }

  const data = await searchRes.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create folder strictly named 'SlideExam_CBT'
  const createUrl = "https://www.googleapis.com/drive/v3/files";
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
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Gagal membuat folder ${GOOGLE_DRIVE_BACKUP_FOLDER_NAME} di Google Drive.`);
  }

  const created = await createRes.json();
  return created.id;
}

/**
 * Searches for or creates the 'Backup_Data_Aplikasi' subfolder inside 'SlideExam_CBT'.
 * This fulfills the user requirement: "masukkan ke dalam sub folder backup data aplikasi".
 */
export async function getOrCreateBackupDataSubfolder(accessToken: string): Promise<string> {
  const rootFolderId = await getOrCreateSlideExamFolder(accessToken);
  const query = `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and (name='${GOOGLE_DRIVE_BACKUP_SUBFOLDER_NAME}' or name='${GOOGLE_DRIVE_EXAMS_FOLDER_NAME}') and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      // Prefer exact match for Backup_Data_Aplikasi if exists
      const exactMatch = data.files.find((f: any) => f.name === GOOGLE_DRIVE_BACKUP_SUBFOLDER_NAME);
      if (exactMatch) return exactMatch.id;
      return data.files[0].id;
    }
  }

  // Create subfolder 'Backup_Data_Aplikasi'
  const createUrl = "https://www.googleapis.com/drive/v3/files";
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
  return created.id;
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
    const permUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`;
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
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || "Gagal menyimpan naskah soal ke Google Drive.");
    }

    const created = await res.json();
    finalFileId = created.id;
    webViewLink = created.webViewLink || `https://drive.google.com/file/d/${created.id}/view`;
  }

  // Ensure public read permission for seamless student loading without login
  await makeFilePubliclyReadable(accessToken, finalFileId);

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${finalFileId}?alt=media`;

  // Register in local server Drive index so student short links can resolve without Google sign-in
  try {
    fetch("/api/gdrive/register-exam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: exam.code,
        fileId: finalFileId,
        fileName,
        webViewLink,
        downloadUrl,
        exam: {
          ...examToSave,
          gdriveFileId: finalFileId,
          gdriveFileName: fileName,
          gdriveWebViewLink: webViewLink,
        },
      }),
    }).catch((e) => console.warn("Background Drive registration skipped:", e));
  } catch {}

  return {
    fileId: finalFileId,
    fileName,
    webViewLink,
    downloadUrl,
  };
}

/**
 * Lists all individual exam packages from Google Drive.
 * Searches across Backup_Data_Aplikasi, Naskah_Soal, and root folder.
 */
export async function listExamsFromGoogleDrive(accessToken: string): Promise<GoogleDriveExamItem[]> {
  const rootFolderId = await getOrCreateSlideExamFolder(accessToken);
  const backupFolderId = await getOrCreateBackupDataSubfolder(accessToken);

  // Search across backup subfolder and root folder for .json files
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
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Gagal memuat daftar naskah soal dari Google Drive.");
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
 * Loads an ExamPackage from Google Drive by file ID.
 * First tries the backend proxy (/api/gdrive/exam/:fileId) which eliminates CORS & cookie issues.
 */
export async function loadExamFromGoogleDrive(
  accessTokenOrNull: string | null,
  fileId: string
): Promise<ExamPackage> {
  // 1. Try server-side proxy first
  try {
    const proxyRes = await fetch(`/api/gdrive/exam/${encodeURIComponent(fileId)}`);
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      if (data.success && data.exam && Array.isArray(data.exam.questions)) {
        return {
          ...data.exam,
          gdriveFileId: fileId,
          gdriveSyncedAt: data.exam.gdriveSyncedAt || new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn("Server proxy download failed, falling back to direct download:", err);
  }

  // 2. Direct fetch with token or public Google Drive export
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const headers: Record<string, string> = {};

  if (accessTokenOrNull) {
    headers.Authorization = `Bearer ${accessTokenOrNull}`;
  }

  let res = await fetch(downloadUrl, { headers });

  // If unauthorized or no token, attempt public Google Drive download endpoint
  if (!res.ok && !accessTokenOrNull) {
    const publicUrl = `https://drive.google.com/uc?id=${fileId}&export=download`;
    res = await fetch(publicUrl);
  }

  if (!res.ok) {
    throw new Error(`Gagal memuat naskah soal dari Google Drive (Status ${res.status}). Pastikan file dapat diakses.`);
  }

  const json = await res.json();

  if (!json || !Array.isArray(json.questions)) {
    throw new Error("Format file di Google Drive tidak valid sebagai paket naskah soal SlideExam.");
  }

  const exam: ExamPackage = {
    ...json,
    gdriveFileId: fileId,
    gdriveSyncedAt: json.gdriveSyncedAt || new Date().toISOString(),
  };

  return exam;
}

/**
 * Searches and automatically loads an exam from Google Drive by exam code or file name.
 * Fulfills requirement: "ketika siswa membuka link maka app akan otomatis mencari nama soal yang sesuai"
 */
export async function findAndLoadExamFromDriveByCode(
  codeOrQuery: string,
  accessTokenOrNull?: string | null
): Promise<ExamPackage | null> {
  const cleanQuery = (codeOrQuery || "").trim();
  if (!cleanQuery) return null;

  // 1. Check server Google Drive registry search endpoint
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

  // 2. If access token available, query Google Drive API directly
  const tokenToUse = accessTokenOrNull || getCachedAccessToken();
  if (tokenToUse) {
    try {
      const backupFolderId = await getOrCreateBackupDataSubfolder(tokenToUse);
      const q = `'${backupFolderId}' in parents and name contains '${cleanQuery}' and trashed=false and mimeType='application/json'`;
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
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Gagal menghapus naskah soal dari Google Drive.");
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
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Gagal mengunggah file backup ke Google Drive.");
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
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData?.error?.message || "Gagal memuat daftar backup dari folder SlideExam_CBT.");
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
    throw new Error("Gagal mengunduh file backup dari Google Drive.");
  }

  const json = await res.json();
  return json as AppStateBackup;
}

