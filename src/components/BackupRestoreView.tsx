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
  Check,
  LogOut,
  User as UserIcon
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
import {
  googleSignIn,
  googleSignOut,
  initAuth,
  getCachedAccessToken,
} from "../utils/googleAuth";
import { User } from "firebase/auth";

interface BackupRestoreViewProps {
  onDataRestored: () => void;
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({ onDataRestored }) => {
  // Google Drive & Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string>(() => getCachedAccessToken() || "");
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

  // Initialize Auth listener on mount
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setCurrentUser(user);
        setDriveToken(token);
      },
      () => {
        setCurrentUser(null);
        setDriveToken("");
      }
    );
    return () => unsubscribe();
  }, []);

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
      setDriveError(err?.message || "Gagal menyinkronkan dengan Google Drive. Sesi mungkin telah berakhir.");
    } finally {
      setIsLoadingFileList(false);
    }
  };

  useEffect(() => {
    if (driveToken) {
      fetchDriveBackups(driveToken);
    }
  }, [driveToken]);

  // Handle Google Sign In popup with Firebase OAuth
  const handleConnectGoogleDrive = async () => {
    setIsConnectingDrive(true);
    setDriveError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setDriveToken(result.accessToken);
        setDriveSuccessMsg(`Berhasil terhubung sebagai ${result.user.displayName || result.user.email || "Pengguna"}!`);
        await fetchDriveBackups(result.accessToken);
      }
    } catch (err: any) {
      console.error("Google Auth error:", err);
      setDriveError(err?.message || "Gagal login dengan Google. Pastikan pop-up diizinkan.");
    } finally {
      setIsConnectingDrive(false);
    }
  };

  // Upload Snapshot directly to Google Drive Folder 'SlideExam_CBT'
  const handleUploadToGoogleDrive = async () => {
    if (!driveToken) {
      await handleConnectGoogleDrive();
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

  const handleDisconnectDrive = async () => {
    await googleSignOut();
    setCurrentUser(null);
    setDriveToken("");
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
            {currentUser && driveToken ? (
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt="Avatar" className="w-5 h-5 rounded-full" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="text-xs text-slate-200 font-medium truncate max-w-[140px]">
                    {currentUser.displayName || currentUser.email}
                  </span>
                </div>
                <span className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Google Drive Terhubung</span>
                </span>
                <button
                  onClick={handleDisconnectDrive}
                  className="p-2 text-slate-400 hover:text-rose-400 bg-slate-900 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs font-semibold cursor-pointer transition-colors"
                  title="Putuskan Hubungan Akun Google"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGoogleDrive}
                disabled={isConnectingDrive}
                className="flex items-center gap-2.5 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-900 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer border border-slate-200 disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>{isConnectingDrive ? "Menghubungkan Akun..." : "Sign in with Google"}</span>
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
            <Download className="w-4 h-4" />
            <span>{isBackingUp ? "Menyiapkan File..." : "Unduh Snapshot JSON (.json)"}</span>
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Upload className="w-4 h-4 text-amber-400" />
              <span>2. Pulihkan (Restore) dari File JSON</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Unggah file cadangan JSON yang pernah diunduh sebelumnya untuk mengembalikan seluruh naskah soal dan data nilai siswa ke perangkat ini.
            </p>

            {restoreSuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{restoreSuccessMsg}</span>
              </div>
            )}

            {restoreError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{restoreError}</span>
              </div>
            )}
          </div>

          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-amber-950/40 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Pilih File Backup JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Danger Zone: Reset to Default */}
      <div className="p-5 bg-rose-950/20 border border-rose-500/20 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            <span>Zona Pengaturan Ulang Sistem</span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Menghapus cache lokal dan mengembalikan aplikasi ke naskah soal & contoh bawaan.
          </p>
        </div>

        <button
          onClick={handleResetDefaults}
          className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset ke Data Awal</span>
        </button>
      </div>
    </div>
  );
};
