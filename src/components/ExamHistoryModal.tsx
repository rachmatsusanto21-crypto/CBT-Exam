import React, { useState } from "react";
import {
  History,
  Sparkles,
  BookOpen,
  FileText,
  FileSpreadsheet,
  Printer,
  Play,
  Copy,
  Trash2,
  CheckCircle2,
  Calendar,
  Clock,
  Award,
  Search,
  X,
  ExternalLink,
  Plus,
  ArrowRight,
  ShieldCheck,
  BrainCircuit,
  Eye
} from "lucide-react";
import { ExamPackage, SchoolProfile } from "../types";
import {
  exportQuestionsToExcel,
  exportQuestionsToWordDoc,
  printFormattedExamDocument,
  calculateBloomAndersonSummary
} from "../utils/sheetExport";

interface ExamHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  exams: ExamPackage[];
  activeExamId: string;
  onSelectAndApplyExam: (examId: string, targetTab?: "student_exam" | "ai_generator") => void;
  onDeleteExam: (examId: string) => void;
  onDuplicateExam: (exam: ExamPackage) => void;
  onCreateNewExam: () => void;
  school: SchoolProfile;
}

export const ExamHistoryModal: React.FC<ExamHistoryModalProps> = ({
  isOpen,
  onClose,
  exams,
  activeExamId,
  onSelectAndApplyExam,
  onDeleteExam,
  onDuplicateExam,
  onCreateNewExam,
  school,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSubject, setFilterSubject] = useState<string>("all");
  const [previewExam, setPreviewExam] = useState<ExamPackage | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const showFeedback = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  // Unique subjects
  const subjects = Array.from(new Set(exams.map((e) => e.teacherProfile.subject).filter(Boolean)));

  const filteredExams = exams.filter((e) => {
    const matchesSearch =
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.teacherProfile.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.teacherProfile.teacherName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSubject = filterSubject === "all" || e.teacherProfile.subject === filterSubject;

    return matchesSearch && matchesSubject;
  });

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#121214] border border-slate-700 rounded-3xl max-w-4xl w-full flex flex-col shadow-2xl overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between bg-[#161618]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Riwayat & Bank Naskah Soal Ujian</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                  {exams.length} Paket Naskah
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Pilih naskah yang pernah dibuat untuk dicetak ulang (Word Docs ber-kisi-kisi, Excel, PDF) atau diaktifkan kembali ke Slide CBT.
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

        {/* Action Controls & Filters */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-[#141416] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul ujian, kode naskah, mapel, atau guru..."
                className="w-full bg-[#18181b] text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {subjects.length > 1 && (
              <select
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="bg-[#18181b] text-slate-200 text-xs rounded-xl px-3 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500 cursor-pointer shrink-0"
              >
                <option value="all">Semua Mapel</option>
                {subjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>
            )}
          </div>

          <button
            onClick={() => {
              onCreateNewExam();
              onClose();
            }}
            className="w-full sm:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-950 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Naskah Baru</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Exam Cards List */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {filteredExams.length === 0 ? (
            <div className="text-center py-12 bg-[#161618] border border-slate-800 rounded-3xl p-6">
              <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-sm font-bold text-slate-300 mb-1">Tidak Ada Naskah Soal Ditemukan</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                {searchQuery
                  ? "Tidak ada riwayat naskah soal yang cocok dengan kata kunci pencarian Anda."
                  : "Belum ada paket naskah soal tersimpan. Klik tombol Buat Naskah Baru untuk memulai."}
              </p>
              <button
                onClick={() => {
                  onCreateNewExam();
                  onClose();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Buat Naskah Sekarang
              </button>
            </div>
          ) : (
            filteredExams.map((examItem) => {
              const isActive = examItem.id === activeExamId;
              const bloom = calculateBloomAndersonSummary(examItem.questions);

              return (
                <div
                  key={examItem.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    isActive
                      ? "bg-indigo-950/20 border-indigo-500/50 shadow-md shadow-indigo-950/40"
                      : "bg-[#161618] border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Info Column */}
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-md border border-emerald-500/20">
                          {examItem.code}
                        </span>
                        <h3 className="text-base font-black text-white flex items-center gap-2">
                          <span>{examItem.title}</span>
                        </h3>
                        {isActive && (
                          <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-extrabold border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Sedang Aktif</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="font-semibold text-slate-300">
                          {examItem.teacherProfile.subject || "Mata Pelajaran"}
                        </span>
                        <span>•</span>
                        <span>{examItem.teacherProfile.gradeLevel || "Kelas"}</span>
                        <span>•</span>
                        <span>Guru: {examItem.teacherProfile.teacherName}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-300">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          {examItem.durationMinutes} Menit
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-300">
                          <Award className="w-3.5 h-3.5 text-indigo-400" />
                          {examItem.questions.length} Soal ({examItem.totalScore} Poin)
                        </span>
                      </div>

                      {/* Bloom Anderson Distribution Pills */}
                      <div className="flex items-center gap-2 text-[11px] pt-1 flex-wrap">
                        <span className="text-slate-500">Taksonomi:</span>
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded font-semibold">
                          HOTS {bloom.hotsPercent}%
                        </span>
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded font-semibold">
                          MOTS {bloom.motsPercent}%
                        </span>
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-semibold">
                          LOTS {bloom.lotsPercent}%
                        </span>
                        <span className="text-[10px] text-slate-500 ml-auto">
                          Diperbarui: {new Date(examItem.updatedAt || Date.now()).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons Column */}
                    <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0 shrink-0">
                      {/* Apply & Launch to CBT Slides */}
                      <button
                        onClick={() => {
                          onSelectAndApplyExam(examItem.id, "student_exam");
                          showFeedback(`Naskah "${examItem.title}" berhasil diaktifkan ke Slide CBT!`);
                          setTimeout(onClose, 600);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm ${
                          isActive
                            ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950"
                        }`}
                        title="Tampilkan dan Terapkan naskah ini langsung di Slide CBT Siswa"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Terapkan ke CBT</span>
                      </button>

                      {/* Edit in AI Generator */}
                      <button
                        onClick={() => {
                          onSelectAndApplyExam(examItem.id, "ai_generator");
                          onClose();
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        title="Buka dan edit butir soal di Editor Soal & AI Gemini"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Buka Editor</span>
                      </button>

                      {/* Export Word (.doc) */}
                      <button
                        onClick={() => {
                          exportQuestionsToWordDoc(examItem, school, true, true);
                          showFeedback(`Naskah Word (.doc) "${examItem.title}" ber-kisi-kisi berhasil diunduh!`);
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                        title="Cetak Ulang / Download Dokumen Word (.doc) ber-kisi-kisi"
                      >
                        <FileText className="w-4 h-4" />
                      </button>

                      {/* Export Excel (.xlsx) */}
                      <button
                        onClick={() => {
                          exportQuestionsToExcel(examItem, school);
                          showFeedback(`File Excel (.xlsx) "${examItem.title}" berhasil diunduh!`);
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                        title="Download Spreadsheet Excel (.xlsx) 3 Sheet"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                      </button>

                      {/* Print PDF / Print Window */}
                      <button
                        onClick={() => {
                          printFormattedExamDocument(examItem, school, { includeAnswerKey: true, includeMatrix: true });
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                        title="Cetak Naskah + Matriks Kisi-Kisi Bloom & Anderson"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* Duplicate Exam Package */}
                      <button
                        onClick={() => {
                          onDuplicateExam(examItem);
                          showFeedback(`Naskah "${examItem.title}" berhasil diduplikat!`);
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                        title="Duplikat Naskah Soal ini"
                      >
                        <Copy className="w-4 h-4" />
                      </button>

                      {/* Delete Exam (cannot delete if it's the only one) */}
                      {exams.length > 1 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Yakin ingin menghapus naskah soal "${examItem.title}" (${examItem.code}) dari riwayat?`)) {
                              onDeleteExam(examItem.id);
                              showFeedback(`Naskah "${examItem.title}" telah dihapus.`);
                            }
                          }}
                          className="p-2 bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                          title="Hapus naskah soal ini dari riwayat"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-[#161618] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Total {exams.length} naskah tersimpan di penyimpanan offline browser Anda.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
