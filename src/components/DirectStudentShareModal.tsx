import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  X,
  Copy,
  Check,
  QrCode,
  Share2,
  ExternalLink,
  Smartphone,
  Globe,
  Sparkles,
  KeyRound,
  MessageSquare,
  Download,
  Maximize2,
  Zap,
  Info,
  Cloud,
  CloudUpload,
  RefreshCw,
  FolderOpen
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ExamPackage, StudentTokenItem } from "../types";
import {
  generateShortStudentUrl,
  generateDriveStudentUrl
} from "../utils/examShareEncoder";
import { getStudentTokens, saveExamPackages, getExamPackages } from "../utils/storage";
import { deduplicateStudentTokens } from "../utils/tokenValidator";
import { syncExamToFirestore } from "../utils/firestoreService";
import { saveExamToGoogleDrive, formatExamDriveFileName } from "../utils/googleDrive";
import {
  getCachedAccessToken,
  googleSignIn,
  isAuthExpiredError,
  formatGoogleAuthErrorMessage,
  clearAuthSession,
} from "../utils/googleAuth";

interface DirectStudentShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPackage;
  token?: string;
  tokens?: StudentTokenItem[];
  allExams?: ExamPackage[];
  onSelectExam?: (exam: ExamPackage) => void;
}

export const DirectStudentShareModal: React.FC<DirectStudentShareModalProps> = ({
  isOpen,
  onClose,
  exam,
  token,
  tokens,
  allExams = [],
  onSelectExam,
}) => {
  const [selectedExamId, setSelectedExamId] = useState<string>(exam.id);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [includeTokenInLink, setIncludeTokenInLink] = useState(true);
  const [linkMode, setLinkMode] = useState<"student" | "gdrive_alternative">("student");
  const [showEnlargedQr, setShowEnlargedQr] = useState(false);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [driveUploadError, setDriveUploadError] = useState<string | null>(null);
  const [driveUploadSuccess, setDriveUploadSuccess] = useState<string | null>(null);
  const qrRef = useRef<SVGSVGElement | null>(null);

  const [cloudSynced, setCloudSynced] = useState(false);

  // Sync selectedExamId when exam prop changes
  useEffect(() => {
    if (exam && exam.id) {
      setSelectedExamId(exam.id);
    }
  }, [exam.id]);

  const currentExam = useMemo(() => {
    if (allExams && allExams.length > 0) {
      const found = allExams.find((e) => e.id === selectedExamId);
      if (found) return found;
    }
    return exam;
  }, [allExams, selectedExamId, exam]);

  const currentToken = useMemo(() => {
    return currentExam.sessionToken || token || "TOKEN1";
  }, [currentExam.sessionToken, token]);

  const availableTokens = useMemo(() => {
    let list: StudentTokenItem[] = [];
    if (currentExam.tokens && currentExam.tokens.length > 0) {
      list = currentExam.tokens;
    } else if (tokens && tokens.length > 0) {
      list = tokens;
    } else {
      list = getStudentTokens();
    }
    return deduplicateStudentTokens(list, currentExam.code, currentExam.teacherProfile?.gradeLevel);
  }, [tokens, currentExam.tokens, currentExam.code, currentExam.teacherProfile?.gradeLevel]);

  // When modal is opened or exam is switched, auto-sync package to Firestore, backend server, and register Drive entry
  useEffect(() => {
    if (isOpen && currentExam && currentExam.id) {
      // 1. Sync to Firestore
      syncExamToFirestore(currentExam, availableTokens)
        .then(() => setCloudSynced(true))
        .catch((err) => console.warn("Firestore sync error on share modal:", err));

      // 2. Sync to Express backend
      fetch("/api/exams/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exam: currentExam,
          token: currentToken,
          tokens: availableTokens,
        }),
      }).catch((err) => console.warn("Express backend sync error on share modal:", err));

      // 3. Register Drive file mapping with backend if available
      const activeToken = getCachedAccessToken();
      fetch("/api/gdrive/register-exam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: currentExam.code,
          fileId: currentExam.gdriveFileId || "",
          fileName: currentExam.gdriveFileName || formatExamDriveFileName(currentExam),
          webViewLink: currentExam.gdriveWebViewLink || "",
          downloadUrl: currentExam.gdriveDownloadLink || "",
          exam: currentExam,
          accessToken: activeToken || undefined,
        }),
      }).catch((err) => console.warn("Express gdrive registration error:", err));
    }
  }, [isOpen, currentExam.id, currentExam.code, currentExam.updatedAt, currentToken]);

  if (!isOpen) return null;

  const currentUrl = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const baseUrl = currentUrl.endsWith("/") ? currentUrl.slice(0, -1) : currentUrl;

  // 1. Primary Student Link (Direct CBT exam URL with code and driveId)
  const studentLinkWithToken = generateDriveStudentUrl(baseUrl, currentExam, currentToken);
  const studentLinkWithoutToken = generateDriveStudentUrl(baseUrl, currentExam, undefined);
  const studentActiveLink = includeTokenInLink && currentToken ? studentLinkWithToken : studentLinkWithoutToken;

  // 2. Alternative Direct Google Drive File Link
  const driveFileDirectUrl =
    currentExam.gdriveWebViewLink ||
    (currentExam.gdriveFileId
      ? `https://drive.google.com/file/d/${currentExam.gdriveFileId}/view?usp=sharing`
      : "");

  // Link selected in the input box
  const activeSelectedLink =
    linkMode === "gdrive_alternative"
      ? driveFileDirectUrl || studentActiveLink
      : studentActiveLink;

  // QR Code encodes the primary student URL for fast smartphone scanning
  const qrCodeTargetUrl = studentActiveLink;

  // Handle uploading current exam to Google Drive
  const handleUploadCurrentExamToDrive = async () => {
    setIsUploadingToDrive(true);
    setDriveUploadError(null);
    setDriveUploadSuccess(null);
    try {
      let tokenToUse = getCachedAccessToken();
      if (!tokenToUse) {
        const signinRes = await googleSignIn();
        if (signinRes?.accessToken) {
          tokenToUse = signinRes.accessToken;
        }
      }
      if (!tokenToUse) {
        throw new Error("Izin otentikasi Google Drive diperlukan untuk mengunggah naskah soal.");
      }

      let res;
      try {
        res = await saveExamToGoogleDrive(tokenToUse, currentExam);
      } catch (uploadErr: any) {
        if (isAuthExpiredError(uploadErr)) {
          clearAuthSession();
          const reauthRes = await googleSignIn();
          if (reauthRes?.accessToken) {
            tokenToUse = reauthRes.accessToken;
            res = await saveExamToGoogleDrive(tokenToUse, currentExam);
          } else {
            throw uploadErr;
          }
        } else {
          throw uploadErr;
        }
      }

      const updatedExam: ExamPackage = {
        ...currentExam,
        gdriveFileId: res.fileId,
        gdriveFileName: res.fileName,
        gdriveWebViewLink: res.webViewLink,
        gdriveDownloadLink: res.downloadUrl,
        gdriveSyncedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Persist in local storage
      const all = getExamPackages();
      const idx = all.findIndex((e) => e.id === updatedExam.id);
      let updatedAll: ExamPackage[];
      if (idx >= 0) {
        updatedAll = [...all];
        updatedAll[idx] = updatedExam;
      } else {
        updatedAll = [updatedExam, ...all];
      }
      saveExamPackages(updatedAll);

      // Notify parent
      if (onSelectExam) {
        onSelectExam(updatedExam);
      }

      setDriveUploadSuccess(`✓ Naskah berhasil disimpan di Google Drive (Backup_Data_Aplikasi) dengan nama: ${res.fileName}`);
      setTimeout(() => setDriveUploadSuccess(null), 5000);
    } catch (err: any) {
      console.warn("Upload to Drive error:", err);
      setDriveUploadError(formatGoogleAuthErrorMessage(err) || "Gagal mengunggah naskah soal ke Google Drive.");
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  const handleCopyLink = (textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Structured message for WhatsApp sharing
  const shareMessageText =
    `📋 *LINK UJIAN CBT SISWA - ${currentExam.title.toUpperCase()}*\n\n` +
    `👤 Mata Pelajaran: *${currentExam.teacherProfile?.subject || "Umum"}* (${currentExam.teacherProfile?.gradeLevel || "Umum"})\n` +
    `⏱️ Durasi: *${currentExam.durationMinutes || 60} Menit* (${currentExam.questions?.length || 0} Butir Soal)\n` +
    `📁 Kode Soal: *${currentExam.code}*` +
    (currentExam.gdriveFileName ? `\n📄 File Drive: *${currentExam.gdriveFileName}*` : "") +
    (includeTokenInLink && currentToken ? `\n🔑 Token Masuk: *${currentToken}*` : "") +
    `\n\n👉 *Link Ujian Siswa (Klik untuk Mulai):*\n${studentActiveLink}\n` +
    (driveFileDirectUrl
      ? `\n🔗 *Link Google Drive Alternatif (Jika Soal Belum Muncul):*\n${driveFileDirectUrl}\n`
      : "\n") +
    `\n_Petunjuk: Buka link ujian di HP atau laptop siswa, pilih nama, masukkan token jika diminta, lalu kerjakan dengan teliti._`;

  const handleCopyWhatsAppTemplate = () => {
    navigator.clipboard.writeText(shareMessageText);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(shareMessageText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const handleDownloadQrSvg = () => {
    const svgEl = qrRef.current;
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `QR-Ujian-${currentExam.code || "CBT"}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSwitchExam = (newId: string) => {
    setSelectedExamId(newId);
    if (onSelectExam && allExams) {
      const found = allExams.find((e) => e.id === newId);
      if (found) onSelectExam(found);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="direct-student-share-modal"
        className="bg-[#121214] border border-indigo-500/40 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl shadow-indigo-950/60 flex flex-col max-h-[92vh]"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-950/50 via-[#121214] to-purple-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Bagikan Ujian ke Siswa</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  Mode Siswa
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pilih link ujian atau tautan alternatif Google Drive untuk siswa.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Exam Selector Dropdown */}
          {allExams && allExams.length > 1 && (
            <div className="p-3 bg-[#18181b] border border-slate-800 rounded-2xl space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Pilih Naskah Soal yang Dibagikan:</span>
                <span className="text-[11px] text-indigo-400 font-mono">
                  {allExams.length} Naskah Tersedia
                </span>
              </label>
              <select
                value={selectedExamId}
                onChange={(e) => handleSwitchExam(e.target.value)}
                className="w-full bg-[#121214] border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                {allExams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title} — Kode: {ex.code} ({ex.questions?.length || 0} Soal)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Exam Summary Banner */}
          <div className="p-3.5 bg-gradient-to-r from-indigo-950/40 via-[#18181b] to-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between flex-wrap gap-2">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>{currentExam.title}</span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-bold">
                  {currentExam.code}
                </span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-3">
                <span>{currentExam.teacherProfile?.subject || "Umum"}</span>
                <span>•</span>
                <span>{currentExam.questions?.length || 0} Butir Soal</span>
                <span>•</span>
                <span>{currentExam.durationMinutes || 60} Menit</span>
              </div>
            </div>

            {/* Token Badge */}
            {currentToken && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Token: </span>
                <strong className="font-mono text-sm tracking-wider">{currentToken}</strong>
              </div>
            )}
          </div>

          {/* Mode Switcher Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span>Tipe Tautan yang Dibagikan:</span>
              </span>

              {token && (
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeTokenInLink}
                    onChange={(e) => setIncludeTokenInLink(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Sertakan Token Otomatis</span>
                </label>
              )}
            </div>

            {/* 2-Option Tabs: Student CBT Link vs Alternative Google Drive Link */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#161618] rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setLinkMode("student")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  linkMode === "student"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span className="truncate">Link Ujian Siswa (Utama)</span>
              </button>

              <button
                type="button"
                onClick={() => setLinkMode("gdrive_alternative")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  linkMode === "gdrive_alternative"
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Cloud className="w-3.5 h-3.5 shrink-0 text-cyan-300" />
                <span className="truncate">Link Google Drive (Alternatif)</span>
              </button>
            </div>

            {/* Content for Link Ujian Siswa (Utama) */}
            {linkMode === "student" && (
              <div className="p-3 bg-indigo-950/20 border border-indigo-500/20 rounded-xl space-y-2 text-xs">
                <p className="text-[11px] text-indigo-200 leading-relaxed">
                  Bagikan link ini kepada siswa. Siswa dapat langsung membuka di tab baru HP atau laptop dan mengerjakan ujian CBT secara otomatis dengan kode soal{" "}
                  <strong className="text-white font-mono">{currentExam.code}</strong>.
                </p>
                {currentExam.gdriveFileId && (
                  <p className="text-[11px] text-cyan-300 flex items-center gap-1">
                    <Cloud className="w-3 h-3 text-cyan-400 shrink-0" />
                    <span>Naskah tersambung dengan Google Drive (ID: {currentExam.gdriveFileId.slice(0, 8)}...).</span>
                  </p>
                )}
              </div>
            )}

            {/* Content for Link Google Drive (Alternatif) */}
            {linkMode === "gdrive_alternative" && (
              <div className="p-3 bg-cyan-950/30 border border-cyan-500/30 rounded-xl space-y-2.5 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 font-bold text-cyan-300">
                    <Cloud className="w-4 h-4 text-cyan-400" />
                    <span>Fitur Link Google Drive Alternatif</span>
                  </div>
                  {currentExam.gdriveFileId ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Tersimpan di Drive</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                      Belum Diunggah ke Drive
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-300 space-y-1">
                  <div>
                    <span className="text-slate-400">Nama File di Drive: </span>
                    <span className="font-mono text-cyan-200 font-semibold">
                      {currentExam.gdriveFileName || formatExamDriveFileName(currentExam)}
                    </span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    Bagikan tautan Google Drive ini kepada siswa sebagai <strong>alternatif cadangan</strong> jika aplikasi siswa tidak dapat menemukan naskah soal secara otomatis. Siswa dapat menempelkan link Google Drive ini di layar ujian atau mengunduh file naskah soal (.json).
                  </p>
                </div>

                {driveUploadSuccess && (
                  <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-[11px]">
                    {driveUploadSuccess}
                  </div>
                )}

                {driveUploadError && (
                  <div className="p-2 rounded-lg bg-red-950/60 border border-red-500/40 text-red-300 text-[11px]">
                    {driveUploadError}
                  </div>
                )}

                <div className="pt-1 flex items-center flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={isUploadingToDrive}
                    onClick={handleUploadCurrentExamToDrive}
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-all shadow-sm shadow-cyan-950"
                  >
                    {isUploadingToDrive ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengunggah ke Drive...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-3.5 h-3.5" />
                        <span>{currentExam.gdriveFileId ? "Perbarui File di Drive" : "Unggah Naskah ke Google Drive Sekarang"}</span>
                      </>
                    )}
                  </button>

                  {driveFileDirectUrl && (
                    <a
                      href={driveFileDirectUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 font-semibold text-[11px] flex items-center gap-1 border border-slate-700"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka File di Drive</span>
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Direct Link Input Box */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={activeSelectedLink}
                placeholder={linkMode === "gdrive_alternative" && !driveFileDirectUrl ? "Unggah file ke Google Drive terlebih dahulu" : ""}
                className="flex-1 px-3.5 py-2.5 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs font-mono select-all focus:outline-none focus:border-indigo-500 truncate"
              />
              <button
                type="button"
                disabled={!activeSelectedLink}
                onClick={() => handleCopyLink(activeSelectedLink)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50 ${
                  copiedLink
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                    : linkMode === "gdrive_alternative"
                    ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950"
                }`}
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Tersalin!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Salin Link</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Share Grid: QR Code & WhatsApp Template */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 pt-1">
            {/* QR Code Card (Rendered 100% Client-Side with SVG) */}
            <div className="sm:col-span-5 p-4 bg-[#161618] rounded-2xl border border-slate-800 flex flex-col items-center justify-between text-center space-y-3">
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <QrCode className="w-4 h-4 text-indigo-400" />
                  <span>Scan QR Code Ujian</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 font-semibold">
                  CBT Siswa
                </span>
              </div>

              {/* Native SVG QR Container */}
              <div
                onClick={() => setShowEnlargedQr(true)}
                className="p-3 bg-white rounded-2xl shadow-xl shadow-black/70 inline-flex items-center justify-center cursor-pointer hover:scale-102 transition-transform group relative"
                title="Klik untuk memperbesar QR Code"
              >
                <QRCodeSVG
                  ref={qrRef}
                  value={qrCodeTargetUrl}
                  size={140}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#09090b"
                  marginSize={1}
                />
                <div className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold gap-1 transition-opacity backdrop-blur-[1px]">
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Perbesar</span>
                </div>
              </div>

              <div className="space-y-1.5 w-full">
                <p className="text-[10px] text-slate-400 leading-tight">
                  ✨ Siswa cukup memindai QR Code ini menggunakan kamera HP untuk langsung masuk ujian.
                </p>

                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadQrSvg}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white rounded-lg bg-[#1f1f23] border border-slate-700 hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Download className="w-3 h-3 text-indigo-400" />
                    <span>Unduh SVG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowEnlargedQr(true)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white rounded-lg bg-[#1f1f23] border border-slate-700 hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Maximize2 className="w-3 h-3 text-slate-300" />
                    <span>Layar Penuh</span>
                  </button>
                </div>
              </div>
            </div>

            {/* WhatsApp / Telegram Share Card */}
            <div className="sm:col-span-7 p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>Format Pesan Grup WhatsApp</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyWhatsAppTemplate}
                    className="text-[11px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer bg-[#1f1f23] px-2 py-1 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors"
                  >
                    {copiedTemplate ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedTemplate ? "Disalin!" : "Salin Teks"}</span>
                  </button>
                </div>

                <div className="p-3 bg-[#111113] rounded-xl border border-slate-800 text-[11px] text-slate-300 font-mono whitespace-pre-line leading-relaxed max-h-36 overflow-y-auto select-all">
                  {shareMessageText}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-950 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Kirim ke WhatsApp</span>
                </button>
                <a
                  href={studentActiveLink}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka Ujian</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-[#141416]">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Smartphone className="w-4 h-4 text-indigo-400" />
            <span className="hidden sm:inline">Siswa dapat langsung mengerjakan lewat HP, Tablet, atau Laptop.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs cursor-pointer transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Enlarged QR Code Lightbox Modal for Classroom Projector */}
      {showEnlargedQr && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150">
          <div className="bg-[#161618] border border-indigo-500/50 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-left">
                <h3 className="font-bold text-white text-base">QR Code Ujian CBT</h3>
                <p className="text-xs text-indigo-300 font-medium">{currentExam.title} ({currentExam.code})</p>
              </div>
              <button
                onClick={() => setShowEnlargedQr(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-white rounded-3xl inline-block shadow-2xl shadow-black/80">
              <QRCodeSVG
                value={qrCodeTargetUrl}
                size={260}
                level="M"
                bgColor="#ffffff"
                fgColor="#09090b"
                marginSize={2}
              />
            </div>

            <div className="p-3 bg-[#111113] rounded-xl border border-slate-800 text-xs text-slate-300 space-y-1">
              <div className="font-bold text-white">Petunjuk Scan Siswa:</div>
              <div>1. Buka kamera HP atau aplikasi scanner.</div>
              <div>2. Arahkan kamera ke QR Code di atas.</div>
              <div>3. Tekan link yang muncul untuk mulai ujian.</div>
            </div>

            <button
              onClick={() => setShowEnlargedQr(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs cursor-pointer shadow-lg shadow-indigo-950"
            >
              Kembali
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
