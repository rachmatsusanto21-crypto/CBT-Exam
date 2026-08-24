import React, { useState, useEffect } from "react";
import {
  X,
  Save,
  CheckCircle2,
  XCircle,
  Award,
  User,
  BookOpen,
  HelpCircle,
  Sparkles,
  AlertCircle
} from "lucide-react";
import { ExamPackage, StudentAnswerItem, StudentExamSession } from "../types";

interface StudentGradeEditModalProps {
  session: StudentExamSession | null;
  exam: ExamPackage;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedSession: StudentExamSession) => void;
}

export const StudentGradeEditModal: React.FC<StudentGradeEditModalProps> = ({
  session,
  exam,
  isOpen,
  onClose,
  onSave,
}) => {
  const [studentName, setStudentName] = useState("");
  const [nisn, setNisn] = useState("");
  const [className, setClassName] = useState("");
  const [answers, setAnswers] = useState<Record<string, StudentAnswerItem>>({});
  const [totalScoreEarned, setTotalScoreEarned] = useState(0);
  const [percentage, setPercentage] = useState(0);
  const [passed, setPassed] = useState(false);
  const [aiRemediation, setAiRemediation] = useState("");

  useEffect(() => {
    if (session) {
      setStudentName(session.studentName);
      setNisn(session.nisn);
      setClassName(session.className);
      setAnswers(JSON.parse(JSON.stringify(session.answers || {})));
      setTotalScoreEarned(session.totalScoreEarned);
      setPercentage(session.percentage);
      setPassed(session.passed);
      setAiRemediation(session.aiRemediation || "");
    }
  }, [session]);

  if (!isOpen || !session) return null;

  const maxScore = exam.totalScore || 100;
  const passingGrade = exam.teacherProfile.passingGrade || 75;

  const recalculateScores = (newAnswers: Record<string, StudentAnswerItem>) => {
    let earned = 0;
    exam.questions.forEach((q) => {
      const ans = newAnswers[q.id];
      if (ans && typeof ans.scoreEarned === "number") {
        earned += ans.scoreEarned;
      } else if (ans?.isCorrect) {
        earned += q.score;
      }
    });

    const calculatedPercentage = maxScore > 0 ? Math.round((earned / maxScore) * 100) : 0;
    const isPassed = calculatedPercentage >= passingGrade;

    setTotalScoreEarned(earned);
    setPercentage(calculatedPercentage);
    setPassed(isPassed);
  };

  const handleToggleCorrect = (questionId: string, currentCorrect: boolean, defaultScore: number) => {
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
        scoreEarned: nextCorrect ? defaultScore : 0,
      },
    };
    setAnswers(newAnswers);
    recalculateScores(newAnswers);
  };

  const handleScoreChange = (questionId: string, score: number, maxQuestionScore: number) => {
    const boundedScore = Math.max(0, Math.min(score, maxQuestionScore));
    const newAnswers = {
      ...answers,
      [questionId]: {
        ...(answers[questionId] || {
          questionId,
          selectedOption: "-",
          isFlagged: false,
        }),
        scoreEarned: boundedScore,
        isCorrect: boundedScore > 0,
      },
    };
    setAnswers(newAnswers);
    recalculateScores(newAnswers);
  };

  const handleSave = () => {
    const updated: StudentExamSession = {
      ...session,
      studentName: studentName.trim(),
      nisn: nisn.trim(),
      className: className.trim(),
      answers,
      totalScoreEarned,
      maxScore,
      percentage,
      passed,
      aiRemediation: aiRemediation.trim() || undefined,
    };
    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#121214] border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#161618]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">
                Edit Nilai & Koreksi Jawaban Siswa
              </h3>
              <p className="text-xs text-slate-400">
                Ubah identitas, nilai per butir soal, atau catatan remedial untuk siswa ini.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Student Identity Form */}
          <div className="bg-[#161618] rounded-2xl p-5 border border-slate-800 space-y-4">
            <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-400" />
              <span>Identitas Peserta Ujian</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Nama Siswa</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-700 rounded-xl text-white font-semibold focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">NISN</label>
                <input
                  type="text"
                  value={nisn}
                  onChange={(e) => setNisn(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-700 rounded-xl text-white font-mono focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Kelas / Rombel</label>
                <input
                  type="text"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-700 rounded-xl text-white font-semibold focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Live Score Summary Bar */}
          <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <div>
                <div className="text-[11px] text-indigo-300 font-medium">Total Skor Perolehan</div>
                <div className="text-2xl font-black font-mono text-white">
                  {totalScoreEarned} <span className="text-xs text-slate-400 font-normal">/ {maxScore}</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-indigo-300 font-medium">Nilai Akhir (0-100)</div>
                <div className="text-2xl font-black font-mono text-indigo-400">{percentage}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  passed
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                }`}
              >
                {passed ? "✓ STATUS: TUNTAS" : "✗ STATUS: REMEDIAL"}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">KKM: {passingGrade}</span>
            </div>
          </div>

          {/* Per-Question Correction Matrix */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-400" />
                <span>Lembar Koreksi & Skor per Butir Soal ({exam.questions.length} Butir)</span>
              </div>
              <span className="text-[11px] text-slate-500">
                Klik tombol status atau ubah angka skor untuk koreksi manual
              </span>
            </div>

            <div className="space-y-2.5">
              {exam.questions.map((q, idx) => {
                const ans = answers[q.id];
                const selectedOpt = ans?.selectedOption || "Tidak Dijawab";
                const isCorrect = ans ? (ans.isCorrect ?? (ans.scoreEarned ? ans.scoreEarned > 0 : false)) : false;
                const scoreEarned = ans?.scoreEarned !== undefined ? ans.scoreEarned : (isCorrect ? q.score : 0);

                return (
                  <div
                    key={q.id}
                    className="p-4 rounded-xl border border-slate-800 bg-[#161618] hover:border-slate-700 transition-colors space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-slate-800 text-slate-200 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <div className="text-xs space-y-1">
                          <p className="text-slate-200 font-medium line-clamp-2">
                            {q.questionText}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 font-mono">
                            <span>Jawaban Siswa: <strong className="text-white">{selectedOpt}</strong></span>
                            <span>•</span>
                            <span>Kunci: <strong className="text-emerald-400">{q.correctAnswer}</strong></span>
                            <span>•</span>
                            <span>Tipe: <span className="text-indigo-300">{q.type}</span></span>
                          </div>
                        </div>
                      </div>

                      {/* Score Input & Toggle */}
                      <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleToggleCorrect(q.id, isCorrect, q.score)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                            isCorrect
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20"
                          }`}
                        >
                          {isCorrect ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Benar</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Salah</span>
                            </>
                          )}
                        </button>

                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] text-slate-400 font-medium">Skor:</label>
                          <input
                            type="number"
                            min={0}
                            max={q.score}
                            value={scoreEarned}
                            onChange={(e) =>
                              handleScoreChange(q.id, parseFloat(e.target.value) || 0, q.score)
                            }
                            className="w-16 px-2 py-1 bg-[#1a1a1c] border border-slate-700 rounded-lg text-white font-mono font-bold text-center text-xs focus:border-indigo-500 focus:outline-none"
                          />
                          <span className="text-[11px] text-slate-500 font-mono">/ {q.score}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Teacher / Remedial Notes */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Catatan Evaluasi Guru / Rekomendasi Remedial</span>
            </label>
            <textarea
              rows={3}
              value={aiRemediation}
              onChange={(e) => setAiRemediation(e.target.value)}
              placeholder="Tambahkan catatan khusus guru atau bimbingan perbaikan untuk siswa ini..."
              className="w-full px-4 py-2.5 bg-[#161618] border border-slate-800 rounded-2xl text-xs text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-800 bg-[#161618] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-950 transition-all cursor-pointer flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Simpan Perubahan Nilai</span>
          </button>
        </div>
      </div>
    </div>
  );
};
