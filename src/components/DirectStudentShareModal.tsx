import React, { useState } from "react";
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
  MessageSquare
} from "lucide-react";
import { ExamPackage } from "../types";

interface DirectStudentShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPackage;
  token?: string;
}

export const DirectStudentShareModal: React.FC<DirectStudentShareModalProps> = ({
  isOpen,
  onClose,
  exam,
  token,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedWithToken, setCopiedWithToken] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const [includeTokenInLink, setIncludeTokenInLink] = useState(true);

  if (!isOpen) return null;

  const currentUrl = window.location.origin + window.location.pathname;
  const baseUrl = currentUrl.endsWith("/") ? currentUrl.slice(0, -1) : currentUrl;

  const baseStudentLink = `${baseUrl}?mode=student&examId=${encodeURIComponent(exam.id)}`;
  const directLinkWithToken = token
    ? `${baseStudentLink}&token=${encodeURIComponent(token)}`
    : baseStudentLink;

  const activeShareLink = includeTokenInLink && token ? directLinkWithToken : baseStudentLink;

  const handleCopyLink = (withToken: boolean) => {
    const targetLink = withToken && token ? directLinkWithToken : baseStudentLink;
    navigator.clipboard.writeText(targetLink);
    if (withToken) {
      setCopiedWithToken(true);
      setTimeout(() => setCopiedWithToken(false), 2000);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const shareMessageText = `📋 *LINK UJIAN CBT SISWA - ${exam.title.toUpperCase()}*\n\n` +
    `👤 Mata Pelajaran: *${exam.teacherProfile.subject}* (${exam.teacherProfile.gradeLevel})\n` +
    `⏱️ Durasi: *${exam.durationMinutes} Menit* (${exam.questions.length} Butir Soal)\n` +
    (token ? `🔑 Token Masuk: *${token}*\n\n` : "\n") +
    `👉 *Klik Link Ujian Berikut untuk Mulai:*\n${activeShareLink}\n\n` +
    `_Petunjuk: Pastikan koneksi internet stabil dan kerjakan secara mandiri._`;

  const handleCopyWhatsAppTemplate = () => {
    navigator.clipboard.writeText(shareMessageText);
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    const encoded = encodeURIComponent(shareMessageText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  // Generate QR Code via clean Google Charts QR API or inline SVG QR
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
    activeShareLink
  )}&bgcolor=121214&color=ffffff&qzone=1`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="direct-student-share-modal"
        className="bg-[#121214] border border-indigo-500/40 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl shadow-indigo-950/50 flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-indigo-950/40 via-[#121214] to-purple-950/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
              <Share2 className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Link Langsung Ujian Siswa</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider font-bold">
                  Mode Siswa Mandiri
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Siswa langsung masuk ke tampilan ujian tanpa perlu mengakses dashboard guru.
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
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          {/* Exam Summary Badge */}
          <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-0.5">
                Paket Ujian Aktif
              </span>
              <div className="font-bold text-white text-sm">{exam.title}</div>
              <div className="text-slate-400 mt-0.5">
                {exam.teacherProfile.subject} • {exam.teacherProfile.gradeLevel} • {exam.questions.length} Soal ({exam.totalScore} Poin)
              </div>
            </div>

            {token && (
              <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center gap-2 shrink-0">
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

          {/* Direct Link Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                <span>URL Tautan Langsung Siswa:</span>
              </label>

              {token && (
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeTokenInLink}
                    onChange={(e) => setIncludeTokenInLink(e.target.checked)}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-0"
                  />
                  <span>Sertakan Token Otomatis</span>
                </label>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={activeShareLink}
                className="flex-1 px-3.5 py-2.5 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs font-mono select-all focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => handleCopyLink(includeTokenInLink)}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                  copiedWithToken || copiedLink
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-950"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-950"
                }`}
              >
                {copiedWithToken || copiedLink ? (
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
            <p className="text-[11px] text-slate-400">
              💡 Siswa yang membuka link ini langsung diarahkan ke form pengerjaan ujian secara full-screen tanpa menu navigasi guru.
            </p>
          </div>

          {/* Share Grid: QR Code & WhatsApp Template */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 pt-1">
            {/* QR Code Card */}
            <div className="sm:col-span-5 p-4 bg-[#161618] rounded-2xl border border-slate-800 flex flex-col items-center justify-center text-center space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
                <QrCode className="w-4 h-4 text-indigo-400" />
                <span>Scan QR Code (Proyektor / HP)</span>
              </div>

              <div className="p-2 bg-white rounded-2xl shadow-lg shadow-black/50 inline-block">
                <img
                  src={qrCodeUrl}
                  alt="QR Code Link Ujian"
                  className="w-36 h-36 object-contain rounded-xl"
                  loading="lazy"
                />
              </div>

              <p className="text-[10px] text-slate-400 leading-tight">
                Tampilkan di proyektor kelas atau bagikan agar siswa memindai dengan kamera smartphone.
              </p>
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
                    onClick={handleCopyWhatsAppTemplate}
                    className="text-[11px] font-semibold text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer bg-[#1f1f23] px-2 py-1 rounded border border-slate-700 hover:bg-slate-700"
                  >
                    {copiedTemplate ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedTemplate ? "Disalin!" : "Salin Teks"}</span>
                  </button>
                </div>

                <div className="p-3 bg-[#111113] rounded-xl border border-slate-800 text-[11px] text-slate-300 font-mono whitespace-pre-line leading-relaxed max-h-32 overflow-y-auto">
                  {shareMessageText}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleOpenWhatsApp}
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-950 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Kirim ke WhatsApp</span>
                </button>
                <a
                  href={activeShareLink}
                  target="_blank"
                  rel="noreferrer"
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Coba Buka</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-end bg-[#141416]">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs cursor-pointer transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
