import React, { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import {
  Award,
  CheckCircle,
  XCircle,
  Clock,
  Sparkles,
  RefreshCw,
  Printer,
  ChevronRight,
  BookOpen,
  ArrowLeft,
  GraduationCap,
  Image as ImageIcon,
  ArrowRightLeft,
  FileEdit,
  AlignLeft,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  RotateCcw,
  FlaskConical,
  AlertCircle
} from "lucide-react";
import { ExamPackage, StudentExamSession } from "../types";
import { generateStudentRemediation } from "../utils/geminiApi";
import { getExamHistory } from "../utils/storage";

interface StudentResultViewProps {
  session: StudentExamSession;
  exam: ExamPackage;
  onExit: () => void;
  isTeacherTrial?: boolean;
  isDirectLink?: boolean;
  onRetryTrial?: () => void;
}

export const StudentResultView: React.FC<StudentResultViewProps> = ({
  session,
  exam,
  onExit,
  isTeacherTrial = false,
  isDirectLink = false,
  onRetryTrial,
}) => {
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(session.aiRemediation || null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "review">("summary");
  const [showFinishedAlert, setShowFinishedAlert] = useState(false);

  useEffect(() => {
    // Trigger festive celebratory confetti
    if (session.passed) {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [session.passed]);

  const questionsList = session.shuffledQuestions && session.shuffledQuestions.length > 0
    ? session.shuffledQuestions
    : exam.questions;

  const wrongQuestions = questionsList
    .filter((q) => {
      const ans = session.answers[q.id];
      return !ans || !ans.isCorrect;
    })
    .map((q) => ({
      questionText: q.questionText,
      studentAnswer: session.answers[q.id]?.selectedOption || "Tidak Dijawab",
      correctAnswer: q.correctAnswer || (q.matchingPairs ? JSON.stringify(q.matchingPairs) : ""),
      explanation: q.explanation,
      topicTag: q.topicTag,
    }));

  const handleGenerateAiRemediation = async () => {
    setIsAnalyzingAi(true);
    setAiError(null);
    try {
      const result = await generateStudentRemediation({
        studentName: session.studentName,
        subject: exam.teacherProfile.subject,
        score: session.totalScoreEarned,
        maxScore: session.maxScore,
        wrongQuestions,
        totalQuestions: exam.questions.length,
      });

      if (result) {
        setAiAnalysis(result);
      }
    } catch (e: any) {
      console.error("AI Remediation failed", e);
      setAiError(e?.message || "Gagal mendapatkan analisis remedial dari AI. Silakan coba beberapa saat lagi.");
    } finally {
      setIsAnalyzingAi(false);
    }
  };

  const handlePrintResult = () => {
    window.print();
  };

  const correctCount = Object.values(session.answers).filter((a) => (a as any).isCorrect).length;
  const incorrectCount = questionsList.length - correctCount;
  const durationMinutes = Math.round(session.timeSpentSeconds / 60);

  // Compute Class Statistics for Bar Chart Comparison
  const allHistory = getExamHistory();
  const sameExamHistory = allHistory.filter(
    (h) => h.examCode === exam.code || h.className === session.className
  );
  
  const classScores = sameExamHistory.length > 0 
    ? sameExamHistory.map((h) => h.totalScoreEarned)
    : [Math.round(exam.teacherProfile.passingGrade + 2), Math.round(exam.teacherProfile.passingGrade - 5), session.totalScoreEarned];
  
  const classAvgScore = Math.round(
    classScores.reduce((acc, curr) => acc + curr, 0) / classScores.length
  );
  const highestClassScore = Math.max(...classScores, session.totalScoreEarned);
  const scoreDiff = session.totalScoreEarned - classAvgScore;
  const maxScale = Math.max(session.maxScore || 100, 100);

  return (
    <div id="student-result-view" className="max-w-4xl mx-auto space-y-6 py-6">
      {/* Teacher Trial Mode Info Banner */}
      {isTeacherTrial && (
        <div className="bg-amber-500/15 border border-amber-500/40 rounded-3xl p-5 text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <FlaskConical className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <span>Hasil Simulasi Uji Coba Guru</span>
                <span className="bg-amber-500/30 text-amber-100 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase">
                  Uji Coba Tanpa Batas
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-0.5">
                Nilai dan jawaban ini merupakan uji coba mandiri guru dan <strong>tidak dimasukkan</strong> ke rekap penilaian siswa. Anda dapat mengulang pengerjaan soal kapan pun tanpa batas.
              </p>
            </div>
          </div>

          {onRetryTrial && (
            <button
              onClick={onRetryTrial}
              className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-950 flex items-center gap-2 cursor-pointer shrink-0 self-end sm:self-center"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Ulangi Pengerjaan Soal</span>
            </button>
          )}
        </div>
      )}

      {/* Result Card Hero */}
      <div className="bg-[#121214] rounded-3xl p-8 border border-slate-800 shadow-xl relative overflow-hidden text-center space-y-6">
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#1a1a1c] border border-slate-700 rounded-full text-slate-300 text-xs font-semibold">
            <GraduationCap className="w-4 h-4 text-indigo-400" />
            <span>Hasil Penilaian Otomatis CBT</span>
          </div>

          <h1 className="text-3xl font-extrabold text-white">{session.studentName}</h1>
          <p className="text-slate-400 text-sm font-medium">
            {session.className} | NISN: {session.nisn} | {exam.title}
          </p>
        </div>

        {/* Score Ring Display */}
        <div className="flex flex-col items-center justify-center py-2">
          <div
            className={`w-36 h-36 rounded-full flex flex-col items-center justify-center border-8 shadow-inner transition-transform hover:scale-105 ${
              session.passed
                ? "border-emerald-500 bg-emerald-950/40 text-emerald-400"
                : "border-amber-500 bg-amber-950/40 text-amber-400"
            }`}
          >
            <span className="text-4xl font-black text-white">{session.percentage}</span>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Skor: {session.totalScoreEarned}/{session.maxScore}
            </span>
          </div>

          <div className="mt-4">
            <span
              className={`px-4 py-1.5 rounded-full font-bold text-sm uppercase tracking-wide ${
                session.passed
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
              }`}
            >
              {session.passed
                ? `TUNTAS (Memenuhi KKM ≥ ${exam.teacherProfile.passingGrade})`
                : `REMEDIAL (Belum Mencapai KKM ${exam.teacherProfile.passingGrade})`}
            </span>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto text-xs">
          <div className="bg-[#161618] p-3 rounded-2xl border border-slate-800">
            <span className="text-slate-400 block mb-1">Benar</span>
            <span className="text-lg font-bold text-emerald-400">{correctCount} Soal</span>
          </div>
          <div className="bg-[#161618] p-3 rounded-2xl border border-slate-800">
            <span className="text-slate-400 block mb-1">Belum Tepat</span>
            <span className="text-lg font-bold text-rose-400">{incorrectCount} Soal</span>
          </div>
          <div className="bg-[#161618] p-3 rounded-2xl border border-slate-800">
            <span className="text-slate-400 block mb-1">Durasi Pengerjaan</span>
            <span className="text-lg font-bold text-indigo-300">{durationMinutes} Menit</span>
          </div>
          <div className="bg-[#161618] p-3 rounded-2xl border border-slate-800">
            <span className="text-slate-400 block mb-1">Integritas Ujian</span>
            <span className="text-lg font-bold text-emerald-400">
              {(session.violationCount || 0) === 0 ? "100% Tertib" : `${session.violationCount}x Peringatan`}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {isTeacherTrial && onRetryTrial && (
            <button
              id="retry-teacher-trial-btn"
              onClick={onRetryTrial}
              className="flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-amber-950"
              title="Mulai ulang pengerjaan simulasi soal ini dari awal"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Ulangi Pengerjaan Soal (Uji Coba)</span>
            </button>
          )}

          <button
            onClick={handlePrintResult}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4 text-indigo-400" />
            <span>Cetak Lembar Nilai</span>
          </button>

          <button
            onClick={() => {
              if (isTeacherTrial) {
                if (typeof window !== "undefined") {
                  window.close();
                }
                onExit();
              } else {
                setShowFinishedAlert(true);
                if (typeof window !== "undefined") {
                  window.close();
                }
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-indigo-950"
          >
            <span>{isTeacherTrial ? "Selesai & Tutup Tab Simulasi" : "Ujian Telah Selesai (Tutup Tab)"}</span>
            <CheckCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Direct Student Mode Finished Alert Dialog */}
        {showFinishedAlert && (
          <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-left flex items-start gap-3 animate-in fade-in">
            <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div className="space-y-1.5 text-xs">
              <div className="font-bold text-emerald-300">
                Pengerjaan Ujian Telah Tersimpan Secara Resmi!
              </div>
              <p className="text-slate-300 leading-relaxed">
                Jawaban dan perolehan skor Anda telah berhasil dicatat ke sistem penilaian guru. Anda dapat meninjau pembahasan butir soal di bawah ini atau langsung menutup tab ini.
              </p>
              <div className="pt-1 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.close();
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Tutup Tab Ini Sekarang
                </button>
                <button
                  type="button"
                  onClick={() => setShowFinishedAlert(false)}
                  className="text-[11px] text-emerald-400 font-bold hover:underline cursor-pointer"
                >
                  Lihat Pembahasan di Bawah
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs Navigation: Summary vs Detailed Review */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("summary")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === "summary"
              ? "bg-indigo-600 text-white shadow-sm"
              : "bg-[#161618] text-slate-400 hover:text-white"
          }`}
        >
          Ringkasan & Diagnosis AI
        </button>

        {exam.allowReviewExplanation && (
          <button
            onClick={() => setActiveTab("review")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "review"
                ? "bg-indigo-600 text-white shadow-sm"
                : "bg-[#161618] text-slate-400 hover:text-white"
            }`}
          >
            Pembahasan Butir Soal ({questionsList.length})
          </button>
        )}
      </div>

      {/* Tab Content: Summary & Gemini AI Remediation */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* Bar Chart Summary: Student Score vs Class Average */}
          <div
            id="student-score-vs-class-barchart"
            className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Grafik Komparasi Skor Siswa vs Rata-Rata Kelas</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {scoreDiff > 0 ? (
                  <span className="flex items-center gap-1 font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <TrendingUp className="w-3.5 h-3.5" />
                    +{scoreDiff} Poin di atas rata-rata kelas
                  </span>
                ) : scoreDiff < 0 ? (
                  <span className="flex items-center gap-1 font-semibold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                    <TrendingDown className="w-3.5 h-3.5" />
                    {scoreDiff} Poin dari rata-rata kelas
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-semibold text-slate-400 bg-slate-800 px-2.5 py-0.5 rounded-full">
                    <Minus className="w-3.5 h-3.5" />
                    Setara rata-rata kelas
                  </span>
                )}
              </div>
            </div>

            {/* Horizontal Bar Visualizer */}
            <div className="space-y-4 pt-1">
              {/* Bar 1: Skor Anda */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-white flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                    <span>Skor Anda ({session.studentName})</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {session.totalScoreEarned} / {session.maxScore}
                  </span>
                </div>
                <div className="w-full bg-[#1a1a1c] h-5 rounded-xl overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className={`h-full rounded-lg transition-all duration-500 flex items-center justify-end px-2 ${
                      session.passed ? "bg-gradient-to-r from-emerald-600 to-teal-400" : "bg-gradient-to-r from-amber-600 to-rose-400"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(8, (session.totalScoreEarned / maxScale) * 100))}%` }}
                  >
                    <span className="text-[10px] font-bold text-white drop-shadow">
                      {Math.round((session.totalScoreEarned / maxScale) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Bar 2: Rata-Rata Kelas */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Rata-Rata Kelas ({session.className || "Angkatan"})</span>
                  </span>
                  <span className="font-mono font-bold text-indigo-300 text-sm">
                    {classAvgScore} / {session.maxScore}
                  </span>
                </div>
                <div className="w-full bg-[#1a1a1c] h-5 rounded-xl overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full rounded-lg bg-gradient-to-r from-indigo-600 to-indigo-400 transition-all duration-500 flex items-center justify-end px-2"
                    style={{ width: `${Math.min(100, Math.max(8, (classAvgScore / maxScale) * 100))}%` }}
                  >
                    <span className="text-[10px] font-bold text-white drop-shadow">
                      {Math.round((classAvgScore / maxScale) * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Bar 3: Batas Kelulusan KKM */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
                    <span>Batas KKM Minimum</span>
                  </span>
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    {exam.teacherProfile.passingGrade} / {session.maxScore}
                  </span>
                </div>
                <div className="w-full bg-[#1a1a1c] h-5 rounded-xl overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full rounded-lg bg-slate-700 transition-all duration-500 flex items-center justify-end px-2"
                    style={{ width: `${Math.min(100, Math.max(8, (exam.teacherProfile.passingGrade / maxScale) * 100))}%` }}
                  >
                    <span className="text-[10px] font-bold text-slate-300 drop-shadow">
                      {Math.round((exam.teacherProfile.passingGrade / maxScale) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Commentary Banner */}
            <div className="p-3 bg-[#161618] rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center justify-between flex-wrap gap-2">
              <span className="text-slate-400">
                Nilai Tertinggi di Kelas Saat Ini: <strong className="text-emerald-400 font-mono">{highestClassScore} Poin</strong>
              </span>
              <span className="text-indigo-400 font-medium">
                {session.totalScoreEarned >= classAvgScore
                  ? "Pencapaian luar biasa! Pertahankan konsistensi belajar Anda."
                  : "Tetap semangat! Pelajari materi pada rekomendasi diagnosis AI di bawah."}
              </span>
            </div>
          </div>

          {/* Gemini AI Remediation Card */}
          <div className="bg-[#121214] rounded-2xl p-6 border border-indigo-900/40 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Diagnosis Remedial & Rekomendasi Belajar AI</span>
              </div>

              <button
                onClick={handleGenerateAiRemediation}
                disabled={isAnalyzingAi}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                {isAnalyzingAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menganalisis...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{aiAnalysis ? "Analisis Ulang AI" : "Generate Analisis AI"}</span>
                  </>
                )}
              </button>
            </div>

            {aiError && (
              <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 flex-1">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                  <span className="leading-relaxed">{aiError}</span>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateAiRemediation}
                  disabled={isAnalyzingAi}
                  className="px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Coba Lagi
                </button>
              </div>
            )}

            {aiAnalysis ? (
              <div className="p-4 bg-[#161618] rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                {aiAnalysis}
              </div>
            ) : !aiError && (
              <p className="text-xs text-slate-400">
                Klik tombol di atas untuk mendapatkan evaluasi kelemahan konsep dan rekomendasi materi yang perlu dipelajari kembali berdasarkan butir soal yang dijawab salah.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: Question Review & Pembahasan */}
      {activeTab === "review" && exam.allowReviewExplanation && (
        <div className="space-y-4">
          <h3 className="text-base font-bold text-white px-1">
            Pembahasan dan Analisis Jawaban Siswa ({questionsList.length} Soal)
          </h3>

          <div className="space-y-4">
            {questionsList.map((q, idx) => {
              const studentAnswerObj = session.answers[q.id];
              const studentAns = studentAnswerObj?.selectedOption || "Kosong";
              const isRight = studentAnswerObj?.isCorrect;

              return (
                <div
                  key={q.id}
                  className={`bg-[#121214] rounded-2xl p-6 border shadow-sm space-y-4 ${
                    isRight ? "border-emerald-500/30" : "border-rose-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center text-white ${
                          isRight ? "bg-emerald-600" : "bg-rose-600"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-400">
                        {q.topicTag || "Umum"} | {q.cognitiveLevel || ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <span className="text-slate-400">Status: </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          isRight
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {isRight ? "Benar" : "Perlu Evaluasi"}
                      </span>
                      <span className="bg-[#1a1a1c] text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                        Skor: {studentAnswerObj?.scoreEarned || 0} / {q.score}
                      </span>
                    </div>
                  </div>

                  {q.stimulus && (
                    <div className="p-3 bg-[#161618] rounded-xl border border-slate-800 text-xs text-slate-300 italic">
                      {q.stimulus}
                    </div>
                  )}

                  {q.imageUrl && (
                    <div className="p-2 bg-black/60 rounded-xl border border-slate-800 max-h-56 flex items-center justify-center overflow-hidden">
                      <img src={q.imageUrl} alt="Visual Soal" className="max-h-52 object-contain rounded-lg" />
                    </div>
                  )}

                  <p className="text-sm font-semibold text-white">{q.questionText}</p>

                  {/* Options display for multiple choice */}
                  {(!q.type || q.type === "pilihan_ganda" || q.type === "pilihan_ganda_kompleks" || q.type === "benar_salah") && (
                    <div className="space-y-2">
                      {q.options.map((opt) => {
                        const isCorrectKey = opt.key.toUpperCase() === q.correctAnswer.toUpperCase();
                        const isStudentSelected = opt.key.toUpperCase() === studentAns.toUpperCase();

                        let optStyle = "bg-[#161618] border-slate-800 text-slate-300";
                        if (isCorrectKey) {
                          optStyle = "bg-emerald-950/40 border-emerald-500/50 text-emerald-200 font-semibold";
                        } else if (isStudentSelected && !isRight) {
                          optStyle = "bg-rose-950/40 border-rose-500/50 text-rose-200 font-semibold";
                        }

                        return (
                          <div
                            key={opt.key}
                            className={`p-3 rounded-xl border text-xs flex items-center justify-between ${optStyle}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded font-bold flex items-center justify-center bg-[#222226] text-slate-200 border border-slate-700">
                                {opt.key}
                              </span>
                              <span>{opt.text}</span>
                            </div>

                            {isCorrectKey && (
                              <span className="text-[11px] font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded">
                                KUNCI JAWABAN
                              </span>
                            )}
                            {isStudentSelected && !isCorrectKey && (
                              <span className="text-[11px] font-bold text-rose-400 px-2 py-0.5 bg-rose-500/20 border border-rose-500/30 rounded">
                                PILIHAN ANDA
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Matching Pairs review */}
                  {q.type === "menjodohkan" && (
                    <div className="p-3 bg-[#161618] rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div className="font-bold text-slate-300">Pasangan Kunci Jawaban yang Benar:</div>
                      <div className="space-y-1">
                        {(q.matchingPairs || []).map((p, pIdx) => (
                          <div key={p.id || pIdx} className="flex items-center justify-between p-2 bg-[#121214] rounded-lg border border-slate-800">
                            <span className="text-slate-200">{p.left}</span>
                            <span className="text-emerald-400 font-bold">↔ {p.right}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Short Answer review */}
                  {q.type === "isian_singkat" && (
                    <div className="p-3 bg-[#161618] rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400">Jawaban Anda: </span>
                        <strong className={isRight ? "text-emerald-400" : "text-rose-400"}>{studentAns || "Kosong"}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400">Kunci Jawaban Acuan: </span>
                        <strong className="text-emerald-400">{q.correctAnswer}</strong>
                      </div>
                    </div>
                  )}

                  {/* Essay review */}
                  {q.type === "uraian" && (
                    <div className="p-3 bg-[#161618] rounded-xl border border-slate-800 space-y-2 text-xs">
                      <div>
                        <span className="text-slate-400 block mb-1 font-semibold">Jawaban Uraian Anda:</span>
                        <p className="p-2.5 bg-[#121214] rounded-lg border border-slate-800 text-slate-200 leading-relaxed whitespace-pre-line">
                          {studentAns || "Tidak ada jawaban tertulis."}
                        </p>
                      </div>
                      {q.sampleAnswer && (
                        <div>
                          <span className="text-indigo-400 block mb-1 font-semibold">Rubrik Penilaian Acuan:</span>
                          <p className="p-2.5 bg-[#121214] rounded-lg border border-indigo-500/20 text-slate-300 leading-relaxed">
                            {q.sampleAnswer}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {q.explanation && (
                    <div className="p-3.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-xs text-slate-300 space-y-1">
                      <span className="font-bold text-indigo-300 block">Pembahasan Guru / AI:</span>
                      <p className="text-slate-300 leading-relaxed">{q.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
