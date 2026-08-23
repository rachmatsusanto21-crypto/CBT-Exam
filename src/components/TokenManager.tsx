import React, { useState, useEffect } from "react";
import {
  Key,
  Users,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Copy,
  Check,
  Share2,
  Edit3,
  X,
  Code,
  Save,
  Filter,
  Bookmark,
  RotateCcw
} from "lucide-react";
import { ExamPackage, SchoolProfile, StudentTokenItem } from "../types";
import { exportTokensToExcel, printTokenCards } from "../utils/sheetExport";
import { DirectStudentShareModal } from "./DirectStudentShareModal";

interface TokenManagerProps {
  exam: ExamPackage;
  school: SchoolProfile;
  tokens: StudentTokenItem[];
  onUpdateExamToken: (newToken: string) => void;
  onUpdateTokens: (tokens: StudentTokenItem[]) => void;
  onUpdateExam?: (updated: ExamPackage) => void;
}

const DRAFT_CLASS_STORAGE_KEY = "slideexam_draft_student_roster";

export const TokenManager: React.FC<TokenManagerProps> = ({
  exam,
  school,
  tokens,
  onUpdateExamToken,
  onUpdateTokens,
  onUpdateExam,
}) => {
  const [copiedToken, setCopiedToken] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isEditingExamCode, setIsEditingExamCode] = useState(false);
  const [inputExamCode, setInputExamCode] = useState(exam.code);
  const [filterClass, setFilterClass] = useState<string>("all");
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Initialize draft class and student names from localStorage if available
  const [batchClass, setBatchClass] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_CLASS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.className || "X MIPA 1";
      }
    } catch {}
    return "X MIPA 1";
  });

  const [studentNamesInput, setStudentNamesInput] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAFT_CLASS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.studentNames) return parsed.studentNames;
      }
    } catch {}
    return "Ahmad Rizki Maulana\nAnisa Rahmawati\nBagas Surya Putra\nCitra Dewi Lestari\nDimas Arya Pratama\nEka Putri Handayani\nFajar Hidayat\nGita Permata Sari";
  });

  const triggerFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const examTokens = tokens.filter((t) => t.examCode === exam.code);

  // Extract unique classes for filter
  const uniqueClasses = Array.from(new Set(examTokens.map((t) => t.className).filter(Boolean)));

  const displayedTokens = examTokens.filter((t) => {
    if (filterClass === "all") return true;
    return t.className === filterClass;
  });

  // Save draft class and student names to localStorage
  const handleSaveDraftRoster = () => {
    try {
      const draftData = {
        className: batchClass,
        studentNames: studentNamesInput,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_CLASS_STORAGE_KEY, JSON.stringify(draftData));
      triggerFeedback(`Draf Kelas "${batchClass}" & Daftar Nama Siswa berhasil disimpan!`);
    } catch (e) {
      triggerFeedback("Gagal menyimpan draf ke memori browser.");
    }
  };

  // Clear draft inputs
  const handleClearDraft = () => {
    if (window.confirm("Kosongkan form nama siswa dan kelas?")) {
      setBatchClass("");
      setStudentNamesInput("");
      localStorage.removeItem(DRAFT_CLASS_STORAGE_KEY);
      triggerFeedback("Draf nama siswa dan kelas telah dikosongkan.");
    }
  };

  // Save and apply exam code
  const handleSaveExamCode = () => {
    if (!inputExamCode.trim()) return;
    const newCode = inputExamCode.trim().toUpperCase();
    if (newCode === exam.code) {
      setIsEditingExamCode(false);
      return;
    }

    // Update tokens matching old exam code
    const updatedTokens = tokens.map((t) =>
      t.examCode === exam.code ? { ...t, examCode: newCode } : t
    );
    onUpdateTokens(updatedTokens);

    if (onUpdateExam) {
      onUpdateExam({
        ...exam,
        code: newCode,
        updatedAt: new Date().toISOString(),
      });
    }

    setIsEditingExamCode(false);
    triggerFeedback(`Kode Naskah Soal berhasil diubah menjadi: ${newCode}`);
  };

  const generateRandomTokenString = (length = 6) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let res = "";
    for (let i = 0; i < length; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  const handleGenerateNewMasterToken = () => {
    const newToken = generateRandomTokenString(6);
    onUpdateExamToken(newToken);
    triggerFeedback(`Token Sesi Baru (${newToken}) berhasil dirilis!`);
  };

  const handleCopyMasterToken = () => {
    navigator.clipboard.writeText(exam.sessionToken);
    setCopiedToken(true);
    triggerFeedback("Token sesi ujian disalin ke clipboard!");
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleGenerateBulkTokens = () => {
    const lines = studentNamesInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      alert("Masukkan minimal 1 nama siswa.");
      return;
    }

    const classNameToUse = batchClass.trim() || "X MIPA 1";

    const newTokens: StudentTokenItem[] = lines.map((name, idx) => {
      const nisn = "0078" + Math.floor(100000 + Math.random() * 900000);
      const studentToken = generateRandomTokenString(5);
      return {
        id: `token-${Date.now()}-${idx + 1}-${Math.random().toString(36).substr(2, 4)}`,
        examCode: exam.code,
        token: studentToken,
        studentName: name,
        nisn,
        className: classNameToUse,
        status: "belum_mulai",
        generatedAt: new Date().toISOString(),
      };
    });

    const combined = [...tokens.filter((t) => t.examCode !== exam.code), ...examTokens, ...newTokens];
    onUpdateTokens(combined);

    // Auto-save draft so names are not lost
    try {
      localStorage.setItem(
        DRAFT_CLASS_STORAGE_KEY,
        JSON.stringify({
          className: classNameToUse,
          studentNames: studentNamesInput,
          savedAt: new Date().toISOString(),
        })
      );
    } catch {}

    triggerFeedback(`Berhasil membuat ${newTokens.length} token siswa untuk kelas ${classNameToUse}! Data tersimpan aman.`);
  };

  const handleDeleteToken = (id: string) => {
    onUpdateTokens(tokens.filter((t) => t.id !== id));
    triggerFeedback("1 token siswa berhasil dihapus.");
  };

  const handleDeleteClassTokens = (className: string) => {
    if (confirm(`Hapus seluruh token siswa untuk kelas "${className}"?`)) {
      onUpdateTokens(tokens.filter((t) => !(t.examCode === exam.code && t.className === className)));
      triggerFeedback(`Token siswa kelas "${className}" berhasil dihapus.`);
    }
  };

  const handleClearAllExamTokens = () => {
    if (confirm(`Hapus seluruh daftar token siswa (${examTokens.length} siswa) untuk naskah ${exam.code}?`)) {
      onUpdateTokens(tokens.filter((t) => t.examCode !== exam.code));
      triggerFeedback("Seluruh token siswa naskah ini telah dikosongkan.");
    }
  };

  return (
    <div id="token-manager-view" className="space-y-6">
      {/* Toast Feedback Alert */}
      {feedbackMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in shadow-lg shadow-emerald-950/20">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Top Banner: Master Exam Code & Session Token */}
      <div className="bg-[#121214] border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-300 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sistem Akses & Autentikasi CBT</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-white">{exam.title}</h2>
            <p className="text-slate-400 text-xs">
              Mata Pelajaran: <span className="text-slate-200 font-semibold">{exam.teacherProfile.subject}</span> ({exam.questions.length} Soal, {exam.durationMinutes} Menit)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-lg shadow-indigo-950"
            >
              <Share2 className="w-4 h-4" />
              <span>Bagikan Link Siswa</span>
            </button>
            <button
              onClick={() => exportTokensToExcel(exam, examTokens, school)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-950"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Sheets (.xlsx)</span>
            </button>
            <button
              onClick={() => printTokenCards(exam, examTokens, school)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Cetak Kartu Login Siswa</span>
            </button>
          </div>
        </div>

        {/* Master Credentials Display */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Exam Code Card */}
          <div className="bg-[#1a1a1c] rounded-2xl p-5 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider flex items-center justify-between">
              <span>1. Kode Naskah Soal</span>
              {!isEditingExamCode ? (
                <button
                  id="edit-token-exam-code-btn"
                  onClick={() => {
                    setInputExamCode(exam.code);
                    setIsEditingExamCode(true);
                  }}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Ubah Kode</span>
                </button>
              ) : null}
            </div>

            {isEditingExamCode ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inputExamCode}
                    onChange={(e) => setInputExamCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-1.5 bg-[#26262a] border border-emerald-500 rounded-xl text-emerald-400 font-mono font-bold text-lg tracking-wider focus:outline-none"
                    placeholder="KODE-SOAL"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveExamCode}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => setIsEditingExamCode(false)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Mengubah kode naskah akan memperbarui seluruh token siswa terkait naskah ini.
                </p>
              </div>
            ) : (
              <div className="text-3xl font-black font-mono tracking-widest text-emerald-400">
                {exam.code}
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              Digunakan siswa saat memilih naskah ujian pada portal CBT.
            </p>
          </div>

          {/* Master Session Token Card */}
          <div className="bg-[#1a1a1c] rounded-2xl p-5 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>2. Token Sesi Ujian (Master Token)</span>
              </div>
              <button
                onClick={handleGenerateNewMasterToken}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Rilis Token Baru</span>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-black font-mono tracking-widest text-amber-400">
                {exam.sessionToken}
              </div>
              <button
                onClick={handleCopyMasterToken}
                className="p-2 bg-[#26262a] hover:bg-slate-700 border border-slate-700 rounded-xl text-white transition-colors cursor-pointer"
                title="Salin Token"
              >
                {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Rilis token ini kepada siswa saat waktu pengerjaan dimulai.
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Generator & Token Roster Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bulk Generator Form with Save & Delete Draft Buttons */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Generate Token Siswa Kolektif</span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              Buat token ujian individual per siswa lengkap dengan NISN untuk dicetak menjadi Kartu Peserta Ujian.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-300">Pilih / Ketik Nama Kelas</label>
                  <span className="text-[10px] text-slate-500">Tersimpan di Draf</span>
                </div>
                <input
                  type="text"
                  value={batchClass}
                  onChange={(e) => setBatchClass(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-semibold"
                  placeholder="Misal: X MIPA 1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium text-slate-300">
                    Daftar Nama Siswa (1 Baris 1 Nama)
                  </label>
                  <span className="text-[10px] text-indigo-400">
                    {studentNamesInput.split("\n").filter((l) => l.trim()).length} Siswa
                  </span>
                </div>
                <textarea
                  rows={6}
                  value={studentNamesInput}
                  onChange={(e) => setStudentNamesInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-mono text-xs"
                  placeholder="Paste daftar nama siswa..."
                />
              </div>

              {/* Action Buttons for Save Draft & Clear Draft */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveDraftRoster}
                  className="flex-1 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 hover:border-indigo-500/50 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  title="Simpan Kelas & Daftar Nama Siswa agar tidak hilang saat refresh/pindah tab"
                >
                  <Save className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Simpan Kelas & Nama</span>
                </button>

                <button
                  type="button"
                  onClick={handleClearDraft}
                  className="py-2 px-3 bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1"
                  title="Kosongkan Form Input Nama Siswa dan Kelas"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Draf</span>
                </button>
              </div>

              <button
                onClick={handleGenerateBulkTokens}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-indigo-950 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Generate Token untuk Kelas Ini</span>
              </button>
            </div>
          </div>
        </div>

        {/* Token Table */}
        <div className="lg:col-span-8">
          <div className="bg-[#121214] rounded-2xl border border-slate-800 shadow-sm overflow-hidden p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <span>Daftar Token Siswa Terdaftar</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                    {displayedTokens.length} Peserta
                  </span>
                </h3>
                <p className="text-xs text-slate-400">Token unik per peserta untuk naskah ini.</p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Class Filter Selector */}
                {uniqueClasses.length > 1 && (
                  <div className="flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={filterClass}
                      onChange={(e) => setFilterClass(e.target.value)}
                      className="bg-[#1a1a1c] border border-slate-700 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="all">Semua Kelas ({examTokens.length})</option>
                      {uniqueClasses.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls} ({examTokens.filter((t) => t.className === cls).length})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {filterClass !== "all" && (
                  <button
                    onClick={() => handleDeleteClassTokens(filterClass)}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2.5 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors cursor-pointer"
                    title={`Hapus seluruh token kelas ${filterClass}`}
                  >
                    Hapus Kelas {filterClass}
                  </button>
                )}

                {examTokens.length > 0 && (
                  <button
                    onClick={handleClearAllExamTokens}
                    className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl transition-colors cursor-pointer"
                  >
                    Hapus Semua
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#1a1a1c] text-slate-400 font-semibold uppercase tracking-wider sticky top-0">
                    <th className="py-2.5 px-3">No</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">NISN</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3">Token Siswa</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                  {displayedTokens.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                        Belum ada token siswa yang dibuat. Masukkan nama siswa di form kiri lalu klik Generate Token.
                      </td>
                    </tr>
                  ) : (
                    displayedTokens.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-[#1a1a1c]/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium text-white">{t.studentName}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{t.nisn}</td>
                        <td className="py-2.5 px-3 font-medium text-indigo-400">{t.className}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-200 bg-[#1a1a1c] border border-slate-800 px-2 py-0.5 rounded tracking-wider">
                            {t.token}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteToken(t.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Hapus Token Siswa Ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Direct Student Share Modal */}
      <DirectStudentShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        exam={exam}
        token={exam.sessionToken}
      />
    </div>
  );
};
