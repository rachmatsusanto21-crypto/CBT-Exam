import React, { useState, useEffect, useRef } from "react";
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
  ShieldAlert,
  Image as ImageIcon,
  Link as LinkIcon,
  Upload,
  Share2,
  ListOrdered,
  Type,
  AlignLeft,
  X,
  FileSpreadsheet,
  Download,
  FileDown,
  FileUp,
  Printer,
  Copy,
  Check,
  Info,
  ChevronDown,
  CheckSquare
} from "lucide-react";
import { ExamPackage, Question, QuestionOption, QuestionType, MatchingPair, SchoolProfile } from "../types";
import { generateQuestionsWithGemini, generateImageWithAi } from "../utils/geminiApi";
import { DirectStudentShareModal } from "./DirectStudentShareModal";
import { QuestionImportModal } from "./QuestionImportModal";
import { QuestionExportModal } from "./QuestionExportModal";
import {
  exportQuestionsToExcel,
  exportQuestionsToWordDoc,
  downloadExcelQuestionTemplate,
  downloadDocQuestionTemplate,
  parseQuestionsFromExcel,
  parseQuestionsFromFormattedText,
  printFormattedExamDocument,
} from "../utils/sheetExport";
import { getSchoolProfile } from "../utils/storage";

interface AIGeneratorAndEditorProps {
  activeExam: ExamPackage;
  onUpdateExam: (updated: ExamPackage) => void;
  onPreviewSlides: () => void;
  onOpenGeminiModal?: () => void;
  activeToken?: string;
  school?: SchoolProfile;
}

