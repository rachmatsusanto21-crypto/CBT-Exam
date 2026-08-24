import React, { useState, useEffect, useRef } from "react";
import {
  HardDrive,
  Download,
  Upload,
  FolderSync,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Folder,
  Database,
  Cloud,
  FileJson,
  RotateCcw,
  Key,
  FolderOpen,
  CloudUpload,
  CloudDownload,
  FileText,
  ShieldCheck,
  Check
} from "lucide-react";
import { AppStateBackup } from "../types";
import { createFullAppBackup, restoreFullAppBackup, resetToDefaultData } from "../utils/storage";
import {
  GOOGLE_DRIVE_BACKUP_FOLDER_NAME,
  GoogleDriveFileItem,
  getOrCreateSlideExamFolder,
  uploadBackupToGoogleDrive,
  listBackupsFromGoogleDrive,
  downloadBackupFromGoogleDrive,
} from "../utils/googleDrive";

interface BackupRestoreViewProps {
  onDataRestored: () => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({ onDataRestored }) => {
  // Google Drive State
  const [driveToken, setDriveToken] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("slideexam_gdrive_token") || "";
    }
    return "";
  });
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isLoadingFileList, setIsLoadingFileList] = useState(false);
  const [driveFiles, setDriveFiles] = useState<GoogleDriveFileItem[]>([]);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveSuccessMsg, setDriveSuccessMsg] = useState<string | null>(null);

  // Local JSON Backup State
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => new Date().toLocaleTimeString("id-ID"));

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Refresh Google Drive file list if token available
  const fetchDriveBackups = async (token: string) => {
    if (!token) return;
    setIsLoadingFileList(true);
    setDriveError(null);
    try {
      const folderId = await getOrCreateSlideExamFolder(token);
      setDriveFolderId(folderId);
      const files = await listBackupsFromGoogleDrive(token);
      setDriveFiles(files);
    } catch (err: any) {
      setDriveError(err?.message || "Gagal menyinkronkan dengan Google Drive. Token mungkin telah kadaluarsa.");
    } finally {
      setIsLoadingFileList(false);
    }
  };

  useEffect(() => {
    if (driveToken) {
      fetchDriveBackups(driveToken);
    }
  }, [driveToken]);

  // Handle Google Drive OAuth Connect via Google Identity Services
  const handleConnectGoogleDrive = () => {
    setIsConnectingDrive(true);
    setDriveError(null);

    try {
      if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: "143661645217-p2l3n7g3fklg4o4j1j6f9h7m9.apps.googleusercontent.com", // client id or request scope
          scope: "https://www.googleapis.com/auth/drive.file",
          callback: (response: any) => {
            setIsConnectingDrive(false);
            if (response.error) {
              setDriveError(`Otorisasi Google Drive ditolak: ${response.error}`);
              return;
            }
            if (response.access_token) {
              const token = response.access_token;
              setDriveToken(token);
              localStorage.setItem("slideexam_gdrive_token", token);
              setDriveSuccessMsg("Berhasil terhubung ke akun Google Drive Anda!");
              fetchDriveBackups(token);
            }
          },
        });
        client.requestAccessToken();
      } else {
        // Fallback prompt for token
        const inputToken = prompt(
          "Google Identity Client sedang dimuat. Anda dapat menempelkan Google OAuth Access Token di sini jika ingin menghubungkan manual:"
        );
        if (inputToken && inputToken.trim()) {
          const t = inputToken.trim();
          setDriveToken(t);
          localStorage.setItem("slideexam_gdrive_token", t);
          setDriveSuccessMsg("Token Google Drive disimpan!");
          fetchDriveBackups(t);
        }
        setIsConnectingDrive(false);
      }
    } catch (err: any) {
      setIsConnectingDrive(false);
      setDriveError(err?.message || "Gagal menginisialisasi Google Drive OAuth.");
    }
  };

  // Upload Snapshot directly to Google Drive Folder 'SlideExam_CBT'
  const handleUploadToGoogleDrive = async () => {
    if (!driveToken) {
      handleConnectGoogleDrive();
      return;
    }

    setIsSyncingDrive(true);
    setDriveError(null);
    setDriveSuccessMsg(null);

    try {
      const backupData = createFullAppBackup();
      const uploaded = await uploadBackupToGoogleDrive(driveToken, backupData);
      setDriveSuccessMsg(`File backup "${uploaded.name}" berhasil diunggah ke folder ${GOOGLE_DRIVE_BACKUP_FOLDER_NAME} di Google Drive!`);
      setLastSyncTime(new Date().toLocaleTimeString("id-ID"));
      await fetchDriveBackups(driveToken);
    } catch (err: any) {
      setDriveError(err?.message || "Gagal mengunggah backup ke Google Drive. Silakan hubungkan ulang akun Anda.");
    } finally {
      setIsSyncingDrive(false);
    }
  };

  // Restore snapshot from Google Drive file
  const handleRestoreFromDriveFile = async (file: GoogleDriveFileItem) => {
    if (!driveToken) return;
    if (confirm(`Apakah Anda yakin ingin memulihkan seluruh data aplikasi dari file backup "${file.name}"? Data saat ini akan digantikan.`)) {
      setIsSyncingDrive(true);
      setDriveError(null);
      setDriveSuccessMsg(null);

      try {
        const backupData = await downloadBackupFromGoogleDrive(driveToken, file.id);
        const success = restoreFullAppBackup(backupData);
        if (success) {
          setDriveSuccessMsg(`Seluruh data berhasil dipulihkan dari "${file.name}"!`);
          onDataRestored();
        } else {
          setDriveError("Format isi file backup Google Drive tidak sesuai standar SlideExam.");
        }
      } catch (err: any) {
        setDriveError(err?.message || "Gagal memulihkan file dari Google Drive.");
      } finally {
        setIsSyncingDrive(false);
      }
    }
  };

  // Local file download handler
  const handleDownloadBackupFile = () => {
    setIsBackingUp(true);
    try {
      const backupData = createFullAppBackup();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", `SlideExam_CBT_Backup_${timestamp}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      setBackupSuccessMsg("File backup JSON berhasil diunduh ke komputer Anda!");
      setLastSyncTime(new Date().toLocaleTimeString("id-ID"));
    } catch (e: any) {
      alert("Gagal membuat backup: " + e.message);
    } finally {
      setIsBackingUp(false);
    }
  };

  // Local file upload / restore handler
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        setRestoreError(null);
        setRestoreSuccessMsg(null);
        const content = event.target?.result as string;
        const parsed = JSON.parse(content) as AppStateBackup;

        const success = restoreFullAppBackup(parsed);
        if (success) {
          setRestoreSuccessMsg("Seluruh data naskah soal, profil sekolah, token, dan riwayat siswa berhasil dipulihkan!");
          onDataRestored();
        } else {
          setRestoreError("Format file backup tidak valid. Pastikan file berasal dari SlideExam CBT.");
        }
      } catch (err: any) {
        setRestoreError("Gagal membaca file JSON: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleResetDefaults = () => {
    if (confirm("Reset seluruh data aplikasi ke konfigurasi dan contoh soal awal?")) {
      resetToDefaultData();
      onDataRestored();
      alert("Aplikasi berhasil direset ke data awal!");
    }
  };

  const handleDisconnectDrive = () => {
    setDriveToken("");
    localStorage.removeItem("slideexam_gdrive_token");
    setDriveFiles([]);
    setDriveFolderId(null);
    setDriveSuccessMsg("Koneksi Google Drive berhasil diputuskan.");
  };

  return (
    <div id="backup-restore-view" className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-medium text-xs">
            <Cloud className="w-4 h-4" />
            <span>Manajemen Penyimpanan & Sinkronisasi Cloud</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">Backup & Restore Google Drive</h2>
          <p className="text-xs text-slate-400 mt-1">
            Simpan otomatis seluruh bank naskah soal, rekap penilaian siswa, dan token ke folder khusus Google Drive.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleUploadToGoogleDrive}
            disabled={isSyncingDrive}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-emerald-950 cursor-pointer disabled:opacity-50"
          >
            <CloudUpload className="w-4 h-4" />
            <span>{isSyncingDrive ? "Menyimpan ke Drive..." : "Backup ke Google Drive"}</span>
          </button>

          <button
            onClick={handleDownloadBackupFile}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-indigo-950 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Unduh File JSON</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {driveSuccessMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{driveSuccessMsg}</span>
          </div>
          <button onClick={() => setDriveSuccessMsg(null)} className="text-emerald-400 hover:text-white text-xs font-bold">✕</button>
        </div>
      )}

      {driveError && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-xs flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{driveError}</span>
          </div>
          <button onClick={() => setDriveError(null)} className="text-rose-400 hover:text-white text-xs font-bold">✕</button>
        </div>
      )}

      {/* Google Drive Dedicated Folder Indicator */}
      <div className="bg-[#121214] border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Folder Utama Sinkronisasi Google Drive
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-mono tracking-wide text-white">
                {GOOGLE_DRIVE_BACKUP_FOLDER_NAME}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {driveToken ? (
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Google Drive Terhubung</span>
                </span>
                <button
                  onClick={handleDisconnectDrive}
                  className="px-2.5 py-1 text-slate-400 hover:text-rose-400 text-xs font-semibold cursor-pointer"
                  title="Putuskan Hubungan Google Drive"
                >
                  Putuskan
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGoogleDrive}
                disabled={isConnectingDrive}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Cloud className="w-4 h-4" />
                <span>{isConnectingDrive ? "Menghubungkan..." : "Hubungkan Google Drive"}</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
          Aplikasi hanya menyimpan data cadangan ke folder khusus bernama <strong className="text-indigo-300 font-mono">{GOOGLE_DRIVE_BACKUP_FOLDER_NAME}</strong> di Google Drive Anda. Aplikasi tidak akan membuat folder lain untuk menjaga kerapian penyimpanan Drive Anda.
        </p>

        {/* Cloud Backups File List */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-indigo-400" />
              <span>Daftar File Backup di Folder Google Drive ({driveFiles.length} File)</span>
            </div>

            {driveToken && (
              <button
                onClick={() => fetchDriveBackups(driveToken)}
                disabled={isLoadingFileList}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFileList ? "animate-spin" : ""}`} />
                <span>Segarkan</span>
              </button>
            )}
          </div>

          {isLoadingFileList ? (
            <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
              <span>Memuat file backup dari folder Google Drive...</span>
            </div>
          ) : driveFiles.length === 0 ? (
            <div className="p-5 rounded-2xl bg-[#161618] border border-slate-800 text-center text-xs text-slate-400">
              {driveToken
                ? "Belum ada file backup di folder SlideExam_CBT. Klik 'Backup ke Google Drive' untuk mengunggah cadangan pertama."
                : "Hubungkan akun Google Drive untuk melihat dan memulihkan arsip data dari cloud."}
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {driveFiles.map((f) => (
                <div
                  key={f.id}
                  className="p-3.5 bg-[#161618] border border-slate-800 rounded-xl flex items-center justify-between gap-3 text-xs hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg">
                      <FileJson className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-white font-mono text-xs">{f.name}</div>
                      <div className="text-[11px] text-slate-400">
                        Dibuat: {f.createdTime ? new Date(f.createdTime).toLocaleString("id-ID") : "-"}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRestoreFromDriveFile(f)}
                    disabled={isSyncingDrive}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border border-emerald-500/30 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CloudDownload className="w-3.5 h-3.5" />
                    <span>Pulihkan dari File Ini</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Action Grid: Local Backup vs Restore */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Card */}
        <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>1. Ekspor Snapshot JSON Offline</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Membuat snapshot lengkap berisi seluruh paket soal ujian, profil sekolah, logo, kunci jawaban, dan histori nilai seluruh siswa dalam file JSON terenkripsi standar.
            </p>

            {backupSuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{backupSuccessMsg}</span>
              </div>
            )}
          </div>

          <button
            onClick={handleDownloadBackupFile}
            disabled={isBackingUp}
            className="w-full py-3 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl font-semibold text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4 text-indigo-400" />
            <span>{isBackingUp ? "Mengekspor Data..." : "Unduh File Backup (.json)"}</span>
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>2. Pulihkan dari File JSON Lokal</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Unggah file cadangan <code className="bg-[#1a1a1c] px-1.5 py-0.5 rounded text-indigo-300 font-mono">.json</code> yang telah diunduh sebelumnya untuk mengembalikan seluruh naskah soal dan hasil pengerjaan siswa.
            </p>

            {restoreError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{restoreError}</span>
              </div>
            )}

            {restoreSuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{restoreSuccessMsg}</span>
              </div>
            )}
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold text-xs shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Pilih File Backup JSON untuk Dipulihkan</span>
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone: Reset Data */}
      <div className="bg-rose-500/5 rounded-2xl p-5 border border-rose-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
            <RotateCcw className="w-4 h-4 text-rose-400" />
            <span>Reset Konfigurasi Aplikasi</span>
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Kembalikan naskah soal, profil sekolah, dan token ke data percontohan bawaan sistem.
          </p>
        </div>

        <button
          onClick={handleResetDefaults}
          className="px-4 py-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
        >
          Reset ke Data Bawaan
        </button>
      </div>
    </div>
  );
};
