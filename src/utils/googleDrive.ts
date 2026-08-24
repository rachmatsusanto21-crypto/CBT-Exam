import { AppStateBackup } from "../types";

export const GOOGLE_DRIVE_BACKUP_FOLDER_NAME = "SlideExam_CBT";

export interface GoogleDriveFileItem {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
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
  const query = `'${folderId}' in parents and trashed=false and mimeType='application/json'`;
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