export const AIGeneratorAndEditor: React.FC<AIGeneratorAndEditorProps> = ({
  activeExam,
  onUpdateExam,
  onPreviewSlides,
  onOpenGeminiModal,
  activeToken,
  school,
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

  // Image insertion tab state
  const [imageTab, setImageTab] = useState<"ai" | "url" | "upload">("ai");
  const [aiImagePrompt, setAiImagePrompt] = useState("");
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Share Modal State
  const [showShareModal, setShowShareModal] = useState(false);

  // Edit Exam Code / Title Modal State
  const [showEditCodeModal, setShowEditCodeModal] = useState(false);
  const [tempExamCode, setTempExamCode] = useState(activeExam.code);
  const [tempExamTitle, setTempExamTitle] = useState(activeExam.title);

  // Import & Export State
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportIncludeKey, setExportIncludeKey] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<"excel" | "docs">("excel");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");

  // Excel Import State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelParsedQuestions, setExcelParsedQuestions] = useState<Question[] | null>(null);
  const [excelParseError, setExcelParseError] = useState<string | null>(null);
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Docs / Text Import State
  const [docsInputText, setDocsInputText] = useState("");
  const [docsParsedQuestions, setDocsParsedQuestions] = useState<Question[] | null>(null);
  const [docsParseError, setDocsParseError] = useState<string | null>(null);
  const [isProcessingDocs, setIsProcessingDocs] = useState(false);
  const docsFileInputRef = useRef<HTMLInputElement>(null);

  const schoolData = school || getSchoolProfile();

  // Import from Excel Handlers
  const handleExcelFileSelect = async (file: File) => {
    setExcelFile(file);
    setExcelParseError(null);
    setExcelParsedQuestions(null);
    setIsProcessingExcel(true);
    try {
      const buffer = await file.arrayBuffer();
      const result = parseQuestionsFromExcel(buffer);
      if (result.questions.length === 0) {
        setExcelParseError(result.error || "Tidak ada butir soal valid yang ditemukan dalam file Excel ini.");
      } else {
        setExcelParsedQuestions(result.questions);
      }
    } catch (err: any) {
      setExcelParseError(err?.message || "Gagal memproses file Excel. Pastikan format kolom sesuai template.");
    } finally {
      setIsProcessingExcel(false);
    }
  };

  // Import from Docs / Formatted Text Handlers
  const handleDocsTextParse = () => {
    setDocsParseError(null);
    setDocsParsedQuestions(null);
    if (!docsInputText.trim()) {
      setDocsParseError("Silakan tempel (paste) teks naskah soal terlebih dahulu.");
      return;
    }
    setIsProcessingDocs(true);
    try {
      const result = parseQuestionsFromFormattedText(docsInputText);
      if (result.questions.length === 0) {
        setDocsParseError(result.error || "Tidak ada butir soal yang terdeteksi. Pastikan penomoran soal (1. ...) dan opsi (A. ...) sesuai.");
      } else {
        setDocsParsedQuestions(result.questions);
      }
    } catch (err: any) {
      setDocsParseError(err?.message || "Gagal memproses format teks naskah soal.");
    } finally {
      setIsProcessingDocs(false);
    }
  };

  const handleDocsFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      setDocsInputText(text);
      const result = parseQuestionsFromFormattedText(text);
      if (result.questions.length === 0) {
        setDocsParseError(result.error || "Tidak ada butir soal yang terdeteksi dalam file teks.");
      } else {
        setDocsParsedQuestions(result.questions);
      }
    } catch (err: any) {
      setDocsParseError("Gagal membaca file naskah dokumen.");
    }
  };

  // Confirm and save imported questions
  const handleConfirmImport = (questionsToImport: Question[]) => {
    if (!questionsToImport || questionsToImport.length === 0) return;

    let finalQuestions: Question[] = [];
    if (importMode === "append") {
      const startNum = activeExam.questions.length + 1;
      const renumberedImported = questionsToImport.map((q, idx) => ({
        ...q,
        id: `q-${Date.now()}-${idx + 1}-${Math.random().toString(36).substr(2, 4)}`,
        questionNumber: startNum + idx,
      }));
      finalQuestions = [...activeExam.questions, ...renumberedImported];
    } else {
      finalQuestions = questionsToImport.map((q, idx) => ({
        ...q,
        id: `q-${Date.now()}-${idx + 1}-${Math.random().toString(36).substr(2, 4)}`,
        questionNumber: idx + 1,
      }));
    }

    const totalScore = finalQuestions.reduce((sum, q) => sum + (q.score || 10), 0);
    const updatedExam: ExamPackage = {
      ...activeExam,
      questions: finalQuestions,
      totalScore,
      updatedAt: new Date().toISOString(),
    };

    onUpdateExam(updatedExam);
    setShowImportModal(false);
    setExcelFile(null);
    setExcelParsedQuestions(null);
    setDocsInputText("");
    setDocsParsedQuestions(null);

    if (finalQuestions.length > 0) {
      setSelectedQuestionId(finalQuestions[0].id);
      setEditingQuestion(finalQuestions[0]);
    }

    setAiSuccessMsg(`Berhasil mengimpor ${questionsToImport.length} butir soal ke dalam naskah!`);
    setTimeout(() => setAiSuccessMsg(null), 4000);
  };

  // Export handlers
  const handleExportExcel = () => {
    exportQuestionsToExcel(activeExam, schoolData);
    setShowExportModal(false);
  };

  const handleExportWord = () => {
    exportQuestionsToWordDoc(activeExam, schoolData, exportIncludeKey);
    setShowExportModal(false);
  };

  const handlePrintDoc = () => {
    printFormattedExamDocument(activeExam, schoolData);
    setShowExportModal(false);
  };

  const handleSaveExamCodeAndTitle = () => {
    if (!tempExamCode.trim()) return;
    onUpdateExam({
      ...activeExam,
      code: tempExamCode.trim().toUpperCase(),
      title: tempExamTitle.trim() || activeExam.title,
      updatedAt: new Date().toISOString(),
    });
    setShowEditCodeModal(false);
    setAiSuccessMsg("Kode Naskah Soal & Judul Ujian berhasil diperbarui!");
    setTimeout(() => setAiSuccessMsg(null), 3000);
  };

  useEffect(() => {
    if (activeExam.questions.length > 0) {
      const found = activeExam.questions.find((q) => q.id === selectedQuestionId) || activeExam.questions[0];
      setSelectedQuestionId(found.id);
      setEditingQuestion({ ...found });
      setAiImagePrompt(found.imagePrompt || found.questionText || "");
      setImageUrlInput(found.imageUrl || "");
    } else {
      setSelectedQuestionId("");
      setEditingQuestion(null);
    }
  }, [activeExam.id]);

  const handleSelectQuestion = (q: Question) => {
    setSelectedQuestionId(q.id);
    setEditingQuestion({ ...q });
    setAiImagePrompt(q.imagePrompt || q.questionText || "");
    setImageUrlInput(q.imageUrl || "");
    setImageError(null);
  };

  const handleGenerateAI = async () => {
    setIsGenerating(true);
    setAiError(null);
    setAiSuccessMsg(null);

    try {
      const result = await generateQuestionsWithGemini(
        {
          subject,
          gradeLevel,
          topic,
          count: Number(count),
          difficulty,
          questionType,
          additionalInstructions: instructions,
          defaultScorePerQuestion: Number(defaultScore),
        },
        activeExam.questions.length
      );

      const newQuestions = [...activeExam.questions, ...result.questions].map((q, i) => ({
        ...q,
        questionNumber: i + 1,
      }));

      const totalScore = newQuestions.reduce((acc, q) => acc + (q.score || 0), 0);

      const updatedExam: ExamPackage = {
        ...activeExam,
        title: result.examTitle ? `${result.examTitle}` : activeExam.title,
        questions: newQuestions,
        totalScore,
        updatedAt: new Date().toISOString(),
      };

      onUpdateExam(updatedExam);
      setAiSuccessMsg(`Berhasil membuat ${result.questions.length} butir soal baru dengan Gemini AI!`);
      if (result.questions[0]) {
        setSelectedQuestionId(result.questions[0].id);
        setEditingQuestion(result.questions[0]);
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
    setAiSuccessMsg("Perubahan butir soal berhasil disimpan.");
    setTimeout(() => setAiSuccessMsg(null), 3000);
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
    const filtered = activeExam.questions.filter((q) => q.id !== id);
    const renumbered = filtered.map((q, i) => ({ ...q, questionNumber: i + 1 }));
    const totalScore = renumbered.reduce((acc, q) => acc + q.score, 0);

    onUpdateExam({
      ...activeExam,
      questions: renumbered,
      totalScore,
      updatedAt: new Date().toISOString(),
    });

    if (renumbered.length > 0) {
      setSelectedQuestionId(renumbered[0].id);
      setEditingQuestion(renumbered[0]);
    } else {
      setSelectedQuestionId("");
      setEditingQuestion(null);
    }
  };

  const updateOptionText = (key: string, text: string) => {
    if (!editingQuestion) return;
    const newOptions = editingQuestion.options.map((opt) =>
      opt.key === key ? { ...opt, text } : opt
    );
    setEditingQuestion({ ...editingQuestion, options: newOptions });
  };

  // Matching pair helpers
  const handleAddMatchingPair = () => {
    if (!editingQuestion) return;
    const currentPairs = editingQuestion.matchingPairs || [];
    const newPair: MatchingPair = {
      id: `pair-${Date.now()}-${currentPairs.length + 1}`,
      left: `Pernyataan / Konsep ${currentPairs.length + 1}`,
      right: `Pasangan Cocok ${currentPairs.length + 1}`,
    };
    setEditingQuestion({
      ...editingQuestion,
      matchingPairs: [...currentPairs, newPair],
    });
  };

  const handleUpdateMatchingPair = (pairId: string, field: "left" | "right", value: string) => {
    if (!editingQuestion || !editingQuestion.matchingPairs) return;
    const updated = editingQuestion.matchingPairs.map((p) =>
      p.id === pairId ? { ...p, [field]: value } : p
    );
    setEditingQuestion({ ...editingQuestion, matchingPairs: updated });
  };

  const handleDeleteMatchingPair = (pairId: string) => {
    if (!editingQuestion || !editingQuestion.matchingPairs) return;
    const updated = editingQuestion.matchingPairs.filter((p) => p.id !== pairId);
    setEditingQuestion({ ...editingQuestion, matchingPairs: updated });
  };

  // Image Insertion Handlers
  const handleGenerateAiImage = async () => {
    if (!editingQuestion) return;
    const promptToUse = aiImagePrompt.trim() || editingQuestion.questionText;
    if (!promptToUse) {
      setImageError("Masukkan deskripsi atau prompt gambar yang ingin dibuat.");
      return;
    }

    setIsGeneratingImage(true);
    setImageError(null);

    try {
      const res = await generateImageWithAi({
        prompt: promptToUse,
        subject: activeExam.teacherProfile.subject || subject,
        questionContext: editingQuestion.stimulus || editingQuestion.questionText,
      });

      const updatedQ: Question = {
        ...editingQuestion,
        imageUrl: res.imageUrl,
        imageCaption: res.caption || promptToUse,
        imagePrompt: promptToUse,
      };

      setEditingQuestion(updatedQ);

      // Auto update in exam package
      const updatedList = activeExam.questions.map((q) =>
        q.id === updatedQ.id ? updatedQ : q
      );
      onUpdateExam({ ...activeExam, questions: updatedList, updatedAt: new Date().toISOString() });
    } catch (err: any) {
      setImageError(err.message || "Gagal membuat gambar AI.");
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleApplyUrlImage = () => {
    if (!editingQuestion) return;
    if (!imageUrlInput.trim()) {
      setImageError("Masukkan URL gambar yang valid.");
      return;
    }

    const updatedQ: Question = {
      ...editingQuestion,
      imageUrl: imageUrlInput.trim(),
      imageCaption: editingQuestion.imageCaption || "Gambar Pendukung Soal",
    };
    setEditingQuestion(updatedQ);

    const updatedList = activeExam.questions.map((q) =>
      q.id === updatedQ.id ? updatedQ : q
    );
    onUpdateExam({ ...activeExam, questions: updatedList, updatedAt: new Date().toISOString() });
    setImageError(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editingQuestion || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    if (!file.type.startsWith("image/")) {
      setImageError("File yang diunggah harus berupa gambar (JPG, PNG, WebP, SVG).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError("Ukuran gambar maksimal 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      const updatedQ: Question = {
        ...editingQuestion,
        imageUrl: base64,
        imageCaption: file.name.replace(/\.[^/.]+$/, ""),
      };
      setEditingQuestion(updatedQ);

      const updatedList = activeExam.questions.map((q) =>
        q.id === updatedQ.id ? updatedQ : q
      );
      onUpdateExam({ ...activeExam, questions: updatedList, updatedAt: new Date().toISOString() });
      setImageError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    if (!editingQuestion) return;
    const updatedQ: Question = {
      ...editingQuestion,
      imageUrl: undefined,
      imageCaption: undefined,
      imagePrompt: undefined,
    };
    setEditingQuestion(updatedQ);
    setImageUrlInput("");

    const updatedList = activeExam.questions.map((q) =>
      q.id === updatedQ.id ? updatedQ : q
    );
    onUpdateExam({ ...activeExam, questions: updatedList, updatedAt: new Date().toISOString() });
  };

  // Anti-Cheating toggles
  const handleToggleShuffleQuestions = () => {
    const updated = {
      ...activeExam,
      shuffleQuestions: !activeExam.shuffleQuestions,
      updatedAt: new Date().toISOString(),
    };
    onUpdateExam(updated);
  };

  const handleToggleShuffleOptions = () => {
    const updated = {
      ...activeExam,
      shuffleOptions: !activeExam.shuffleOptions,
      updatedAt: new Date().toISOString(),
    };
    onUpdateExam(updated);
  };

  const handleSetAllShuffle = (enable: boolean) => {
    const updated = {
      ...activeExam,
      shuffleQuestions: enable,
      shuffleOptions: enable,
      updatedAt: new Date().toISOString(),
    };
    onUpdateExam(updated);
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar with Direct Student Link & Edit Exam Code */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#121214] p-5 rounded-2xl border border-slate-800 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span>{activeExam.title}</span>
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-bold">
              {activeExam.questions.length} Butir ({activeExam.totalScore} Poin)
            </span>
          </div>

          <p className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
            <span>Kode Naskah:</span>
            <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              {activeExam.code}
            </span>
            <button
              id="edit-exam-code-btn"
              onClick={() => {
                setTempExamCode(activeExam.code);
                setTempExamTitle(activeExam.title);
                setShowEditCodeModal(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition-colors cursor-pointer"
              title="Ubah Kode Naskah Soal & Judul"
            >
              <Edit3 className="w-3 h-3" />
              <span>Edit Kode</span>
            </button>
            <span>•</span>
            <span>Mata Pelajaran: <strong className="text-slate-200">{activeExam.teacherProfile.subject}</strong></span>
            <span>•</span>
            <span
              onClick={handleToggleShuffleQuestions}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold text-[11px] cursor-pointer transition-all ${
                activeExam.shuffleQuestions
                  ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700"
              }`}
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
            >
              <ShieldCheck className="w-3 h-3" />
              Acak Opsi: {activeExam.shuffleOptions ? "ON" : "OFF"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Import Questions Button */}
          <button
            id="import-questions-top-btn"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-sm hover:border-indigo-500/50"
            title="Impor Soal dari File Excel (.xlsx) atau Dokumen Word / Docs"
          >
            <FileUp className="w-4 h-4 text-indigo-400" />
            <span>Impor Soal</span>
          </button>

          {/* Export Questions Button */}
          <button
            id="export-questions-top-btn"
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-sm hover:border-emerald-500/50"
            title="Ekspor Naskah Soal ke Excel (.xlsx), Word (.doc), atau Cetak PDF"
          >
            <FileDown className="w-4 h-4 text-emerald-400" />
            <span>Ekspor Naskah</span>
          </button>

          {/* Direct Student Share Link Button */}
          <button
            id="share-student-link-btn"
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-emerald-950 cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Bagikan Link Siswa</span>
          </button>

          <button
            id="preview-slides-btn"
            onClick={onPreviewSlides}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-indigo-950 cursor-pointer"
          >
            <Layers className="w-4 h-4" />
            <span>Tinjau Slides CBT</span>
          </button>
        </div>
      </div>

      {/* Edit Exam Code Modal */}
      {showEditCodeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-[#161618] border border-slate-700 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <span>Edit Kode Naskah Soal & Judul</span>
              </div>
              <button
                onClick={() => setShowEditCodeModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Kode Naskah Soal <span className="text-emerald-400 font-mono">(Unik)</span>
                </label>
                <input
                  type="text"
                  value={tempExamCode}
                  onChange={(e) => setTempExamCode(e.target.value.toUpperCase())}
                  placeholder="Contoh: PTS-IPA-VII-2026"
                  className="w-full px-3 py-2 bg-[#1f1f23] border border-slate-700 rounded-xl text-emerald-400 font-mono font-bold text-sm tracking-wider focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Kode ini digunakan siswa saat ujian login CBT dan tautan pengerjaan langsung.
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Judul Naskah Soal</label>
                <input
                  type="text"
                  value={tempExamTitle}
                  onChange={(e) => setTempExamTitle(e.target.value)}
                  placeholder="Contoh: Asesmen Sumatif Akhir Semester Informatika"
                  className="w-full px-3 py-2 bg-[#1f1f23] border border-slate-700 rounded-xl text-slate-200 font-bold focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowEditCodeModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveExamCodeAndTitle}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-950 cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

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

            <div className="space-y-2">
              <div
                onClick={handleToggleShuffleQuestions}
                className="p-3 bg-[#161618] rounded-xl border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Shuffle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors">
                      Acak Urutan Soal
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Setiap siswa menerima urutan nomor soal yang berbeda.
                  </p>
                </div>
                <div
                  className={`w-9 h-5 rounded-full transition-colors flex items-center p-0.5 ${
                    activeExam.shuffleQuestions ? "bg-emerald-600 justify-end" : "bg-slate-800 justify-start"
                  }`}
                >
                  <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                </div>
              </div>

              <div
                onClick={handleToggleShuffleOptions}
                className="p-3 bg-[#161618] rounded-xl border border-slate-800 hover:border-slate-700 transition-all flex items-center justify-between gap-3 cursor-pointer group"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                      Acak Opsi Pilihan (A-E)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Posisi abjad opsi A-E diacak otomatis per siswa.
                  </p>
                </div>
                <div
                  className={`w-9 h-5 rounded-full transition-colors flex items-center p-0.5 ${
                    activeExam.shuffleOptions ? "bg-emerald-600 justify-end" : "bg-slate-800 justify-start"
                  }`}
                >
                  <div className="w-4 h-4 bg-white rounded-full shadow-md" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSetAllShuffle(true)}
                className="flex-1 py-1.5 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Aktifkan Semua
              </button>
              <button
                type="button"
                onClick={() => handleSetAllShuffle(false)}
                className="py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[11px] font-semibold transition-all cursor-pointer text-center"
              >
                Reset
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

              {/* Question Type Selector */}
              <div>
                <label className="block font-medium text-slate-300 mb-1">Ragam Jenis Soal</label>
                <select
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs font-semibold"
                >
                  <option value="pilihan_ganda" className="bg-[#121214]">Pilihan Ganda (A-E)</option>
                  <option value="menjodohkan" className="bg-[#121214]">Mencocokkan / Menjodohkan (Matching)</option>
                  <option value="isian_singkat" className="bg-[#121214]">Isian Pendek / Singkat (Short Answer)</option>
                  <option value="uraian" className="bg-[#121214]">Uraian / Esai Komprehensif</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Jumlah Butir (Sampai 50)</label>
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 focus:border-indigo-500 focus:outline-none text-xs font-bold"
                  >
                    <option value={3} className="bg-[#121214]">3 Soal</option>
                    <option value={5} className="bg-[#121214]">5 Soal</option>
                    <option value={10} className="bg-[#121214]">10 Soal</option>
                    <option value={15} className="bg-[#121214]">15 Soal</option>
                    <option value={20} className="bg-[#121214]">20 Soal</option>
                    <option value={25} className="bg-[#121214]">25 Soal</option>
                    <option value={30} className="bg-[#121214]">30 Soal</option>
                    <option value={40} className="bg-[#121214]">40 Soal</option>
                    <option value={50} className="bg-[#121214]">50 Soal (Maksimal)</option>
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
                  placeholder="Misal: Sertakan narasi kasus kehidupan sehari-hari..."
                />
              </div>

              {aiError && (
                <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-300 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-400" />
                    <span className="leading-relaxed flex-1">{aiError}</span>
                  </div>
                  <div className="flex items-center justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleGenerateAI}
                      disabled={isGenerating}
                      className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 rounded-xl font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? "animate-spin" : ""}`} />
                      <span>Coba Lagi Sekarang</span>
                    </button>
                  </div>
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
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs transition-all shadow-lg shadow-indigo-950 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyusun {count} Butir Soal AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate {count} Soal dengan Gemini</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Question List Navigation */}
          <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-semibold text-slate-200 text-xs">
                Daftar Soal ({activeExam.questions.length})
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white font-medium px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer transition-colors"
                  title="Impor dari Excel / Word"
                >
                  <FileUp className="w-3 h-3 text-indigo-400" />
                  <span>Impor</span>
                </button>
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white font-medium px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer transition-colors"
                  title="Ekspor ke Excel / Word / PDF"
                >
                  <FileDown className="w-3 h-3 text-emerald-400" />
                  <span>Ekspor</span>
                </button>
                <button
                  onClick={handleAddNewQuestionManual}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
              {activeExam.questions.map((q, idx) => (
                <div
                  key={q.id}
                  onClick={() => handleSelectQuestion(q)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    selectedQuestionId === q.id
                      ? "border-indigo-500 bg-indigo-950/40 text-white ring-1 ring-indigo-500/30"
                      : "border-slate-800 bg-[#1a1a1c]/60 hover:border-slate-700 hover:bg-[#1a1a1c]"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-indigo-300">#{idx + 1}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 uppercase">
                        {q.type === "menjodohkan"
                          ? "Mencocokkan"
                          : q.type === "isian_singkat"
                          ? "Isian"
                          : q.type === "uraian"
                          ? "Uraian"
                          : "Pilgan"}
                      </span>
                      {q.imageUrl && <ImageIcon className="w-3 h-3 text-emerald-400" />}
                    </div>
                    <span className="font-mono text-slate-400 text-[10px]">
                      {q.score} Poin
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
            <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-6">
              {/* Question Editor Top Bar */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-bold text-xs">
                    Soal #{editingQuestion.questionNumber}
                  </span>
                  <select
                    value={editingQuestion.type || "pilihan_ganda"}
                    onChange={(e) => {
                      const newType = e.target.value as QuestionType;
                      setEditingQuestion({
                        ...editingQuestion,
                        type: newType,
                        matchingPairs:
                          newType === "menjodohkan" && (!editingQuestion.matchingPairs || editingQuestion.matchingPairs.length === 0)
                            ? [
                                { id: "p1", left: "Pernyataan / Konsep A", right: "Pasangan Cocok 1" },
                                { id: "p2", left: "Pernyataan / Konsep B", right: "Pasangan Cocok 2" },
                                { id: "p3", left: "Pernyataan / Konsep C", right: "Pasangan Cocok 3" },
                              ]
                            : editingQuestion.matchingPairs,
                      });
                    }}
                    className="px-2.5 py-1 bg-[#1a1a1c] border border-slate-700 text-indigo-300 rounded-lg text-xs font-semibold focus:outline-none"
                  >
                    <option value="pilihan_ganda">Tipe: Pilihan Ganda (A-E)</option>
                    <option value="menjodohkan">Tipe: Mencocokkan / Menjodohkan</option>
                    <option value="isian_singkat">Tipe: Isian Pendek / Singkat</option>
                    <option value="uraian">Tipe: Uraian / Esai</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDeleteQuestion(editingQuestion.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 rounded-lg border border-rose-500/20 font-medium cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus</span>
                  </button>
                  <button
                    onClick={handleSaveQuestionEdit}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold cursor-pointer shadow-sm"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Simpan Perubahan</span>
                  </button>
                </div>
              </div>

              {/* Topic, Cognitive Level & Score */}
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

              {/* ========================================================================= */}
              {/* IMAGE ATTACHMENT / AI IMAGE GENERATOR FOR QUESTION */}
              {/* ========================================================================= */}
              <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-white">Gambar / Diagram Pendukung Soal</span>
                  </div>
                  {editingQuestion.imageUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus Gambar</span>
                    </button>
                  )}
                </div>

                {/* If image exists, show preview and caption editor */}
                {editingQuestion.imageUrl ? (
                  <div className="space-y-3">
                    <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-slate-700 flex items-center justify-center max-h-64 p-2">
                      <img
                        src={editingQuestion.imageUrl}
                        alt={editingQuestion.imageCaption || "Gambar Soal"}
                        className="max-h-60 object-contain rounded-xl"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Keterangan Gambar (Caption)</label>
                        <input
                          type="text"
                          value={editingQuestion.imageCaption || ""}
                          onChange={(e) =>
                            setEditingQuestion({ ...editingQuestion, imageCaption: e.target.value })
                          }
                          className="w-full px-3 py-1.5 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs"
                          placeholder="Misal: Gambar 1.1 Struktur Jaringan"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Ganti dengan Prompt AI Lain</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={aiImagePrompt}
                            onChange={(e) => setAiImagePrompt(e.target.value)}
                            className="flex-1 px-3 py-1.5 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs"
                            placeholder="Prompt visual baru..."
                          />
                          <button
                            type="button"
                            onClick={handleGenerateAiImage}
                            disabled={isGeneratingImage}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 disabled:opacity-50"
                          >
                            {isGeneratingImage ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "Regenerate"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Image Insertion Controls (AI Prompt, URL Link, or Upload File) */
                  <div className="space-y-3">
                    {/* Tabs */}
                    <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
                      <button
                        type="button"
                        onClick={() => setImageTab("ai")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          imageTab === "ai"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-[#1a1a1c] text-slate-400 hover:text-white"
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate AI (Prompt)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImageTab("url")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          imageTab === "url"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-[#1a1a1c] text-slate-400 hover:text-white"
                        }`}
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>Tautan URL</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setImageTab("upload")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          imageTab === "upload"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-[#1a1a1c] text-slate-400 hover:text-white"
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Unggah File</span>
                      </button>
                    </div>

                    {/* Tab 1: AI Prompt */}
                    {imageTab === "ai" && (
                      <div className="space-y-2">
                        <label className="block text-[11px] text-slate-400">
                          Masukkan deskripsi visual / diagram yang ingin dibuat AI untuk soal nomor #{editingQuestion.questionNumber}:
                        </label>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                          <input
                            type="text"
                            value={aiImagePrompt}
                            onChange={(e) => setAiImagePrompt(e.target.value)}
                            placeholder="Contoh: Diagram organel sel hewan dengan label mitokondria dan nukleus..."
                            className="flex-1 px-3.5 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleGenerateAiImage}
                            disabled={isGeneratingImage}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950 cursor-pointer shrink-0"
                          >
                            {isGeneratingImage ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Membuat Visual AI...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Buat Gambar AI</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab 2: URL Link */}
                    {imageTab === "url" && (
                      <div className="space-y-2">
                        <label className="block text-[11px] text-slate-400">
                          Masukkan URL tautan gambar langsung (https://...):
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="url"
                            value={imageUrlInput}
                            onChange={(e) => setImageUrlInput(e.target.value)}
                            placeholder="https://example.com/diagram.png"
                            className="flex-1 px-3.5 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleApplyUrlImage}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0"
                          >
                            Terapkan
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Tab 3: Upload File */}
                    {imageTab === "upload" && (
                      <div className="space-y-2">
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="p-6 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl text-center cursor-pointer bg-[#1a1a1c]/60 hover:bg-[#1a1a1c] transition-all space-y-1"
                        >
                          <Upload className="w-6 h-6 text-slate-400 mx-auto" />
                          <div className="text-xs font-semibold text-slate-200">
                            Klik untuk memilih gambar atau seret file ke sini
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Mendukung JPG, PNG, WebP, SVG (Maksimal 5 MB)
                          </div>
                        </div>
                      </div>
                    )}

                    {imageError && (
                      <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{imageError}</span>
                      </div>
                    )}
                  </div>
                )}
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

              {/* ========================================================================= */}
              {/* DYNAMIC ANSWER CONTROLS ACCORDING TO QUESTION TYPE */}
              {/* ========================================================================= */}

              {/* TYPE 1: PILIHAN GANDA (A-E) */}
              {(editingQuestion.type === "pilihan_ganda" ||
                editingQuestion.type === "pilihan_ganda_kompleks" ||
                !editingQuestion.type) && (
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
              )}

              {/* TYPE 2: MENCOCOKKAN / MENJODOHKAN */}
              {editingQuestion.type === "menjodohkan" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="text-xs font-bold text-slate-200">
                        Pasangan Soal Menjodohkan (Pernyataan Kiri ↔ Pasangan Kanan)
                      </label>
                      <p className="text-[11px] text-slate-400">
                        Siswa akan mencocokkan setiap item di kolom kiri dengan pilihan yang tepat di kolom kanan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddMatchingPair}
                      className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Pasangan</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {(editingQuestion.matchingPairs || []).map((pair, pIdx) => (
                      <div
                        key={pair.id || pIdx}
                        className="p-3 bg-[#1a1a1c] rounded-xl border border-slate-800 flex items-center gap-3"
                      >
                        <span className="w-6 h-6 rounded-lg bg-indigo-600/20 text-indigo-400 font-bold text-xs flex items-center justify-center shrink-0">
                          {pIdx + 1}
                        </span>

                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={pair.left}
                            onChange={(e) => handleUpdateMatchingPair(pair.id, "left", e.target.value)}
                            className="px-3 py-1.5 bg-[#121214] border border-slate-700 rounded-lg text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
                            placeholder="Pernyataan / Item Kiri..."
                          />
                          <input
                            type="text"
                            value={pair.right}
                            onChange={(e) => handleUpdateMatchingPair(pair.id, "right", e.target.value)}
                            className="px-3 py-1.5 bg-[#121214] border border-slate-700 rounded-lg text-emerald-300 text-xs focus:border-emerald-500 focus:outline-none"
                            placeholder="Pasangan Cocok Kanan..."
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteMatchingPair(pair.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 cursor-pointer shrink-0"
                          title="Hapus baris pasangan"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TYPE 3: ISIAN PENDEK / SINGKAT */}
              {editingQuestion.type === "isian_singkat" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">
                      Kunci Jawaban Isian Singkat
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Masukkan kata atau angka yang tepat. Jika ada beberapa alternatif penulisan kata yang sama-sama benar, pisahkan dengan tanda koma (contoh: <em>fotosintesis, photosynthesis, fotosintesa</em>).
                    </p>
                    <input
                      type="text"
                      value={editingQuestion.correctAnswer}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, correctAnswer: e.target.value })
                      }
                      className="w-full px-3.5 py-2.5 bg-[#1a1a1c] border border-emerald-500/40 rounded-xl text-emerald-300 text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none"
                      placeholder="Misal: Klorofil, Zat Hijau Daun"
                    />
                  </div>
                </div>
              )}

              {/* TYPE 4: URAIAN / ESAI */}
              {editingQuestion.type === "uraian" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-200 mb-1">
                      Rubrik Penilaian & Contoh Jawaban Ideal (Kunci Acuan)
                    </label>
                    <p className="text-[11px] text-slate-400 mb-2">
                      Tuliskan poin-poin rubrik penilaian atau esai referensi untuk memudahkan guru saat mengoreksi jawaban siswa.
                    </p>
                    <textarea
                      rows={3}
                      value={editingQuestion.sampleAnswer || ""}
                      onChange={(e) =>
                        setEditingQuestion({ ...editingQuestion, sampleAnswer: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-xs focus:border-indigo-500 focus:outline-none placeholder-slate-600"
                      placeholder="Poin 1: Menyebutkan definisi (skor 5). Poin 2: Menjelaskan 2 contoh penerapan (skor 5)..."
                    />
                  </div>
                </div>
              )}

              {/* Explanation */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Pembahasan / Rasionalisasi Jawaban
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

      {/* Share Direct Student Link Modal */}
      <DirectStudentShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        exam={activeExam}
        token={activeToken}
      />

      {/* Import Questions Modal (Excel & Docs) */}
      <QuestionImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportQuestions={(questions, mode) => {
          setImportMode(mode);
          handleConfirmImport(questions);
        }}
        existingQuestionsCount={activeExam.questions.length}
        subject={activeExam.teacherProfile.subject}
      />

      {/* Export Questions Modal (Excel, Docs & Print PDF) */}
      <QuestionExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        exam={activeExam}
        school={schoolData}
      />
    </div>
  );
};
