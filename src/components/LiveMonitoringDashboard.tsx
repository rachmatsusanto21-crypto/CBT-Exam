import React, { useState } from "react";
import {
  Users,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Eye,
  ShieldAlert,
  ShieldCheck,
  GraduationCap,
  Sparkles,
  TrendingUp,
  Award,
  FileDown,
  Printer
} from "lucide-react";
import { ExamPackage, SchoolProfile, StudentExamSession, StudentTokenItem } from "../types";
import { exportGradebookToExcel, exportItemAnalysisToExcel } from "../utils/sheetExport";
import { generateStudentExamPdfReport } from "../utils/studentPdfReport";

interface LiveMonitoringDashboardProps {
  exam: ExamPackage;
  school: SchoolProfile;
  history: StudentExamSession[];
  tokens: StudentTokenItem[];
  onForceSubmitStudent: (sessionId: string) => void;
  onResetStudentSession: (sessionId: string) => void;
}

export const LiveMonitoringDashboard: React.FC<LiveMonitoringDashboardProps> = ({
  exam,
  school,
  history,
  tokens,
  onForceSubmitStudent,
  onResetStudentSession,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [selectedStudentSession, setSelectedStudentSession] = useState<StudentExamSession | null>(null);

  const examSessions = history.filter((s) => s.examId === exam.id);

  // Group tokens and active sessions
  const studentRows = tokens
    .filter((t) => t.examCode === exam.code)
    .map((tokenItem) => {
      const activeSession = examSessions.find((s) => s.token === tokenItem.token || s.nisn === tokenItem.nisn);
      return {
        tokenItem,
        session: activeSession || null,
      };
    });

  // Also include any sessions not in pre-generated token list
  examSessions.forEach((s) => {
    if (!studentRows.some((row) => row.session?.id === s.id)) {
      studentRows.push({
        tokenItem: {
          id: `dyn-${s.id}`,
          examCode: s.examCode,
          token: s.token,
          studentName: s.studentName,
          nisn: s.nisn,
          className: s.className,
          status: s.status === "submitted" ? "selesai" : "sedang_mengerjakan",
          generatedAt: s.startTime,
        },
        session: s,
      });
    }
  });

  const filteredRows = studentRows.filter(({ tokenItem, session }) => {
    const nameMatch = tokenItem.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tokenItem.nisn.includes(searchQuery);
    const classMatch = filterClass === "all" || tokenItem.className === filterClass;
    return nameMatch && classMatch;
  });

  const totalRegistered = studentRows.length;
  const completedCount = studentRows.filter((r) => r.session?.status === "submitted").length;
  const inProgressCount = studentRows.filter((r) => r.session?.status === "in_progress").length;
  const notStartedCount = totalRegistered - completedCount - inProgressCount;

  const completedSessions = examSessions.filter((s) => s.status === "submitted");
  const averageScore = completedSessions.length > 0
    ? Math.round(completedSessions.reduce((acc, s) => acc + s.percentage, 0) / completedSessions.length)
    : 0;
  const passedCount = completedSessions.filter((s) => s.passed).length;
  const passRate = completedSessions.length > 0 ? Math.round((passedCount / completedSessions.length) * 100) : 0;

  const uniqueClasses = Array.from(new Set(studentRows.map((r) => r.tokenItem.className)));

  return (
    <div id="live-monitoring-dashboard" className="space-y-6">
      {/* Header Info */}
      <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-medium text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Real-time Monitoring & Evaluasi CBT</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">{exam.title}</h2>
          <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-2">
            <span>Kode Soal: <span className="font-mono font-semibold bg-[#1a1a1c] border border-slate-800 text-indigo-300 px-2 py-0.5 rounded">{exam.code}</span></span>
            <span>•</span>
            <span>Token Sesi: <span className="font-mono font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded">{exam.sessionToken}</span></span>
            <span>•</span>
            <span>KKM: <span className="font-semibold text-slate-300">{exam.teacherProfile.passingGrade}</span></span>
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => exportGradebookToExcel(exam, history, school)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Unduh Rekap Google Sheets</span>
          </button>
          <button
            onClick={() => exportItemAnalysisToExcel(exam, history, school)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 text-indigo-400" />
            <span>Unduh Analisis Butir Soal</span>
          </button>
          {completedSessions.length > 0 && (
            <button
              onClick={() => {
                completedSessions.forEach((sess, idx) => {
                  setTimeout(() => {
                    generateStudentExamPdfReport(sess, exam, school);
                  }, idx * 500);
                });
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-950 transition-all cursor-pointer"
              title="Unduh seluruh rapor siswa yang sudah selesai mengerjakan"
            >
              <FileDown className="w-4 h-4" />
              <span>Unduh Semua Rapor PDF ({completedSessions.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Total Peserta Terdaftar</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white">{totalRegistered} Siswa</div>
          <div className="text-[11px] text-slate-500">
            {completedCount} Selesai • {inProgressCount} Mengerjakan • {notStartedCount} Belum
          </div>
        </div>

        <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Rata-Rata Nilai Sementara</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{averageScore} <span className="text-sm font-normal text-slate-500">/ 100</span></div>
          <div className="text-[11px] text-slate-500">
            Berdasarkan {completedCount} siswa yang sudah submit
          </div>
        </div>

        <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Tingkat Ketuntasan (KKM)</span>
            <GraduationCap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{passRate}%</div>
          <div className="text-[11px] text-slate-500">
            {passedCount} Tuntas • {completedCount - passedCount} Remedial
          </div>
        </div>

        <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>Status Sesi & Token</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold text-indigo-300 font-mono">{exam.sessionToken}</div>
          <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Token Aktif ({exam.durationMinutes} Menit)
          </div>
        </div>
      </div>

      {/* Filter & Student Table */}
      <div className="bg-[#121214] rounded-2xl border border-slate-800 shadow-sm overflow-hidden space-y-4 p-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
              placeholder="Cari nama siswa atau NISN..."
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="all" className="bg-[#121214]">Semua Kelas</option>
              {uniqueClasses.map((c) => (
                <option key={c} value={c} className="bg-[#121214]">
                  Kelas {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#1a1a1c] text-slate-400 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">No</th>
                <th className="py-3 px-4">Nama Siswa</th>
                <th className="py-3 px-4">NISN & Kelas</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Progres Soal</th>
                <th className="py-3 px-4">Nilai Akhir</th>
                <th className="py-3 px-4 text-right">Aksi Pengawas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal text-slate-300">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                    Tidak ada data peserta ujian yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ tokenItem, session }, idx) => {
                  const isFinished = session?.status === "submitted";
                  const isInProgress = session?.status === "in_progress";
                  const answeredCount = session ? Object.keys(session.answers).length : 0;
                  const totalQ = exam.questions.length;
                  const progressPct = totalQ > 0 ? Math.round((answeredCount / totalQ) * 100) : 0;

                  return (
                    <tr key={tokenItem.id} className="hover:bg-[#1a1a1c]/80 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-3.5 px-4 font-medium text-white">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{tokenItem.studentName}</span>
                          {(session?.violationCount || session?.cheatViolations?.length || 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded text-[10px] font-bold"
                              title={`${session?.violationCount || session?.cheatViolations?.length}x terdeteksi berpindah tab / blur window`}
                            >
                              <ShieldAlert className="w-3 h-3 text-rose-400" />
                              <span>{session?.violationCount || session?.cheatViolations?.length}x Tab Switch</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-slate-400">{tokenItem.nisn}</span> •{" "}
                        <span className="font-semibold text-slate-300">{tokenItem.className}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        {isFinished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-medium text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Selesai</span>
                          </span>
                        ) : isInProgress ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full font-medium text-[11px] animate-pulse">
                            <Clock className="w-3 h-3" />
                            <span>Sedang Mengerjakan</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-[#1a1a1c] text-slate-400 border border-slate-800 rounded-full font-normal text-[11px]">
                            Belum Mulai
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 min-w-[140px]">
                        {session ? (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-slate-400">{answeredCount}/{totalQ} Soal</span>
                              <span className="font-semibold text-slate-200">{progressPct}%</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  isFinished ? "bg-emerald-500" : "bg-indigo-500"
                                }`}
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {isFinished ? (
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-white font-mono">
                              {session.percentage}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                session.passed
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              }`}
                            >
                              {session.passed ? "TUNTAS" : "REMEDIAL"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Menunggu submit</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {session && (
                            <button
                              onClick={() => generateStudentExamPdfReport(session, exam, school)}
                              className="p-1.5 text-emerald-400 hover:text-white hover:bg-emerald-600/20 border border-emerald-500/30 rounded-lg transition-colors cursor-pointer"
                              title="Unduh Rapor Hasil Ujian (PDF)"
                            >
                              <FileDown className="w-4 h-4" />
                            </button>
                          )}
                          {session && (
                            <button
                              onClick={() => setSelectedStudentSession(session)}
                              className="p-1.5 text-indigo-400 hover:text-white hover:bg-[#1a1a1c] border border-transparent hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
                              title="Lihat Detail Jawaban & Log"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          {isInProgress && (
                            <button
                              onClick={() => onForceSubmitStudent(session.id)}
                              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-semibold cursor-pointer shadow-xs"
                              title="Paksa Kumpulkan"
                            >
                              Submit
                            </button>
                          )}
                          {session && (
                            <button
                              onClick={() => {
                                if (confirm(`Reset sesi pengerjaan siswa ${tokenItem.studentName}?`)) {
                                  onResetStudentSession(session.id);
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Reset Sesi Siswa"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          )}
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

      {/* Student Detail Modal */}
      {selectedStudentSession && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-2xl p-6 max-w-2xl w-full border border-slate-800 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedStudentSession.studentName}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedStudentSession.className} • NISN: {selectedStudentSession.nisn}
                </p>
              </div>
              <button
                onClick={() => setSelectedStudentSession(null)}
                className="text-slate-400 hover:text-white font-bold text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-[#1a1a1c] border border-slate-800 rounded-xl text-center">
              <div>
                <div className="text-[11px] text-slate-400">Nilai Akhir</div>
                <div className="text-xl font-extrabold text-white">{selectedStudentSession.percentage}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Status</div>
                <div className={`text-xs font-semibold mt-1 ${selectedStudentSession.passed ? "text-emerald-400" : "text-rose-400"}`}>
                  {selectedStudentSession.passed ? "TUNTAS (KKM)" : "REMEDIAL"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Waktu Mulai</div>
                <div className="text-xs font-semibold text-slate-300 mt-1">
                  {new Date(selectedStudentSession.startTime).toLocaleTimeString("id-ID")}
                </div>
              </div>
            </div>

            {/* Integrity / Anti-Cheating Logs */}
            <div className="p-3.5 bg-[#161618] rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  {(selectedStudentSession.violationCount || selectedStudentSession.cheatViolations?.length || 0) > 0 ? (
                    <>
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span className="text-rose-300">Catatan Pelanggaran Integritas Ujian</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300">Integritas Pengerjaan: Tertib</span>
                    </>
                  )}
                </div>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    (selectedStudentSession.violationCount || selectedStudentSession.cheatViolations?.length || 0) > 0
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  }`}
                >
                  {(selectedStudentSession.violationCount || selectedStudentSession.cheatViolations?.length || 0)} Pelanggaran
                </span>
              </div>

              {(selectedStudentSession.cheatViolations && selectedStudentSession.cheatViolations.length > 0) ? (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pt-1">
                  {selectedStudentSession.cheatViolations.map((v, i) => (
                    <div
                      key={i}
                      className="p-2 bg-rose-950/30 border border-rose-900/40 rounded-lg text-[11px] flex items-center justify-between text-rose-200"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        <span>{v.message}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">
                        {new Date(v.timestamp).toLocaleTimeString("id-ID")}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">
                  Tidak terdeteksi aktivitas mencurigakan seperti perpindahan tab atau keluar dari mode fokus.
                </p>
              )}
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-xs text-slate-300">Rincian Jawaban per Butir Soal:</h4>
              <div className="space-y-2">
                {exam.questions.map((q, idx) => {
                  const ans = selectedStudentSession.answers[q.id];
                  const isCorrect = ans?.isCorrect || ans?.selectedOption === q.correctAnswer;
                  return (
                    <div
                      key={q.id}
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                        isCorrect ? "bg-emerald-500/5 border-emerald-500/20" : "bg-rose-500/5 border-rose-500/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-slate-300">Soal #{idx + 1}:</span>
                        <span className="text-slate-300 line-clamp-1 max-w-sm">{q.questionText}</span>
                      </div>

                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-slate-400 text-[11px]">Jawaban: {ans?.selectedOption || "-"}</span>
                        <span className="text-indigo-400 text-[11px]">Kunci: {q.correctAnswer}</span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${isCorrect ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                          {isCorrect ? `+${q.score}` : "0"} Poin
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => generateStudentExamPdfReport(selectedStudentSession, exam, school)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-950 cursor-pointer"
              >
                <FileDown className="w-4 h-4" />
                <span>Unduh Laporan Rapor PDF</span>
              </button>

              <button
                onClick={() => setSelectedStudentSession(null)}
                className="px-5 py-2 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
