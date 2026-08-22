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
  Sliders
} from "lucide-react";
import { ExamPackage, ItemAnalysisSummary, SchoolProfile, StudentExamSession } from "../types";
import { calculateItemAnalysis, exportGradebookToExcel, exportItemAnalysisToExcel } from "../utils/sheetExport";
import { DifficultyD3BarChart } from "./DifficultyD3BarChart";

interface ItemAnalysisAndHistoryProps {
  exam: ExamPackage;
  school: SchoolProfile;
  history: StudentExamSession[];
}

export const ItemAnalysisAndHistory: React.FC<ItemAnalysisAndHistoryProps> = ({
  exam,
  school,
  history,
}) => {
  const [activeTab, setActiveTab] = useState<"history" | "item_analysis">("item_analysis");
  const [searchQuery, setSearchQuery] = useState("");

  const examSessions = history.filter((s) => s.examId === exam.id && s.status === "submitted");
  const itemAnalyses: ItemAnalysisSummary[] = calculateItemAnalysis(exam, history);

  const filteredHistory = examSessions.filter(
    (s) =>
      s.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.nisn.includes(searchQuery) ||
      s.className.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            <span>Total Data Selesai: <span className="font-semibold text-indigo-400">{examSessions.length} Siswa</span></span>
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

      {/* TAB 1: ITEM ANALYSIS (Tingkat Kesukaran & Daya Pembeda) */}
      {activeTab === "item_analysis" && (
        <div className="space-y-6">
          {/* D3.js Difficulty Bar Chart */}
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
              const q = exam.questions.find((qItem) => qItem.id === item.questionId);
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

                  {/* Distractor Breakdown Chart */}
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

      {/* TAB 2: EXAM RESULTS HISTORY */}
      {activeTab === "history" && (
        <div className="bg-[#121214] rounded-2xl border border-slate-800 shadow-sm overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-xs text-slate-200 focus:border-indigo-500 focus:outline-none placeholder-slate-500"
                placeholder="Cari siswa atau NISN..."
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-[#1a1a1c] text-slate-400 font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Peringkat</th>
                  <th className="py-3 px-4">Nama Siswa</th>
                  <th className="py-3 px-4">NISN & Kelas</th>
                  <th className="py-3 px-4">Nilai Skor</th>
                  <th className="py-3 px-4">Nilai Akhir (0-100)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Waktu Selesai</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-normal text-slate-300">
                {filteredHistory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                      Belum ada riwayat hasil ujian yang tersimpan.
                    </td>
                  </tr>
                ) : (
                  [...filteredHistory]
                    .sort((a, b) => b.totalScoreEarned - a.totalScoreEarned)
                    .map((s, idx) => (
                      <tr key={s.id} className="hover:bg-[#1a1a1c]/80 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-semibold text-slate-400">#{idx + 1}</td>
                        <td className="py-3.5 px-4 font-medium text-white">{s.studentName}</td>
                        <td className="py-3.5 px-4">
                          <span className="font-mono text-slate-400">{s.nisn}</span> • <span className="text-slate-300 font-semibold">{s.className}</span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-300">
                          {s.totalScoreEarned} / {s.maxScore}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-base font-bold font-mono text-white">{s.percentage}</span>
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
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
