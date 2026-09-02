import React, { useState, useEffect } from "react";
import {
  X,
  Cloud,
  CloudUpload,
  CloudDownload,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  ExternalLink,
  BookOpen,
  GraduationCap,
  Sparkles,
  Key,
  ShieldCheck,
  Check,
  Copy,
  LogOut,
  User as UserIcon,
  HardDrive
} from "lucide-react";
import { ExamPackage, StudentTokenItem } from "../types";
import {
  GoogleDriveExamItem,
  listExamsFromGoogleDrive,
  saveExamToGoogleDrive,
  loadExamFromGoogleDrive,
  deleteExamFromGoogleDrive,
  getOrCreateExamsSubfolder,
} from "../utils/googleDrive";
import {
  googleSignIn,
  googleSignOut,
  initAuth,
  getCachedAccessToken,
  getFirebaseConfigData,
  requestGoogleTokenViaGIS,
} from "../utils/googleAuth";
import { User } from "firebase/auth";

interface GoogleDriveExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeExam: ExamPackage;
  onUpdateExam: (updated: ExamPackage) => void;
  onSelectExam?: (exam: ExamPackage) => void;
  tokens?: StudentTokenItem[];
}

export const GoogleDriveExamModal: React.FC<GoogleDriveExamModalProps> = ({
  isOpen,
  onClose,
  activeExam,
  onUpdateExam,
  onSelectExam,
  tokens = [],
}) => {
  const [currentUser, setCurrentUser] = useState<User | any | null>(null);
  const [driveToken, setDriveToken] = useState<string>(() => getCachedAccessToken() || "");
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [driveExams, setDriveExams] = useState<GoogleDriveExamItem[]>([]);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Auth state listener
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

  // Fetch Drive Exam List
  const fetchDriveExams = async (token: string) => {
    if (!token) return;
    setIsLoadingList(true);
    try {
      const list = await listExamsFromGoogleDrive(token);
      setDriveExams(list);
    } catch (err: any) {
      console.warn("Drive exams fetch error:", err);
      setStatusMsg({
        type: "error",
        text: err?.message || "Gagal memuat naskah soal dari Google Drive.",
      });
    } finally {
      setIsLoadingList(false);
    }
  };

  useEffect(() => {
    if (isOpen && driveToken) {
      fetchDriveExams(driveToken);
    }
  }, [isOpen, driveToken]);

  if (!isOpen) return null;

  // Handle Google Drive Connection
  const handleConnect = async () => {
    setIsConnecting(true);
    setStatusMsg(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setCurrentUser(res.user);
        setDriveToken(res.accessToken);
        setStatusMsg({
          type: "success",
          text: `Berhasil terhubung ke Google Drive sebagai ${res.user.displayName || res.user.email || "Pengguna"}!`,
        });
        await fetchDriveExams(res.accessToken);
      }
    } catch (err: any) {
      // Fallback GIS if unauthorized domain error
      const isUnauth =
        err?.code === "auth/unauthorized-domain" ||
        err?.message?.includes("unauthorized-domain");

      if (isUnauth) {
        const config = getFirebaseConfigData();
        if (config.oAuthClientId) {
          try {
            const gisRes = await requestGoogleTokenViaGIS(config.oAuthClientId);
            if (gisRes) {
              setCurrentUser(gisRes.user);
              setDriveToken(gisRes.accessToken);
              setStatusMsg({
                type: "success",
                text: `Berhasil terhubung via Google Identity Services sebagai ${gisRes.user.displayName || "Pengguna"}!`,
              });
              await fetchDriveExams(gisRes.accessToken);
              return;
            }
          } catch (gisErr: any) {
            setStatusMsg({
              type: "error",
              text: gisErr.message || "Gagal otentikasi Google Drive via GIS.",
            });
            return;
          }
        }
      }

      setStatusMsg({
        type: "error",
        text: err?.message || "Gagal menghubungkan akun Google. Pastikan jendela pop-up diizinkan.",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await googleSignOut();
      setCurrentUser(null);
      setDriveToken("");
      setDriveExams([]);
      setStatusMsg({ type: "info", text: "Akun Google Drive berhasil diputuskan." });
    } catch (e: any) {
      console.warn("Signout error", e);
    }
  };

  // Save current active exam to Google Drive
  const handleSaveActiveExam = async () => {
    if (!driveToken) {
      await handleConnect();
      return;
    }

    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await saveExamToGoogleDrive(driveToken, activeExam);
      const updatedExam: ExamPackage = {
        ...activeExam,
        gdriveFileId: res.fileId,
        gdriveWebViewLink: res.webViewLink,
        gdriveDownloadLink: res.downloadUrl,
        gdriveSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onUpdateExam(updatedExam);
      setStatusMsg({
        type: "success",
        text: `Naskah Soal "${activeExam.title}" (${activeExam.questions.length} butir) berhasil disimpan di folder SlideExam_CBT/Naskah_Soal di Google Drive!`,
      });
      await fetchDriveExams(driveToken);
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || "Gagal menyimpan naskah ke Google Drive.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Load Exam from Google Drive into current session
  const handleLoadExam = async (item: GoogleDriveExamItem) => {
    if (!confirm(`Muat naskah soal "${item.name}" dari Google Drive ke editor dan sesi CBT saat ini?`)) {
      return;
    }

    setLoadingFileId(item.id);
    setStatusMsg(null);
    try {
      const loadedExam = await loadExamFromGoogleDrive(driveToken, item.id);
      onUpdateExam(loadedExam);
      if (onSelectExam) {
        onSelectExam(loadedExam);
      }
      setStatusMsg({
        type: "success",
        text: `Naskah Soal "${loadedExam.title}" (${loadedExam.questions.length} butir) berhasil dimuat dari Google Drive!`,
      });
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || "Gagal memuat naskah soal dari Google Drive.",
      });
    } finally {
      setLoadingFileId(null);
    }
  };

  // Delete Exam from Google Drive
  const handleDeleteExam = async (item: GoogleDriveExamItem) => {
    if (!confirm(`Hapus file naskah "${item.name}" secara permanen dari Google Drive?`)) {
      return;
    }

    setDeletingFileId(item.id);
    try {
      await deleteExamFromGoogleDrive(driveToken, item.id);
      setStatusMsg({
        type: "info",
        text: `File "${item.name}" berhasil dihapus dari Google Drive.`,
      });
      setDriveExams((prev) => prev.filter((ex) => ex.id !== item.id));
    } catch (err: any) {
      setStatusMsg({
        type: "error",
        text: err?.message || "Gagal menghapus file dari Google Drive.",
      });
    } finally {
      setDeletingFileId(null);
    }
  };

  const handleCopyLink = (item: GoogleDriveExamItem) => {
    const link = item.webViewLink || `https://drive.google.com/file/d/${item.id}/view`;
    navigator.clipboard.writeText(link);
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#121214] border border-slate-800 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-[#16161a]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-md">
              <Cloud className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Penyimpanan Google Drive CBT</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  Cloud Workspace
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Simpan, muat, dan bagikan naskah soal langsung melalui Google Drive guru
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-300 text-sm">
          {/* Status Message */}
          {statusMsg && (
            <div
              className={`p-4 rounded-2xl border flex items-start gap-3 animate-in fade-in ${
                statusMsg.type === "success"
                  ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200"
                  : statusMsg.type === "error"
                  ? "bg-rose-950/40 border-rose-500/30 text-rose-200"
                  : "bg-indigo-950/40 border-indigo-500/30 text-indigo-200"
              }`}
            >
              {statusMsg.type === "success" && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
              {statusMsg.type === "error" && <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
              {statusMsg.type === "info" && <ShieldCheck className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />}
              <div className="flex-1 text-xs leading-relaxed font-medium">{statusMsg.text}</div>
            </div>
          )}

          {/* Account Connection Card */}
          <div className="p-4 bg-[#18181c] border border-slate-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || "Google User"}
                    className="w-10 h-10 rounded-xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <UserIcon className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div>
                <div className="font-bold text-white text-sm">
                  {currentUser ? currentUser.displayName || currentUser.email || "Akun Google Terhubung" : "Google Drive Belum Terhubung"}
                </div>
                <div className="text-xs text-slate-400">
                  {currentUser
                    ? currentUser.email || "Siap menyimpan & memuat naskah soal"
                    : "Hubungkan akun Google/belajar.id untuk sinkronisasi otomatis"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentUser ? (
                <>
                  <button
                    onClick={() => fetchDriveExams(driveToken)}
                    disabled={isLoadingList}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Segarkan daftar soal dari Google Drive"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingList ? "animate-spin text-indigo-400" : ""}`} />
                    <span>Segarkan</span>
                  </button>
                  <button
                    onClick={handleDisconnect}
                    className="px-3 py-2 bg-slate-800 hover:bg-rose-950/40 text-rose-400 border border-slate-700 hover:border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-950 cursor-pointer"
                >
                  <Cloud className="w-4 h-4" />
                  <span>{isConnecting ? "Menghubungkan..." : "Hubungkan Google Drive"}</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Exam Quick Save Section */}
          <div className="p-5 bg-gradient-to-r from-indigo-950/30 via-purple-950/20 to-slate-900/40 border border-indigo-500/30 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
                  Naskah Soal yang Sedang Aktif
                </span>
                <h3 className="text-base font-bold text-white mt-1">{activeExam.title}</h3>
                <p className="text-xs text-slate-400">
                  {activeExam.teacherProfile.subject} • Kode: <strong className="font-mono text-emerald-400">{activeExam.code}</strong> • {activeExam.questions.length} Butir Soal ({activeExam.totalScore} Poin)
                </p>
              </div>

              <button
                onClick={handleSaveActiveExam}
                disabled={isSaving}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950 cursor-pointer shrink-0"
              >
                <CloudUpload className={`w-4 h-4 ${isSaving ? "animate-bounce" : ""}`} />
                <span>{isSaving ? "Menyimpan ke Drive..." : activeExam.gdriveFileId ? "Perbarui di Drive" : "Simpan ke Google Drive"}</span>
              </button>
            </div>

            {activeExam.gdriveSyncedAt && (
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                <Check className="w-3.5 h-3.5" />
                <span>Tersimpan di Google Drive • Terakhir disinkronkan: {new Date(activeExam.gdriveSyncedAt).toLocaleString("id-ID")}</span>
                {activeExam.gdriveWebViewLink && (
                  <a
                    href={activeExam.gdriveWebViewLink}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold underline text-[11px]"
                  >
                    <span>Buka File</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Stored Google Drive Exams List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>Daftar Naskah Soal di Google Drive ({driveExams.length})</span>
              </h3>
              <span className="text-[11px] text-slate-400">
                Folder: <code className="text-indigo-300 bg-slate-800 px-1.5 py-0.5 rounded font-mono">SlideExam_CBT/Naskah_Soal</code>
              </span>
            </div>

            {isLoadingList ? (
              <div className="p-8 text-center bg-[#16161a] rounded-2xl border border-slate-800 space-y-2">
                <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin mx-auto" />
                <p className="text-xs text-slate-400">Memuat daftar naskah soal dari Google Drive...</p>
              </div>
            ) : !currentUser ? (
              <div className="p-8 text-center bg-[#16161a] rounded-2xl border border-slate-800 space-y-3">
                <Cloud className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Hubungkan akun Google Drive Anda di atas untuk melihat naskah soal yang tersimpan di cloud.
                </p>
                <button
                  onClick={handleConnect}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer shadow-md"
                >
                  <Cloud className="w-4 h-4" />
                  <span>Hubungkan Sekarang</span>
                </button>
              </div>
            ) : driveExams.length === 0 ? (
              <div className="p-8 text-center bg-[#16161a] rounded-2xl border border-slate-800 space-y-2">
                <FolderOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs text-slate-400">
                  Belum ada naskah soal yang tersimpan di folder Google Drive Anda.
                </p>
                <p className="text-[11px] text-indigo-400">
                  Klik tombol <strong>"Simpan ke Google Drive"</strong> di atas untuk mengunggah naskah aktif pertama Anda.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {driveExams.map((item) => {
                  const isCurrentActive = activeExam.gdriveFileId === item.id || activeExam.code === item.examCode;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrentActive
                          ? "bg-indigo-950/20 border-indigo-500/40 shadow-sm shadow-indigo-950/50"
                          : "bg-[#18181c] hover:bg-[#1e1e24] border-slate-800"
                      }`}
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-xs truncate">
                            {item.examTitle || item.name}
                          </span>
                          {item.examCode && (
                            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-bold">
                              {item.examCode}
                            </span>
                          )}
                          {isCurrentActive && (
                            <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-extrabold border border-indigo-500/30">
                              SEDANG DIBUKA
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                          <span>Diperbarui: {new Date(item.modifiedTime).toLocaleString("id-ID")}</span>
                          {item.size && <span>• {(Number(item.size) / 1024).toFixed(1)} KB</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        {/* Load Button */}
                        <button
                          onClick={() => handleLoadExam(item)}
                          disabled={loadingFileId === item.id}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          title="Muat naskah soal ini ke aplikasi CBT"
                        >
                          <CloudDownload className={`w-3.5 h-3.5 ${loadingFileId === item.id ? "animate-spin" : ""}`} />
                          <span>{loadingFileId === item.id ? "Memuat..." : "Muat Soal"}</span>
                        </button>

                        {/* Copy Link */}
                        <button
                          onClick={() => handleCopyLink(item)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer"
                          title="Salin Tautan Google Drive"
                        >
                          {copiedId === item.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        {/* View in Drive */}
                        {item.webViewLink && (
                          <a
                            href={item.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all cursor-pointer inline-flex"
                            title="Buka File di Google Drive"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {/* Delete */}
                        <button
                          onClick={() => handleDeleteExam(item)}
                          disabled={deletingFileId === item.id}
                          className="p-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                          title="Hapus dari Google Drive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-[#16161a] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
            <span>Naskah soal otomatis diatur dengan izin publik untuk akses cepat perangkat siswa saat ujian.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
