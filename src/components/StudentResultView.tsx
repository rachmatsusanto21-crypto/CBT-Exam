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
  GraduationCap
} from "lucide-react";
import { ExamPackage, StudentExamSession } from "../types";
import { generateStudentRemediation } from "../utils/geminiApi";

interface StudentResultViewProps {
  session: StudentExamSession;
  exam: ExamPackage;
  onExit: () => void;
}

export const StudentResultView: React.FC<StudentResultViewProps> = ({
  session,
  exam,
  onExit,
}) => {
  const [isAnalyzingAi, setIsAnalyzingAi] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(session.aiRemediation || null);
  const [activeTab, setActiveTab] = useState<"summary" | "review">("summary");

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
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      topicTag: q.topicTag,
    }));

  const handleGenerateAiRemediation = async () => {
    setIsAnalyzingAi(true);
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

  return (
    <div id="student-result-view" className="max-w-4xl mx-auto space-y-6 py-6">
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

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto pt-2">
          <div className="p-3 bg-[#161618] rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Benar</div>
            <div className="text-xl font-extrabold text-emerald-400 flex items-center justify-center gap-1 mt-1">
              <CheckCircle className="w-4 h-4" />
              <span>{correctCount} Soal</span>
            </div>
          </div>

          <div className="p-3 bg-[#161618] rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Salah</div>
            <div className="text-xl font-extrabold text-rose-400 flex items-center justify-center gap-1 mt-1">
              <XCircle className="w-4 h-4" />
              <span>{incorrectCount} Soal</span>
            </div>
          </div>

          <div className="p-3 bg-[#161618] rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Durasi Ujian</div>
            <div className="text-xl font-extrabold text-slate-200 flex items-center justify-center gap-1 mt-1">
              <Clock className="w-4 h-4 text-slate-400" />
              <span>{durationMinutes} Menit</span>
            </div>
          </div>

          <div className="p-3 bg-[#161618] rounded-2xl border border-slate-800">
            <div className="text-xs text-slate-400 font-medium">Akurasi</div>
            <div className="text-xl font-extrabold text-indigo-400 flex items-center justify-center gap-1 mt-1">
              <Award className="w-4 h-4 text-indigo-400" />
              <span>{session.percentage}%</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap justify-center gap-3 pt-4 border-t border-slate-800">
          <button
            onClick={() => setActiveTab("summary")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              activeTab === "summary"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                : "bg-[#1a1a1c] text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-700"
            }`}
          >
            Ringkasan & Remedial AI
          </button>
          {exam.allowReviewExplanation && (
            <button
              onClick={() => setActiveTab("review")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === "review"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                  : "bg-[#1a1a1c] text-slate-400 hover:bg-slate-800 hover:text-white border border-slate-700"
              }`}
            >
              Pembahasan Lengkap Butir Soal
            </button>
          )}
          <button
            onClick={handlePrintResult}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-indigo-400" />
            <span>Cetak Kartu Hasil</span>
          </button>
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-md shadow-indigo-950"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke Menu Utama</span>
          </button>
        </div>
      </div>

      {/* Tab Content: Summary & AI Remediation */}
      {activeTab === "summary" && (
        <div className="space-y-6">
          {/* AI Remediation Box */}
          <div className="bg-[#121214] rounded-3xl p-6 border border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
                <span>Analisis Pembelajaran & Remedial Cerdas Gemini AI</span>
              </div>
              <button
                id="generate-remediation-btn"
                onClick={handleGenerateAiRemediation}
                disabled={isAnalyzingAi}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md shadow-indigo-950"
              >
                {isAnalyzingAi ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menganalisis Jawaban...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{aiAnalysis ? "Perbarui Rekomendasi" : "Buat Rekomendasi Remedial AI"}</span>
                  </>
                )}
              </button>
            </div>

            {aiAnalysis ? (
              <div className="bg-[#161618] rounded-2xl p-5 border border-slate-800 text-slate-200 text-sm leading-relaxed whitespace-pre-line space-y-2">
                {aiAnalysis}
              </div>
            ) : (
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
              const isRight = studentAnswerObj?.isCorrect || studentAns === q.correctAnswer;

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
                      <span className="text-slate-400">Jawaban Anda: </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          isRight
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                        }`}
                      >
                        {studentAns} ({isRight ? "Benar" : "Salah"})
                      </span>
                      <span className="bg-[#1a1a1c] text-slate-300 border border-slate-700 px-2 py-0.5 rounded">
                        Kunci: {q.correctAnswer}
                      </span>
                    </div>
                  </div>

                  {q.stimulus && (
                    <div className="p-3 bg-[#161618] rounded-xl border border-slate-800 text-xs text-slate-300 italic">
                      {q.stimulus}
                    </div>
                  )}

                  <p className="text-sm font-semibold text-white">{q.questionText}</p>

                  <div className="space-y-2">
                    {q.options.map((opt) => {
                      const isCorrectKey = opt.key === q.correctAnswer;
                      const isStudentSelected = opt.key === studentAns;

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

                  <div className="p-3.5 bg-indigo-500/10 rounded-xl border border-indigo-500/20 text-xs text-slate-300 space-y-1">
                    <span className="font-bold text-indigo-300 block">Pembahasan Guru / AI:</span>
                    <p className="text-slate-300 leading-relaxed">{q.explanation}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
