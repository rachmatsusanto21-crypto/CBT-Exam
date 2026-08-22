import React, { useState, useEffect } from "react";
import {
  Sparkles,
  BookOpen,
  HelpCircle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit3,
  Layers,
  ArrowRight,
  Sliders,
  RefreshCw,
  FileText,
  AlertCircle,
  Key,
  Shuffle,
  ShieldCheck,
  ShieldAlert
} from "lucide-react";
import { ExamPackage, Question, QuestionOption, QuestionType } from "../types";
import { getGeminiRequestHeaders, getCustomGeminiApiKey } from "../utils/storage";

interface AIGeneratorAndEditorProps {
  activeExam: ExamPackage;
  onUpdateExam: (updated: ExamPackage) => void;
  onPreviewSlides: () => void;
  onOpenGeminiModal?: () => void;
}

export const AIGeneratorAndEditor: React.FC<AIGeneratorAndEditorProps> = ({
  activeExam,
  onUpdateExam,
  onPreviewSlides,
  onOpenGeminiModal,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccessMsg, setAiSuccessMsg] = useState<string | null>(null);

  // AI Generator Form State
  const [subject, setSubject] = useState(activeExam.teacherProfile.subject || "Informatika");
  const [gradeLevel, setGradeLevel] = useState(activeExam.teacherProfile.gradeLevel || "Kelas X");
  const [topic, setTopic] = useState("Kecerdasan Buatan & Berpikir Komputasional");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState("sedang");
  const [questionType, setQuestionType] = useState<QuestionType>("pilihan_ganda");
  const [defaultScore, setDefaultScore] = useState(20);
  const [instructions, setInstructions] = useState("Sajikan soal berbasis stimulus studi kasus kontekstual dan level kognitif HOTS");

  // Selected / Editing Question
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(activeExam.questions[0]?.id || "");
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(activeExam.questions[0] || null);

  useEffect(() => {
    if (activeExam.questions.length > 0) {
      const found = activeExam.questions.find((q) => q.id === selectedQuestionId) || activeExam.questions[0];
      setSelectedQuestionId(found.id);
      setEditingQuestion({ ...found });
    } else {
      setSelectedQuestionId("");
      setEditingQuestion(null);
    }
  }, [activeExam.id]);

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    setAiError(null);
    setAiSuccessMsg(null);

    try {
      const headers = getGeminiRequestHeaders();
      const res = await fetch("/api/gemini/generate-questions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          subject,
          gradeLevel,
          topic,
          count: Number(count),
          difficulty,
          questionType,
          additionalInstructions: instructions,
          defaultScorePerQuestion: Number(defaultScore),
        }),
      });

      const json = await res.json();
      if (!json.success || !json.data) {
        throw new Error(json.error || "Gagal menghasilkan soal dari Gemini AI.");
      }

      const generatedQuestions: Question[] = json.data.questions.map((q: any, idx: number) => ({
        id: `q-ai-${Date.now()}-${idx + 1}`,
        questionNumber: activeExam.questions.length + idx + 1,
        stimulus: q.stimulus || "",
        questionText: q.questionText,
        type: (q.type as QuestionType) || "pilihan_ganda",
        options: q.options || [
          { key: "A", text: "Opsi A" },
          { key: "B", text: "Opsi B" },
          { key: "C", text: "Opsi C" },
          { key: "D", text: "Opsi D" },
        ],
        correctAnswer: q.correctAnswer || "A",
        score: q.score || defaultScore,
        explanation: q.explanation || "Pembahasan otomatis AI",
        cognitiveLevel: q.cognitiveLevel || "C4 - HOTS",
        topicTag: q.topicTag || topic,
      }));

      const newQuestions = [...activeExam.questions, ...generatedQuestions].map((q, i) => ({
        ...q,
        questionNumber: i + 1,
      }));

      const totalScore = newQuestions.reduce((acc, q) => acc + (q.score || 0), 0);

      const updatedExam: ExamPackage = {
        ...activeExam,
        title: json.data.examTitle ? `${json.data.examTitle}` : activeExam.title,
        questions: newQuestions,
        totalScore,
        updatedAt: new Date().toISOString(),
      };

      onUpdateExam(updatedExam);
      setAiSuccessMsg(`Berhasil membuat ${generatedQuestions.length} butir soal baru dengan Gemini AI!`);
      if (generatedQuestions[0]) {
        setSelectedQuestionId(generatedQuestions[0].id);
        setEditingQuestion(generatedQuestions[0]);
      }
    } catch (err: any) {
      setAiError(err.message || "Terjadi kesalahan saat memanggil Gemini API.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveQuestionEdit = () => {
    if (!editingQuestion) return;
    const updatedList = activeExam.questions.map((q) =>
      q.id === editingQuestion.id ? editingQuestion : q
    );
    const totalScore = updatedList.reduce((acc, q) => acc + (q.score || 0), 0);
    onUpdateExam({
      ...activeExam,
      questions: updatedList,
      totalScore,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAddNewQuestionManual = () => {
    const newNum = activeExam.questions.length + 1;
    const newQ: Question = {
      id: `q-man-${Date.now()}`,
      questionNumber: newNum,
      stimulus: "",
      questionText: `Pertanyaan butir nomor ${newNum}`,
      type: "pilihan_ganda",
      options: [
        { key: "A", text: "Pilihan Jawaban A" },
        { key: "B", text: "Pilihan Jawaban B" },
        { key: "C", text: "Pilihan Jawaban C" },
        { key: "D", text: "Pilihan Jawaban D" },
        { key: "E", text: "Pilihan Jawaban E" },
      ],
      correctAnswer: "A",
      score: 20,
      explanation: "Pembahasan untuk pertanyaan ini.",
      cognitiveLevel: "C3 - Menerapkan",
      topicTag: topic || "Umum",
    };

    const newQuestions = [...activeExam.questions, newQ];
    const totalScore = newQuestions.reduce((acc, q) => acc + q.score, 0);

    onUpdateExam({
      ...activeExam,
      questions: newQuestions,
      totalScore,
      updatedAt: new Date().toISOString(),
    });

    setSelectedQuestionId(newQ.id);
    setEditingQuestion(newQ);
  };

  const handleDeleteQuestion = (id: string) => {
    if (activeExam.questions.length <= 1) {
      alert("Naskah soal minimal harus memiliki 1 butir pertanyaan.");
      return;
    }
    const filtered = activeExam.questions
      .filter((q) => q.id !== id)
      .map((q, idx) => ({ ...q, questionNumber: idx + 1 }));

    const totalScore = filtered.reduce((acc, q) => acc + q.score, 0);

    onUpdateExam({
      ...activeExam,
      questions: filtered,
      totalScore,
      updatedAt: new Date().toISOString(),
    });

    if (filtered[0]) {
      setSelectedQuestionId(filtered[0].id);
      setEditingQuestion(filtered[0]);
    }
  };

  const updateOptionText = (key: string, text: string) => {
    if (!editingQuestion) return;
    const updatedOptions = editingQuestion.options.map((opt) =>
      opt.key === key ? { ...opt, text } : opt
    );
    setEditingQuestion({ ...editingQuestion, options: updatedOptions });
  };

  const handleToggleShuffleQuestions = () => {
    const nextState = !activeExam.shuffleQuestions;
    const updated: ExamPackage = {
      ...activeExam,
      shuffleQuestions: nextState,
      updatedAt: new Date().toISOString(),
    };
    onUpdateExam(updated);
  };

  const handleToggleShuffleOptions = () => {
    const nextState = !activeExam.shuffleOptions;
    const updated: ExamPackage = {
      ...activeExam,
      shuffleOptions: nextState,
      updatedAt: new Date().toISOString(),
    };
    onUpdateExam(updated);
  };

  const handleSetAllShuffle = (enable: boolean) => {
    const updated: ExamPackage = {
      ...activeExam,
      shuffleQuestions: enable,
      shuffleOptions: enable,
      updatedAt: new Date().toISOString(),
    };
    onUpdateExam(updated);
  };

  return (
    <div id="ai-generator-editor-view" className="space-y-6">
      {/* Header Info Card */}
      <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-medium text-xs">
            <Sparkles className="w-4 h-4" />
            <span>AI Question Engine & Slide Editor</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">{activeExam.title}</h2>
          <p className="text-slate-400 text-xs mt-1 flex flex-wrap items-center gap-2">
            <span>Kode: <span className="font-mono font-semibold bg-[#1a1a1c] border border-slate-800 text-indigo-300 px-2 py-0.5 rounded">{activeExam.code}</span></span>
            <span>•</span>
            <span>Mata Pelajaran: <span className="font-semibold text-slate-300">{activeExam.teacherProfile.subject}</span></span>
            <span>•</span>
            <span>Total: <span className="font-semibold text-indigo-400">{activeExam.questions.length} Soal ({activeExam.totalScore} Poin)</span></span>
            <span>•</span>
            <span
              onClick={handleToggleShuffleQuestions}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[11px] cursor-pointer transition-all ${
                activeExam.shuffleQuestions
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
              }`}
              title="Klik untuk ubah pengaturan acak soal"
            >
              <Shuffle className="w-3 h-3" />
              Acak Soal: {activeExam.shuffleQuestions ? "ON" : "OFF"}
            </span>
            <span
              onClick={handleToggleShuffleOptions}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[11px] cursor-pointer transition-all ${
                activeExam.shuffleOptions
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
              }`}
              title="Klik untuk ubah pengaturan acak opsi jawaban"
            >
              <ShieldCheck className="w-3 h-3" />
              Acak Opsi: {activeExam.shuffleOptions ? "ON" : "OFF"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="preview-slides-btn"
            onClick={onPreviewSlides}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-xs transition-all shadow-lg shadow-indigo-950 cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span>Tinjau Mode Slides</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Gemini AI Prompt Generator & Anti-Cheating Controls */}
        <div className="lg:col-span-4 space-y-6">
          {/* Anti-Cheating & Randomization Card */}
          <div
            id="anti-cheating-shuffling-card"
            className="bg-[#121214] rounded-2xl p-5 border border-indigo-500/30 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <div className="p-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span>Integritas Ujian & Pengacakan</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  activeExam.shuffleQuestions && activeExam.shuffleOptions
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : activeExam.shuffleQuestions || activeExam.shuffleOptions
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {activeExam.shuffleQuestions && activeExam.shuffleOptions
                  ? "Proteksi Penuh"
                  : activeExam.shuffleQuestions || activeExam.shuffleOptions
                  ? "Sebagian Aktif"
                  : "Urutan Statis"}
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Cegah siswa saling mencocokkan jawaban atau mencontek saat ujian serentak dengan mengacak nomor butir soal dan posisi abjad pilihan jawaban.
            </p>

            <div className="space-y-2.5">
              {/* Toggle 1: Acak Urutan Soal */}
              <div
                id="toggle-shuffle-questions-container"
                onClick={handleToggleShuffleQuestions}
                className="p-3 bg-[#161618] rounded-xl border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Shuffle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                      Acak Urutan Butir Soal
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Setiap siswa menerima urutan nomor soal yang berbeda secara acak.
                  </p>
                </div>

                <button
                  type="button"
                  id="toggle-shuffle-questions-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleShuffleQuestions();
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    activeExam.shuffleQuestions ? "bg-emerald-600" : "bg-slate-800"
                  }`}
                  role="switch"
                  aria-checked={activeExam.shuffleQuestions}
                  title={
                    activeExam.shuffleQuestions
                      ? "Klik untuk menonaktifkan pengacakan soal"
                      : "Klik untuk mengaktifkan pengacakan soal"
                  }
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      activeExam.shuffleQuestions ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 2: Acak Opsi Jawaban */}
              <div
                id="toggle-shuffle-options-container"
                onClick={handleToggleShuffleOptions}
                className="p-3 bg-[#161618] rounded-xl border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                      Acak Pilihan Jawaban (A-E)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Posisi abjad opsi A, B, C, D, E diacak per siswa tanpa mengubah kebenaran kunci.
                  </p>
                </div>

                <button
                  type="button"
                  id="toggle-shuffle-options-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleShuffleOptions();
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    activeExam.shuffleOptions ? "bg-emerald-600" : "bg-slate-800"
                  }`}
                  role="switch"
                  aria-checked={activeExam.shuffleOptions}
                  title={
                    activeExam.shuffleOptions
                      ? "Klik untuk menonaktifkan pengacakan pilihan"
                      : "Klik untuk mengaktifkan pengacakan pilihan"
                  }
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      activeExam.shuffleOptions ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Quick Bulk Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                id="enable-all-shuffle-btn"
                onClick={() => handleSetAllShuffle(true)}
                className="flex-1 py-1.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Aktifkan Semua (Anti-Contek)
              </button>
              <button
                type="button"
                id="disable-all-shuffle-btn"
                onClick={() => handleSetAllShuffle(false)}
                className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Reset Statis
              </button>
            </div>
          </div>

          {/* Gemini AI Prompt Generator Card */}
          <div className="bg-[#121214] rounded-2xl p-5 border border-indigo-900/40 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-sm">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span>Buat Soal Otomatis dengan Gemini AI</span>
              </div>
              {onOpenGeminiModal && (
                <button
                  type="button"
                  onClick={onOpenGeminiModal}
                  className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                  title="Pengaturan Kunci API Gemini"
                >
                  <Key className="w-3 h-3" />
                  <span className="hidden sm:inline">Kunci API</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Sebutkan materi dan kompetensi yang diinginkan, AI akan menyusun stimulus, opsi jawaban, kunci, bobot skor, dan pembahasan.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Mata Pelajaran</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs"
                  placeholder="Misal: Biologi, Matematika, Informatika"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Jenjang / Kelas</label>
                <input
                  type="text"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs"
                  placeholder="Misal: Kelas X SMA / Fase E"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Topik / Pokok Bahasan</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs font-medium"
                  placeholder="Misal: Struktur Sel Hewan dan Tumbuhan"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Jumlah Butir</label>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs"
                  >
                    <option value={3} className="bg-[#121214]">3 Soal</option>
                    <option value={5} className="bg-[#121214]">5 Soal</option>
                    <option value={10} className="bg-[#121214]">10 Soal</option>
                    <option value={15} className="bg-[#121214]">15 Soal</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Kesukaran</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs"
                  >
                    <option value="mudah" className="bg-[#121214]">Mudah</option>
                    <option value="sedang" className="bg-[#121214]">Sedang (HOTS)</option>
                    <option value="sukar" className="bg-[#121214]">Sukar / Olimpiade</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Skor per Soal</label>
                <input
                  type="number"
                  value={defaultScore}
                  onChange={(e) => setDefaultScore(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Instruksi Khusus (Opsional)</label>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs placeholder-slate-500"
                  placeholder="Misal: Sertakan narasi kasus kehidupan sehari-hari"
                />
              </div>

              {aiError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{aiError}</span>
                </div>
              )}

              {aiSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{aiSuccessMsg}</span>
                </div>
              )}

              <button
                id="generate-ai-questions-btn"
                onClick={handleGenerateAI}
                disabled={isGenerating}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs transition-all shadow-lg shadow-indigo-950 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyusun Soal AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate Soal dengan Gemini</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Question List Navigation */}
          <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 text-xs">Daftar Soal ({activeExam.questions.length})</span>
              <button
                onClick={handleAddNewQuestionManual}
                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Manual</span>
              </button>
            </div>

            <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
              {activeExam.questions.map((q, idx) => (
                <div
                  key={q.id}
                  onClick={() => {
                    setSelectedQuestionId(q.id);
                    setEditingQuestion({ ...q });
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    selectedQuestionId === q.id
                      ? "border-indigo-500 bg-indigo-950/40 text-white ring-1 ring-indigo-500/30"
                      : "border-slate-800 bg-[#1a1a1c]/60 hover:border-slate-700 hover:bg-[#1a1a1c]"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-indigo-300">Slide #{idx + 1}</span>
                    <span className="font-mono px-2 py-0.5 bg-[#121214] text-slate-300 border border-slate-800 rounded text-[10px]">
                      Kunci: {q.correctAnswer} | {q.score} Poin
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2 mt-1 font-normal">{q.questionText}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Detailed Question Editor */}
        <div className="lg:col-span-8">
          {editingQuestion ? (
            <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-bold text-xs">
                    Soal #{editingQuestion.questionNumber}
                  </span>
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                    Slide Presentasi {editingQuestion.questionNumber + 3}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteQuestion(editingQuestion.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 font-medium cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Soal</span>
                  </button>
                  <button
                    onClick={handleSaveQuestionEdit}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Simpan Perubahan</span>
                  </button>
                </div>
              </div>

              {/* Topic & Score */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Subtopik / Pokok Bahasan</label>
                  <input
                    type="text"
                    value={editingQuestion.topicTag || ""}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, topicTag: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
                    placeholder="Misal: Keamanan Siber"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Level Kognitif</label>
                  <input
                    type="text"
                    value={editingQuestion.cognitiveLevel || ""}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, cognitiveLevel: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
                    placeholder="Misal: C4 - Menganalisis (HOTS)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Bobot Nilai (Poin)</label>
                  <input
                    type="number"
                    value={editingQuestion.score}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, score: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-indigo-300 text-xs focus:border-indigo-500 focus:outline-none font-bold"
                  />
                </div>
              </div>

              {/* Stimulus */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Stimulus / Narasi / Kasus (Opsional pada Slide)
                </label>
                <textarea
                  rows={3}
                  value={editingQuestion.stimulus || ""}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, stimulus: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-indigo-500 focus:outline-none placeholder-slate-600"
                  placeholder="Tuliskan teks bacaan, tabel angka, atau studi kasus..."
                />
              </div>

              {/* Question Text */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Kalimat Pertanyaan Utama (Ditampilkan Besar pada Slide)
                </label>
                <textarea
                  rows={3}
                  value={editingQuestion.questionText}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, questionText: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-white text-xs font-medium focus:border-indigo-500 focus:outline-none placeholder-slate-600"
                  placeholder="Tuliskan pertanyaan yang jelas dan tidak ambigu..."
                />
              </div>

              {/* Options & Key */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-300">
                    Opsi Pilihan Jawaban & Kunci Jawaban Benar
                  </label>
                  <span className="text-[11px] text-slate-500">
                    Klik huruf lingkaran untuk menetapkan Kunci Jawaban
                  </span>
                </div>

                <div className="space-y-2.5">
                  {editingQuestion.options.map((opt) => {
                    const isCorrect = editingQuestion.correctAnswer.toUpperCase() === opt.key.toUpperCase();
                    return (
                      <div
                        key={opt.key}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${
                          isCorrect
                            ? "bg-emerald-500/10 border-emerald-500/40 ring-1 ring-emerald-500/20"
                            : "bg-[#1a1a1c] border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setEditingQuestion({ ...editingQuestion, correctAnswer: opt.key })
                          }
                          className={`w-8 h-8 rounded-lg font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer transition-all ${
                            isCorrect
                              ? "bg-emerald-600 text-white shadow-sm"
                              : "bg-[#121214] text-slate-300 border border-slate-700 hover:bg-slate-800"
                          }`}
                        >
                          {opt.key}
                        </button>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => updateOptionText(opt.key, e.target.value)}
                          className="flex-1 bg-transparent border-none text-slate-200 text-xs focus:outline-none px-1"
                          placeholder={`Teks pilihan ${opt.key}`}
                        />
                        {isCorrect && (
                          <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
                            KUNCI BENAR
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Explanation */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Pembahasan / Rasionalisasi Kunci Jawaban
                </label>
                <textarea
                  rows={2}
                  value={editingQuestion.explanation}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, explanation: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-300 text-xs focus:border-indigo-500 focus:outline-none placeholder-slate-600"
                  placeholder="Penjelasan mendalam mengapa jawaban tersebut benar..."
                />
              </div>
            </div>
          ) : (
            <div className="bg-[#121214] rounded-2xl p-12 border border-slate-800 text-center space-y-3">
              <BookOpen className="w-12 h-12 text-slate-600 mx-auto" />
              <h3 className="text-base font-semibold text-slate-300">Belum ada butir soal yang dipilih</h3>
              <p className="text-xs text-slate-500">Pilih soal dari panel sebelah kiri atau buat soal baru dengan Gemini AI.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
