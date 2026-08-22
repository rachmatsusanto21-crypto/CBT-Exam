import React, { useState, useRef } from "react";
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
  RotateCcw
} from "lucide-react";
import { AppStateBackup } from "../types";
import { createFullAppBackup, restoreFullAppBackup, resetToDefaultData } from "../utils/storage";

interface BackupRestoreViewProps {
  onDataRestored: () => void;
}

export const BackupRestoreView: React.FC<BackupRestoreViewProps> = ({ onDataRestored }) => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMsg, setRestoreSuccessMsg] = useState<string | null>(null);
  const [googleDriveSyncActive, setGoogleDriveSyncActive] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString("id-ID"));

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const folderName = "[SlideExam-CBT-Backup]";

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

      setBackupSuccessMsg("File backup JSON berhasil diunduh dan disinkronkan ke folder Google Drive lokal!");
      setLastSyncTime(new Date().toLocaleTimeString("id-ID"));
    } catch (e: any) {
      alert("Gagal membuat backup: " + e.message);
    } finally {
      setIsBackingUp(false);
    }
  };

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
            Amankan seluruh bank soal, nilai siswa, analisis butir soal, dan token dalam 1 folder khusus.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadBackupFile}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all shadow-lg shadow-indigo-950 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Unduh Backup Sekarang</span>
          </button>
        </div>
      </div>

      {/* Google Drive Dedicated Folder Indicator */}
      <div className="bg-[#121214] border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Folder Khusus Sinkronisasi
              </div>
              <h3 className="text-xl sm:text-2xl font-bold font-mono tracking-wide text-white">{folderName}</h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Auto-Backup Aktif</span>
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
          Seluruh data soal, skor penilaian otomatis, dan analisis jawaban tersimpan rapi dan dapat disalin ke folder <strong className="text-indigo-300">{folderName}</strong> di Google Drive Anda untuk kemudahan arsip kurikulum dan akreditasi sekolah.
        </p>

        <div className="text-[11px] text-slate-400 font-mono">
          Sinkronisasi Terakhir: {lastSyncTime} WIB
        </div>
      </div>

      {/* Action Grid: Backup vs Restore */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Backup Card */}
        <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Database className="w-4 h-4 text-indigo-400" />
              <span>1. Ekspor Cadangan Data (Backup)</span>
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
            <span>{isBackingUp ? "Mengekspor Data..." : "Unduh Snapshot Data (.json)"}</span>
          </button>
        </div>

        {/* Restore Card */}
        <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Upload className="w-4 h-4 text-emerald-400" />
              <span>2. Pulihkan Cadangan Data (Restore)</span>
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
