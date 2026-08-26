import React, { useState, useEffect } from "react";
import {
  X,
  Save,
  User,
  Award,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  RotateCcw,
  BookOpen,
  HelpCircle,
  Key,
  ShieldAlert
} from "lucide-react";
import { ExamPackage, StudentAnswerItem, StudentExamSession, StudentTokenItem } from "../types";

export interface StudentRowItem {
  tokenItem: StudentTokenItem;
  session: StudentExamSession | null;
}

interface LiveStudentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPackage;
  studentRow: StudentRowItem | null;
  onSave: (updatedToken: StudentTokenItem, updatedSession: StudentExamSession | null) => void;
}

export const LiveStudentEditModal: React.FC<LiveStudentEditModalProps> = ({
  isOpen,
  onClose,
  exam,
  studentRow,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<"identity" | "answers">("identity");

  // Identity Form State
  const [studentName, setStudentName] = useState("");
  const [nisn, setNisn] = useState("");
  const [className, setClassName] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [examStatus, setExamStatus] = useState<"not_started" | "in_progress" | "submitted">("not_started");
  const [violationCount, setViolationCount] = useState(0);

  // Scores & Answers State
  const [answers, setAnswers] = useState<Record<string, StudentAnswerItem>>({});
  const [totalScoreEarned, setTotalScoreEarned] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [passed, setPassed] = useState(false);
  const [aiRemediation, setAiRemediation] = useState("");

  useEffect(() => {
    if (studentRow) {
      const { tokenItem, session } = studentRow;
      setStudentName(session?.studentName || tokenItem.studentName || "");
      setNisn(session?.nisn || tokenItem.nisn || "");
      setClassName(session?.className || tokenItem.className || "");
      setTokenValue(tokenItem.token || session?.token || exam.sessionToken);
      
      const currentStatus = session?.status || "not_started";
      setExamStatus(currentStatus);
      setViolationCount(session?.violationCount || session?.cheatViolations?.length || 0);

      const existingAnswers = session?.answers ? JSON.parse(JSON.stringify(session.answers)) : {};
      setAnswers(existingAnswers);
      setTotalScoreEarned(session?.totalScoreEarned || 0);
      setPercentage(session?.percentage || 0);
      setPassed(session?.passed || false);
      setAiRemediation(session?.aiRemediation || "");
      setActiveTab("identity");
    }
  }, [studentRow, exam]);

  if (!isOpen || !studentRow) return null;

  const maxScore = exam.totalScore || 100;
  const passingGrade = exam.teacherProfile?.passingGrade || 75;

  const recalculateScores = (newAnswers: Record<string, StudentAnswerItem>) => {
    let earned = 0;
    exam.questions.forEach((q) => {
      const ans = newAnswers[q.id];
      if (ans && typeof ans.scoreEarned === "number") {
        earned += ans.scoreEarned;
      } else if (ans?.isCorrect || ans?.selectedOption === q.correctAnswer) {
        earned += q.score;
      }
    });

    const calcPct = maxScore > 0 ? Math.round((earned / maxScore) * 100) : 0;
    const isPassed = calcPct >= passingGrade;

    setTotalScoreEarned(earned);
    setPercentage(calcPct);
    setPassed(isPassed);
  };

  const handleToggleAnswerCorrect = (questionId: string, currentCorrect: boolean, qScore: number) => {
    const nextCorrect = !currentCorrect;
    const newAnswers = {
      ...answers,
      [questionId]: {
        ...(answers[questionId] || {
          questionId,
          selectedOption: "-",
          isFlagged: false,
        }),
        isCorrect: nextCorrect,
        scoreEarned: nextCorrect ? qScore : 0,
      },
    };
    setAnswers(newAnswers);
    recalculateScores(newAnswers);
  };

  const handleCustomScoreChange = (questionId: string, customScore: number, maxQScore: number) => {
    const validScore = Math.max(0, Math.min(customScore, maxQScore));
    const newAnswers = {
      ...answers,
      [questionId]: {
        ...(answers[questionId] || {
          questionId,
          selectedOption: "-",
          isFlagged: false,
        }),
        scoreEarned: validScore,
        isCorrect: validScore > 0,
      },
    };
    setAnswers(newAnswers);
    recalculateScores(newAnswers);
  };

  const handleResetViolations = () => {
    setViolationCount(0);
  };

  const handleSave = () => {
    const trimmedName = studentName.trim() || "Siswa Tanpa Nama";
    const trimmedNisn = nisn.trim() || "0000000000";
    const trimmedClass = className.trim() || "Kelas";
    const trimmedToken = tokenValue.trim().toUpperCase() || exam.sessionToken;

    // Updated token object
    const updatedToken: StudentTokenItem = {
      ...studentRow.tokenItem,
      studentName: trimmedName,
      nisn: trimmedNisn,
      className: trimmedClass,
      token: trimmedToken,
      examCode: exam.code,
      status: examStatus === "submitted" ? "selesai" : "active",
    };

    let updatedSession: StudentExamSession | null = null;

    if (examStatus === "not_started") {
      // If set to not started, remove session so student can start fresh
      updatedSession = null;
    } else {
      // Session exists or newly created
      const existingSession = studentRow.session;
      const startTime = existingSession?.startTime || new Date().toISOString();
      const submitTime = examStatus === "submitted"
        ? (existingSession?.submitTime || new Date().toISOString())
        : undefined;

      updatedSession = {
        id: existingSession?.id || `sess-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        examId: exam.id,
        examCode: exam.code,
        examTitle: exam.title,
        subject: exam.subject,
        studentName: trimmedName,
        nisn: trimmedNisn,
        className: trimmedClass,
        token: trimmedToken,
        currentSlideIndex: existingSession?.currentSlideIndex || 0,
        timeSpentSeconds: existingSession?.timeSpentSeconds || 0,
        startTime,
        submitTime,
        status: examStatus,
        answers,
        totalScoreEarned,
        maxScore,
        percentage,
        passed,
        violationCount,
        cheatViolations: violationCount === 0 ? [] : (existingSession?.cheatViolations || []),
        aiRemediation: aiRemediation.trim() || undefined,
      };
    }

    onSave(updatedToken, updatedSession);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#121214] border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#161618]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Edit Data & Pengaturan Sesi Siswa
              </h3>
              <p className="text-xs text-slate-400">
                Aksi Pengawas: Kelola identitas, token, status pengerjaan, nilai, dan pelanggaran.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-[#141416] px-6">
          <button
            type="button"
            onClick={() => setActiveTab("identity")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "identity"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <User className="w-4 h-4" />
            <span>1. Identitas & Status Ujian</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("answers")}
            className={`py-3 px-4 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors cursor-pointer ${
              activeTab === "answers"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Award className="w-4 h-4" />
            <span>2. Koreksi Jawaban & Nilai ({percentage}/100)</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {activeTab === "identity" && (
            <div className="space-y-6 animate-in fade-in">
              {/* Identity Inputs */}
              <div className="bg-[#18181b] p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span>Informasi Peserta Ujian</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Nama Lengkap Siswa</label>
                    <input
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#202024] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-medium"
                      placeholder="Masukkan nama lengkap siswa..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Nomor Induk Siswa Nasional (NISN)</label>
                    <input
                      type="text"
                      value={nisn}
                      onChange={(e) => setNisn(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#202024] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                      placeholder="0012345678"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Kelas / Rombongan Belajar</label>
                    <input
                      type="text"
                      value={className}
                      onChange={(e) => setClassName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-[#202024] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
                      placeholder="Contoh: VI-A atau 10 MIPA 1"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
                      <span>Token Akses Siswa</span>
                      <span className="text-[10px] text-slate-400">Master: {exam.sessionToken}</span>
                    </label>
                    <input
                      type="text"
                      value={tokenValue}
                      onChange={(e) => setTokenValue(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 bg-[#202024] border border-slate-700 rounded-xl text-xs text-amber-400 focus:outline-none focus:border-amber-500 font-mono font-bold tracking-widest"
                      placeholder="TOKEN"
                    />
                  </div>
                </div>
              </div>

              {/* Status Control */}
              <div className="bg-[#18181b] p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span>Status Pengerjaan Ujian Siswa</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setExamStatus("not_started")}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      examStatus === "not_started"
                        ? "bg-slate-800 border-slate-500 text-white shadow-md"
                        : "bg-[#141416] border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-xs">Belum Mulai</div>
                    <div className="text-[10px] text-slate-400 mt-1">Siswa belum login / sesi dibersihkan</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExamStatus("in_progress")}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      examStatus === "in_progress"
                        ? "bg-amber-500/15 border-amber-500 text-amber-300 shadow-md"
                        : "bg-[#141416] border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span>Sedang Mengerjakan</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Siswa sedang dalam ruang tes aktif</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExamStatus("submitted")}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      examStatus === "submitted"
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-md"
                        : "bg-[#141416] border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Selesai (Submit)</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">Ujian selesai & nilai terhitung</div>
                  </button>
                </div>
              </div>

              {/* Integrity Violations Adjuster */}
              <div className="bg-[#18181b] p-5 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span className="text-xs font-bold text-slate-300">Catatan Pelanggaran Layar (Tab Switch)</span>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    violationCount > 0 ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300"
                  }`}>
                    {violationCount}x Pelanggaran
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Jika siswa tidak sengaja memencet tombol notifikasi atau terjadi kesalahan teknis perangkat, pengawas dapat menghapus atau mereset peringatan integritas ini.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleResetViolations}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Pelanggaran Jadi 0 (Bersih)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViolationCount((prev) => prev + 1)}
                    className="px-3 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                  >
                    + Tambah Catatan Pelanggaran
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "answers" && (
            <div className="space-y-6 animate-in fade-in">
              {/* Score Summary Box */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#18181b] p-4 rounded-2xl border border-slate-800 text-center">
                <div className="p-2">
                  <div className="text-[11px] text-slate-400">Total Skor Diperoleh</div>
                  <div className="text-xl font-black text-indigo-400 mt-0.5 font-mono">
                    {totalScoreEarned} <span className="text-xs text-slate-500 font-normal">/ {maxScore}</span>
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[11px] text-slate-400">Nilai Akhir (Skala 100)</div>
                  <div className="text-2xl font-black text-white mt-0.5 font-mono">
                    {percentage}
                  </div>
                </div>
                <div className="p-2">
                  <div className="text-[11px] text-slate-400">KKM Naskah</div>
                  <div className="text-base font-bold text-slate-300 mt-1 font-mono">{passingGrade}</div>
                </div>
                <div className="p-2">
                  <div className="text-[11px] text-slate-400">Status Kelulusan</div>
                  <div className={`text-xs font-bold mt-1.5 px-2 py-0.5 rounded-full inline-block ${
                    passed ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}>
                    {passed ? "TUNTAS" : "REMEDIAL"}
                  </div>
                </div>
              </div>

              {/* Question list for manual grading */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Koreksi & Sesuaikan Poin Tiap Butir Soal ({exam.questions.length} Soal):</span>
                  <span className="text-[11px] text-slate-400 font-normal">Klik tombol status untuk mengubah instan</span>
                </div>

                <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                  {exam.questions.map((q, idx) => {
                    const ans = answers[q.id];
                    const selected = ans?.selectedOption || "-";
                    const isCorrect = ans?.isCorrect || (selected.toUpperCase() === q.correctAnswer.toUpperCase() && selected !== "-");
                    const currentScore = typeof ans?.scoreEarned === "number" ? ans.scoreEarned : (isCorrect ? q.score : 0);

                    return (
                      <div
                        key={q.id}
                        className={`p-3.5 rounded-2xl border transition-colors ${
                          isCorrect ? "bg-emerald-500/5 border-emerald-500/30" : "bg-rose-500/5 border-rose-500/20"
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs font-mono text-indigo-400">#{idx + 1}</span>
                              <span className="text-xs text-white font-medium line-clamp-1">{q.questionText}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                              <span>Jawaban Siswa: <strong className="text-white bg-slate-800 px-1.5 py-0.5 rounded">{selected}</strong></span>
                              <span>Kunci: <strong className="text-indigo-300 bg-indigo-950/60 px-1.5 py-0.5 rounded">{q.correctAnswer}</strong></span>
                              <span>Maks: {q.score} Poin</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleAnswerCorrect(q.id, isCorrect, q.score)}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                                isCorrect
                                  ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                                  : "bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40"
                              }`}
                            >
                              {isCorrect ? <CheckCircle2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                              <span>{isCorrect ? "Benar" : "Salah"}</span>
                            </button>

                            <div className="flex items-center gap-1 bg-[#141416] px-2 py-1 rounded-xl border border-slate-700">
                              <span className="text-[10px] text-slate-400">Poin:</span>
                              <input
                                type="number"
                                min={0}
                                max={q.score}
                                value={currentScore}
                                onChange={(e) => handleCustomScoreChange(q.id, parseInt(e.target.value) || 0, q.score)}
                                className="w-12 text-center text-xs font-bold bg-[#202024] border border-slate-600 rounded-lg text-white py-0.5 focus:outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Remedial Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Catatan Pengawas / Rekomendasi Remedial</span>
                </label>
                <textarea
                  value={aiRemediation}
                  onChange={(e) => setAiRemediation(e.target.value)}
                  rows={3}
                  className="w-full p-3 bg-[#18181b] border border-slate-700 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-indigo-500 placeholder-slate-500"
                  placeholder="Ketik catatan evaluasi atau materi pendalaman yang perlu dipelajari siswa..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#161618] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg shadow-indigo-950 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Perubahan</span>
          </button>
        </div>
      </div>
    </div>
  );
};
