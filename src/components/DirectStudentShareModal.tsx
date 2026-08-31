import React, { useState, useMemo, useRef } from "react";
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
  PackageCheck,
  Download,
  Maximize2,
  Zap,
  Info
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ExamPackage, StudentTokenItem } from "../types";
import { generateStudentShareUrl, generateShortStudentUrl } from "../utils/examShareEncoder";
import { getStudentTokens } from "../utils/storage";

interface DirectStudentShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPackage;
  token?: string;
  tokens?: StudentTokenItem[];
}

export const DirectStudentShareModal: React.FC<DirectStudentShareModalProps> = ({
  isOpen,
  onClose,
  exam,
  token,
  tokens,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedShortLink, setCopiedShortLink] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [includeTokenInLink, setIncludeTokenInLink] = useState(true);
  const [linkMode, setLinkMode] = useState<"full_package" | "short">("full_package");
  const [qrMode, setQrMode] = useState<"short" | "full_package">("short");
  const [showEnlargedQr, setShowEnlargedQr] = useState(false);
  const qrRef = useRef<SVGSVGElement | null>(null);

  const availableTokens = useMemo(() => {
    if (tokens && tokens.length > 0) return tokens;
    const list = getStudentTokens();
    const matching = list.filter((t) => !t.examCode || t.examCode === exam.code);
    return matching.length > 0 ? matching : list;
  }, [tokens, exam.code]);

  if (!isOpen) return null;

  const currentUrl = window.location.origin + window.location.pathname;
  const baseUrl = currentUrl.endsWith("/") ? currentUrl.slice(0, -1) : currentUrl;

  // 1. Full compressed link containing package data
  const fullPackageLinkWithToken = generateStudentShareUrl(
    baseUrl,
    exam,
    token,
    availableTokens,
    true
  );
  const fullPackageLinkWithoutToken = generateStudentShareUrl(
    baseUrl,
    exam,
    undefined,
    availableTokens,
    true
  );
  const fullPackageActiveLink = includeTokenInLink && token ? fullPackageLinkWithToken : fullPackageLinkWithoutToken;

  // 2. Short clean link (ideal for QR codes, projectors, or school intranet)
  const shortLinkWithToken = generateShortStudentUrl(baseUrl, exam, token);
  const shortLinkWithoutToken = generateShortStudentUrl(baseUrl, exam, undefined);
  const shortActiveLink = includeTokenInLink && token ? shortLinkWithToken : shortLinkWithoutToken;

  // Active link selected in the main input box
  const activeSelectedLink = linkMode === "full_package" ? fullPackageActiveLink : shortActiveLink;

  // QR Code payload to render
  const qrCodeTargetUrl = qrMode === "short" ? shortActiveLink : fullPackageActiveLink;

  const handleCopyLink = (textToCopy: string, isShort: boolean = false) => {
    navigator.clipboard.writeText(textToCopy);
    if (isShort) {
      setCopiedShortLink(true);
      setTimeout(() => setCopiedShortLink(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const shareMessageText = `📋 *LINK UJIAN CBT SISWA - ${exam.title.toUpperCase()}*\n\n` +
    `👤 Mata Pelajaran: *${exam.teacherProfile.subject}* (${exam.teacherProfile.gradeLevel})\n` +
    `⏱️ Durasi: *${exam.durationMinutes} Menit* (${exam.questions.length} Butir Soal)\n` +
    (token ? `🔑 Token Masuk: *${token}*\n\n` : "\n") +
    `👉 *Klik Link Ujian Berikut untuk Mulai:*\n${activeSelectedLink}\n\n` +
    `_Petunjuk: Buka link, pilih nama dari daftar kelas, masukkan token ujian, dan kerjakan dengan teliti._`;

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
    link.download = `QR-Ujian-${exam.code || "CBT"}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/25 border border-indigo-500/40 text-indigo-400 flex items-center justify-center shrink-0 shadow-inner">
              <Share2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Bagikan Link & QR Code Ujian</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider font-bold">
                  Siswa Mandiri
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Siswa langsung masuk ke form ujian full-screen tanpa menu navigasi guru.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {/* Exam Summary Badge */}
          <div className="p-3.5 sm:p-4 bg-[#161618] rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-0.5">
                Paket Ujian Aktif
              </span>
              <div className="font-bold text-white text-sm">{exam.title}</div>
              <div className="text-slate-400 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>{exam.teacherProfile.subject}</span>
                <span>•</span>
                <span>{exam.teacherProfile.gradeLevel}</span>
                <span>•</span>
                <span className="text-emerald-400 font-semibold">{exam.questions.length} Butir Soal</span>
                <span>•</span>
                <span>Kode: <span className="font-mono text-indigo-300 font-bold">{exam.code}</span></span>
              </div>
            </div>

            {token && (
              <div className="p-2.5 bg-indigo-950/50 border border-indigo-500/40 rounded-xl flex items-center gap-2 shrink-0">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="text-[10px] text-slate-400">Token Aktif:</div>
                  <div className="font-mono font-black text-sm text-indigo-300 tracking-wider">
                    {token}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mode Selector Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span>Pilih Tipe Tautan:</span>
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

            <div className="grid grid-cols-2 gap-2 p-1 bg-[#161618] rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setLinkMode("full_package")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  linkMode === "full_package"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Link Lengkap + Soal (Chat/WA)</span>
              </button>

              <button
                type="button"
                onClick={() => setLinkMode("short")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  linkMode === "short"
                    ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span className="truncate">Link Ringkas (Pendek)</span>
              </button>
            </div>

            {/* Direct Link Input Box */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                readOnly
                value={activeSelectedLink}
                className="flex-1 px-3.5 py-2.5 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs font-mono select-all focus:outline-none focus:border-indigo-500 truncate"
              />
              <button
                type="button"
                onClick={() => handleCopyLink(activeSelectedLink, linkMode === "short")}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  copiedLink || copiedShortLink
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950"
                }`}
              >
                {copiedLink || copiedShortLink ? (
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

            {linkMode === "full_package" ? (
              <p className="text-[11px] text-emerald-400/95 flex items-center gap-1.5 font-medium">
                <PackageCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Link ini telah mengompresi {exam.questions.length} butir soal, siap dibuka di WhatsApp/HP siswa tanpa perlu sinkronisasi manual.</span>
              </p>
            ) : (
              <p className="text-[11px] text-amber-400/90 flex items-center gap-1.5 font-medium">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Link ringkas berukuran sangat pendek (~50 karakter), sangat mudah diketik langsung di browser siswa.</span>
              </p>
            )}
          </div>

          {/* Share Grid: QR Code & WhatsApp Template */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 pt-1">
            {/* QR Code Card (Rendered 100% Client-Side with SVG) */}
            <div className="sm:col-span-5 p-4 bg-[#161618] rounded-2xl border border-slate-800 flex flex-col items-center justify-between text-center space-y-3">
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <QrCode className="w-4 h-4 text-indigo-400" />
                  <span>Scan QR Code</span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="Toggle QR Ringkas / Lengkap"
                    onClick={() => setQrMode(qrMode === "short" ? "full_package" : "short")}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-950/60 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-900/60 cursor-pointer"
                  >
                    {qrMode === "short" ? "Mode: Ringkas" : "Mode: Lengkap"}
                  </button>
                </div>
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
                  level={qrMode === "short" ? "M" : "L"}
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
                  {qrMode === "short"
                    ? "✨ QR Ringkas: Sangat cepat dipindai di proyektor kelas atau layar monitor."
                    : "📦 QR Lengkap: Berisi seluruh paket soal langsung ke kamera HP siswa."}
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
                  href={activeSelectedLink}
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
                <p className="text-xs text-indigo-300 font-medium">{exam.title} ({exam.code})</p>
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
                level={qrMode === "short" ? "M" : "L"}
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
