import { AppStateBackup, ExamPackage } from "../types";

export const GOOGLE_DRIVE_BACKUP_FOLDER_NAME = "SlideExam_CBT";
export const GOOGLE_DRIVE_EXAMS_FOLDER_NAME = "Naskah_Soal";

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
 * Searches for or creates the 'Naskah_Soal' subfolder inside 'SlideExam_CBT'
 */
export async function getOrCreateExamsSubfolder(accessToken: string): Promise<string> {
  const rootFolderId = await getOrCreateSlideExamFolder(accessToken);
  const query = `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${GOOGLE_DRIVE_EXAMS_FOLDER_NAME}' and trashed=false`;
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
    }
  }

  // Create subfolder 'Naskah_Soal'
  const createUrl = "https://www.googleapis.com/drive/v3/files";
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_EXAMS_FOLDER_NAME,
      parents: [rootFolderId],
      mimeType: "application/vnd.google-apps.folder",
      description: "Koleksi Naskah Soal Ujian SlideExam CBT",
    }),
  });

  if (!createRes.ok) {
    return rootFolderId; // fallback to root if subfolder creation fails
  }

  const created = await createRes.json();
  return created.id;
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
 */
export async function saveExamToGoogleDrive(
  accessToken: string,
  exam: ExamPackage
): Promise<{ fileId: string; fileName: string; webViewLink?: string; downloadUrl: string }> {
  const folderId = await getOrCreateExamsSubfolder(accessToken);
  const cleanTitle = (exam.title || "Naskah_Ujian").replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_");
  const cleanCode = (exam.code || "EXAM").replace(/[^a-zA-Z0-9_\-]/g, "").toUpperCase();
  const fileName = `SOAL_${cleanCode}_${cleanTitle}.json`;

  const examToSave: ExamPackage = {
    ...exam,
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
    // Create new file
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

  // Ensure public read permission for seamless student loading
  await makeFilePubliclyReadable(accessToken, finalFileId);

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${finalFileId}?alt=media`;

  return {
    fileId: finalFileId,
    fileName,
    webViewLink,
    downloadUrl,
  };
}

/**
 * Lists all individual exam packages from Google Drive.
 */
export async function listExamsFromGoogleDrive(accessToken: string): Promise<GoogleDriveExamItem[]> {
  const rootFolderId = await getOrCreateSlideExamFolder(accessToken);
  const examsFolderId = await getOrCreateExamsSubfolder(accessToken);

  // Search in both folders to catch any previously saved files
  const query = `('${examsFolderId}' in parents or '${rootFolderId}' in parents) and name contains 'SOAL_' and trashed=false and mimeType='application/json'`;
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

  return rawFiles.map((f) => {
    // Parse name: SOAL_[CODE]_[TITLE].json
    const nameWithoutExt = f.name.replace(/\.json$/i, "").replace(/^SOAL_/i, "");
    const parts = nameWithoutExt.split("_");
    const examCode = parts[0] || "";
    const examTitle = parts.slice(1).join(" ") || nameWithoutExt;

    return {
      id: f.id,
      name: f.name,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
      size: f.size,
      webViewLink: f.webViewLink,
      examCode,
      examTitle,
    };
  });
}

/**
 * Loads an ExamPackage from Google Drive by file ID.
 */
export async function loadExamFromGoogleDrive(
  accessTokenOrNull: string | null,
  fileId: string
): Promise<ExamPackage> {
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

