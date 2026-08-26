import React, { useState } from "react";
import {
  FileSpreadsheet,
  TrendingUp,
  BarChart3,
  Search,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Award,
  Layers,
  ArrowUpDown,
  Sliders,
  Edit3,
  Trash2,
  Printer,
  CheckSquare,
  Square,
  FileText,
  UserCheck,
  Check,
  X
} from "lucide-react";
import { ExamPackage, ItemAnalysisSummary, SchoolProfile, StudentExamSession } from "../types";
import { calculateItemAnalysis, exportGradebookToExcel, exportItemAnalysisToExcel } from "../utils/sheetExport";
import { DifficultyD3BarChart } from "./DifficultyD3BarChart";
import { StudentGradeEditModal } from "./StudentGradeEditModal";
import { generateStudentExamPdfReport, generateBatchStudentsPdfReport } from "../utils/studentPdfReport";

interface ItemAnalysisAndHistoryProps {
  exam: ExamPackage;
  school: SchoolProfile;
  history: StudentExamSession[];
  onUpdateHistory?: (updated: StudentExamSession[]) => void;
}

export const ItemAnalysisAndHistory: React.FC<ItemAnalysisAndHistoryProps> = ({
  exam,
  school,
  history,
  onUpdateHistory,
}) => {
  const [activeTab, setActiveTab] = useState<"history" | "item_analysis">("item_analysis");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingSession, setEditingSession] = useState<StudentExamSession | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  const examSessions = history.filter((s) => s.examId === exam.id && s.status === "submitted");
  const itemAnalyses: ItemAnalysisSummary[] = calculateItemAnalysis(exam, history);

  const filteredHistory = examSessions.filter(
    (s) =>
      s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nisn.includes(searchQuery) ||
      s.className.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showNotification = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 3500);
  };

  // --- SELECTION HANDLERS ---
  const isAllSelected = filteredHistory.length > 0 && filteredHistory.every((s) => selectedIds.has(s.id));
  const isSomeSelected = selectedIds.size > 0;

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set<string>();
      filteredHistory.forEach((s) => next.add(s.id));
      setSelectedIds(next);
    }
  };

  const handleToggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // --- BATCH ACTIONS ---
  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.size} data penilaian siswa yang dipilih? Tindakan ini tidak dapat dibatalkan.`)) {
      const updatedHistory = history.filter((s) => !selectedIds.has(s.id));
      onUpdateHistory?.(updatedHistory);
      setSelectedIds(new Set());
      showNotification(`${selectedIds.size} riwayat penilaian siswa berhasil dihapus.`);
    }
  };

  const handleBatchMarkPassed = (isPassed: boolean) => {
    if (selectedIds.size === 0) return;
    const updatedHistory = history.map((s) => {
      if (selectedIds.has(s.id)) {
        return {
          ...s,
          passed: isPassed,
        };
      }
      return s;
    });
    onUpdateHistory?.(updatedHistory);
    showNotification(`Status ${selectedIds.size} siswa berhasil diubah menjadi ${isPassed ? "TUNTAS" : "REMEDIAL"}.`);
  };

  const handleExportSelectedToExcel = () => {
    if (selectedIds.size === 0) return;
    const selectedSessions = history.filter((s) => selectedIds.has(s.id));
    exportGradebookToExcel(exam, selectedSessions, school);
    showNotification(`Mengekspor ${selectedSessions.length} data siswa terpilih ke Excel.`);
  };

  // --- INDIVIDUAL ACTIONS ---
  const handleOpenEdit = (session: StudentExamSession) => {
    setEditingSession(session);
    setIsEditModalOpen(true);
  };

  const handleSaveEditedSession = (updatedSession: StudentExamSession) => {
    const updatedHistory = history.map((s) => (s.id === updatedSession.id ? updatedSession : s));
    onUpdateHistory?.(updatedHistory);
    showNotification(`Data dan nilai ${updatedSession.studentName} berhasil diperbarui.`);
  };

  const handleDeleteSingle = (id: string, name: string) => {
    if (confirm(`Hapus data penilaian untuk ${name}?`)) {
      const updatedHistory = history.filter((s) => s.id !== id);
      onUpdateHistory?.(updatedHistory);
      if (selectedIds.has(id)) {
        const next = new Set(selectedIds);
        next.delete(id);
        setSelectedIds(next);
      }
      showNotification(`Riwayat penilaian ${name} berhasil dihapus.`);
    }
  };

  const handlePrintSinglePdf = async (session: StudentExamSession) => {
    try {
      await generateStudentExamPdfReport(session, exam, school);
    } catch (e: any) {
      alert("Gagal mencetak rapor PDF: " + e.message);
    }
  };

  return (
    <div id="item-analysis-and-history-view" className="space-y-6">
      {/* Header Bar */}
      <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-medium text-xs">
            <BarChart3 className="w-4 h-4" />
            <span>Bank Data & Analisis Evaluasi Pembelajaran</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">Analisis Butir Soal & Riwayat Nilai</h2>
          <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
            <span>Mata Pelajaran: <span className="font-semibold text-slate-300">{exam.teacherProfile.subject}</span></span>
            <span>•</span>
            <span>Total Selesai: <span className="font-semibold text-indigo-400">{examSessions.length} Siswa</span></span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportGradebookToExcel(exam, history, school)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export Rekap Nilai (.xlsx)</span>
          </button>
          <button
            onClick={() => exportItemAnalysisToExcel(exam, history, school)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span>Export Analisis Butir (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Floating Notification */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-4">
        <button
          onClick={() => setActiveTab("item_analysis")}
          className={`pb-3 px-2 text-xs font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === "item_analysis"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>Analisis Tingkat Kesukaran & Daya Pembeda ({itemAnalyses.length} Soal)</span>
        </button>

        <button
          onClick={() => setActiveTab("history")}
          className={`pb-3 px-2 text-xs font-semibold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
            activeTab === "history"
              ? "border-indigo-500 text-indigo-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Riwayat Penilaian Seluruh Siswa ({examSessions.length})</span>
        </button>
      </div>

      {/* TAB 1: ITEM ANALYSIS */}
      {activeTab === "item_analysis" && (
        <div className="space-y-6">
          <DifficultyD3BarChart items={itemAnalyses} questions={exam.questions} />

          <div className="flex items-center justify-between pt-2">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>Daftar Rincian & Analisis Distraktor per Soal ({itemAnalyses.length} Butir)</span>
            </h3>
            <span className="text-xs text-slate-400">
              Menampilkan distribusi pilihan siswa & indeks daya pembeda
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {itemAnalyses.map((item) => {
              let diffBadgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
              if (item.difficultyCategory === "Sukar" || item.difficultyCategory === "Sangat Sukar") {
                diffBadgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
              } else if (item.difficultyCategory === "Sedang") {
                diffBadgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
              }

              return (
                <div
                  key={item.questionId}
                  className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 bg-indigo-600 text-white font-bold rounded-lg text-xs flex items-center justify-center">
                        #{item.questionNumber}
                      </span>
                      <div>
                        <div className="text-xs font-bold text-white">{item.topicTag}</div>
                        <div className="text-[11px] text-slate-400">{item.cognitiveLevel}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${diffBadgeColor}`}>
                        {item.difficultyCategory} ({item.percentageCorrect}%)
                      </span>
                      <span className="px-2 py-0.5 bg-[#1a1a1c] border border-slate-800 text-indigo-300 rounded text-[10px] font-mono font-semibold">
                        Kunci: {item.correctAnswer}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs font-medium text-slate-200 line-clamp-2">
                    {item.questionText}
                  </p>

                  <div className="space-y-1.5 pt-1">
                    <div className="text-[11px] font-medium text-slate-400 flex justify-between">
                      <span>Distribusi Pilihan Siswa:</span>
                      <span className="text-slate-300">Benar: <strong className="text-emerald-400">{item.correctResponses}</strong> / {item.totalResponses}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 text-center">
                      {["A", "B", "C", "D", "E"].map((opt) => {
                        const count = item.distractorCounts[opt] || 0;
                        const isKey = opt === item.correctAnswer;
                        const pct = item.totalResponses > 0 ? Math.round((count / item.totalResponses) * 100) : 0;
                        return (
                          <div
                            key={opt}
                            className={`p-1.5 rounded-xl border text-[11px] ${
                              isKey
                                ? "bg-emerald-500/10 border-emerald-500/30 font-semibold text-emerald-300"
                                : "bg-[#1a1a1c] border-slate-800 text-slate-400"
                            }`}
                          >
                            <div className="text-[10px] font-bold">{opt} {isKey && "✓"}</div>
                            <div className="font-mono text-xs text-slate-200">{count}</div>
                            <div className="text-[9px] text-slate-500">{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                    <span>Daya Pembeda: <strong className="text-slate-300">{item.discriminationIndex}</strong></span>
                    <span>Bobot: <strong className="text-indigo-300">{item.maxScore} Poin</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: EXAM RESULTS HISTORY WITH SELECT & EDIT MENU */}
      {activeTab === "history" && (
        <div className="bg-[#121214] rounded-2xl border border-slate-800 shadow-sm overflow-hidden space-y-4 p-5">
          {/* Top Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-indigo-500 focus:outline-none placeholder-slate-500"
                placeholder="Cari nama siswa, NISN, atau kelas..."
              />
            </div>

            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span>Total Terekam: <strong className="text-white">{filteredHistory.length} Siswa</strong></span>
            </div>
          </div>

          {/* BULK ACTIONS / MENU PILIH TOOLBAR */}
          {isSomeSelected && (
            <div className="bg-indigo-950/40 border border-indigo-500/40 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {selectedIds.size}
                </span>
                <span>Siswa Dipilih</span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleExportSelectedToExcel}
                  className="px-3 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Terpilih (.xlsx)</span>
                </button>
                <button
                  onClick={async () => {
                    const selectedSessions = history.filter((s) => selectedIds.has(s.id));
                    if (selectedSessions.length === 0) return;
                    try {
                      if (selectedSessions.length === 1) {
                        await generateStudentExamPdfReport(selectedSessions[0], exam, school);
                        showNotification(`Rapor siswa "${selectedSessions[0].studentName}" berhasil diunduh.`);
                      } else {
                        await generateBatchStudentsPdfReport(selectedSessions, exam, school);
                        showNotification(`Berhasil mengunduh 1 berkas PDF rapor gabungan untuk ${selectedSessions.length} siswa terpilih.`);
                      }
                    } catch (err: any) {
                      alert("Gagal mengunduh rapor PDF: " + err.message);
                    }
                  }}
                  className="px-3 py-1.5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Unduh rapor seluruh siswa terpilih menjadi 1 berkas PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Unduh Rapor PDF ({selectedIds.size} Siswa, 1 File)</span>
                </button>
                <button
                  onClick={() => handleBatchMarkPassed(true)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Set Tuntas</span>
                </button>
                <button
                  onClick={() => handleBatchMarkPassed(false)}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Set Remedial</span>
                </button>
                <button
                  onClick={handleBatchDelete}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Terpilih</span>
                </button>
                <button
                  onClick={handleClearSelection}
                  className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Batal Pilih
                </button>
              </div>
            </div>
          )}

          {/* Students Assessment Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#1a1a1c] text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-3 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="p-1 hover:text-white text-slate-400 cursor-pointer"
                      title={isAllSelected ? "Batal pilih semua" : "Pilih semua siswa"}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-indigo-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">Peringkat</th>
                  <th className="py-3 px-4">Nama Siswa</th>
                  <th className="py-3 px-4">NISN & Kelas</th>
                  <th className="py-3 px-4">Skor Soal</th>
                  <th className="py-3 px-4">Nilai Akhir</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Waktu Selesai</th>
                  <th className="py-3 px-4 text-center">Aksi / Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal text-slate-300">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                      Belum ada riwayat hasil ujian yang tersimpan untuk naskah soal ini.
                    </td>
                  </tr>
                ) : (
                  [...filteredHistory]
                    .sort((a, b) => b.totalScoreEarned - a.totalScoreEarned)
                    .map((s, idx) => {
                      const isSelected = selectedIds.has(s.id);
                      return (
                        <tr
                          key={s.id}
                          className={`transition-colors ${
                            isSelected ? "bg-indigo-950/20" : "hover:bg-[#1a1a1c]/80"
                          }`}
                        >
                          {/* Row Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleSelectRow(s.id)}
                              className="p-1 hover:text-white text-slate-400 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-400" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-3 font-mono font-semibold text-slate-400">
                            #{idx + 1}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-white">
                            {s.studentName}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-mono text-slate-400">{s.nisn}</span> •{" "}
                            <span className="text-slate-300 font-semibold">{s.className}</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-300">
                            {s.totalScoreEarned} / {s.maxScore}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="text-base font-bold font-mono text-white">
                              {s.percentage}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-semibold text-[10px] ${
                                s.passed
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {s.passed ? "TUNTAS" : "REMEDIAL"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                            {s.submitTime ? new Date(s.submitTime).toLocaleString("id-ID") : "-"}
                          </td>

                          {/* Action Buttons: Edit, PDF Report, Delete */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleOpenEdit(s)}
                                className="p-1.5 rounded-lg bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 transition-colors cursor-pointer"
                                title="Edit Nilai & Lembar Koreksi Siswa"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handlePrintSinglePdf(s)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                                title="Cetak Rapor Hasil Evaluasi PDF"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteSingle(s.id, s.studentName)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 transition-colors cursor-pointer"
                                title="Hapus Data Nilai Siswa Ini"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Student Grade & Correction Modal */}
      <StudentGradeEditModal
        isOpen={isEditModalOpen}
        session={editingSession}
        exam={exam}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveEditedSession}
      />
    </div>
  );
};
