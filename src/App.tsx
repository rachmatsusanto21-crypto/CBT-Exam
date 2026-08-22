import React, { useState, useEffect } from "react";
import {
  GraduationCap,
  Sparkles,
  BarChart3,
  Users,
  Key,
  Building2,
  Cloud,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  Plus,
  Play,
  Monitor,
  CheckCircle,
  Menu,
  X
} from "lucide-react";
import {
  ExamPackage,
  SchoolProfile,
  StudentExamSession,
  StudentTokenItem,
  NavigationTab
} from "./types";
import {
  getSchoolProfile,
  saveSchoolProfile,
  getExamPackages,
  saveExamPackages,
  getActiveExamId,
  saveActiveExamId,
  getStudentTokens,
  saveStudentTokens,
  getExamHistory,
  saveExamHistory,
  getActiveStudentSession,
  saveActiveStudentSession,
  createNewExamPackage
} from "./utils/storage";

// Sub-components
import { StudentSlideExam } from "./components/StudentSlideExam";
import { LiveMonitoringDashboard } from "./components/LiveMonitoringDashboard";
import { AIGeneratorAndEditor } from "./components/AIGeneratorAndEditor";
import { ItemAnalysisAndHistory } from "./components/ItemAnalysisAndHistory";
import { TokenManager } from "./components/TokenManager";
import { SchoolProfileAndPrintView } from "./components/SchoolProfileAndPrintView";
import { BackupRestoreView } from "./components/BackupRestoreView";
import { GeminiApiKeyModal } from "./components/GeminiApiKeyModal";
import { getGeminiRequestHeaders } from "./utils/storage";

export default function App() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<NavigationTab>("student_exam");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; source: string } | null>(null);

  // Check Gemini API Key Status
  const checkGeminiStatus = async () => {
    try {
      const headers = getGeminiRequestHeaders();
      const res = await fetch("/api/gemini/status", { headers });
      const data = await res.json();
      setGeminiStatus(data);
    } catch {
      setGeminiStatus({ configured: false, source: "none" });
    }
  };

  useEffect(() => {
    checkGeminiStatus();
  }, []);

  // App Data State
  const [schoolProfile, setSchoolProfileState] = useState<SchoolProfile>(getSchoolProfile);
  const [exams, setExamsState] = useState<ExamPackage[]>(getExamPackages);
  const [activeExamId, setActiveExamIdState] = useState<string>(() => {
    const saved = getActiveExamId();
    const all = getExamPackages();
    return all.some((e) => e.id === saved) ? saved : all[0]?.id || "";
  });
  const [tokens, setTokensState] = useState<StudentTokenItem[]>(getStudentTokens);
  const [history, setHistoryState] = useState<StudentExamSession[]>(getExamHistory);
  const [activeSession, setActiveSessionState] = useState<StudentExamSession | null>(getActiveStudentSession);

  // Active Exam
  const activeExam = exams.find((e) => e.id === activeExamId) || exams[0] || createNewExamPackage("Ujian Standar");

  // Handlers for Data Updates
  const handleUpdateSchool = (updated: SchoolProfile) => {
    setSchoolProfileState(updated);
    saveSchoolProfile(updated);
  };

  const handleUpdateActiveExam = (updated: ExamPackage) => {
    const updatedExams = exams.map((e) => (e.id === updated.id ? updated : e));
    setExamsState(updatedExams);
    saveExamPackages(updatedExams);
  };

  const handleCreateNewExam = () => {
    const title = prompt("Masukkan Judul Naskah Ujian Baru:", "Ujian Penilaian Tengah Semester");
    if (!title) return;
    const newPkg = createNewExamPackage(title);
    const updated = [newPkg, ...exams];
    setExamsState(updated);
    saveExamPackages(updated);
    setActiveExamIdState(newPkg.id);
    saveActiveExamId(newPkg.id);
    setActiveTab("ai_generator");
  };

  const handleSelectExamId = (id: string) => {
    setActiveExamIdState(id);
    saveActiveExamId(id);
    // Clear student session if switching exam
    if (activeSession && activeSession.examId !== id) {
      setActiveSessionState(null);
      saveActiveStudentSession(null);
    }
  };

  const handleUpdateTokens = (newTokens: StudentTokenItem[]) => {
    setTokensState(newTokens);
    saveStudentTokens(newTokens);
  };

  const handleUpdateExamToken = (newToken: string) => {
    const updated = { ...activeExam, sessionToken: newToken };
    handleUpdateActiveExam(updated);
  };

  const handleSaveStudentSession = (session: StudentExamSession) => {
    setActiveSessionState(session);
    saveActiveStudentSession(session);

    // If already exists in history, update; else add
    const existingIdx = history.findIndex((h) => h.id === session.id);
    let updatedHistory: StudentExamSession[];
    if (existingIdx >= 0) {
      updatedHistory = [...history];
      updatedHistory[existingIdx] = session;
    } else {
      updatedHistory = [session, ...history];
    }
    setHistoryState(updatedHistory);
    saveExamHistory(updatedHistory);
  };

  const handleSubmitStudentExam = (finalizedSession: StudentExamSession) => {
    setActiveSessionState(finalizedSession);
    saveActiveStudentSession(finalizedSession);

    const existingIdx = history.findIndex((h) => h.id === finalizedSession.id);
    let updatedHistory: StudentExamSession[];
    if (existingIdx >= 0) {
      updatedHistory = [...history];
      updatedHistory[existingIdx] = finalizedSession;
    } else {
      updatedHistory = [finalizedSession, ...history];
    }
    setHistoryState(updatedHistory);
    saveExamHistory(updatedHistory);
  };

  const handleForceSubmitStudent = (sessionId: string) => {
    const s = history.find((item) => item.id === sessionId);
    if (!s) return;

    let totalScoreEarned = 0;
    activeExam.questions.forEach((q) => {
      const ans = s.answers[q.id];
      if (ans && ans.selectedOption.toUpperCase() === q.correctAnswer.toUpperCase()) {
        totalScoreEarned += q.score;
      }
    });

    const maxScore = activeExam.totalScore > 0 ? activeExam.totalScore : 100;
    const percentage = Math.round((totalScoreEarned / maxScore) * 100);
    const passed = percentage >= (activeExam.teacherProfile.passingGrade || 75);

    const updatedSession: StudentExamSession = {
      ...s,
      status: "submitted",
      submitTime: new Date().toISOString(),
      totalScoreEarned,
      maxScore,
      percentage,
      passed,
    };

    handleSubmitStudentExam(updatedSession);
  };

  const handleResetStudentSession = (sessionId: string) => {
    const updatedHistory = history.filter((h) => h.id !== sessionId);
    setHistoryState(updatedHistory);
    saveExamHistory(updatedHistory);
    if (activeSession?.id === sessionId) {
      setActiveSessionState(null);
      saveActiveStudentSession(null);
    }
  };

  const handleReloadAllData = () => {
    setSchoolProfileState(getSchoolProfile());
    const allExams = getExamPackages();
    setExamsState(allExams);
    const savedActive = getActiveExamId();
    setActiveExamIdState(allExams.some((e) => e.id === savedActive) ? savedActive : allExams[0]?.id || "");
    setTokensState(getStudentTokens());
    setHistoryState(getExamHistory());
    setActiveSessionState(getActiveStudentSession());
  };

  // Nav Items Definition
  const navTabs: { id: NavigationTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "student_exam", label: "Mode Ujian Siswa (Slides)", icon: GraduationCap },
    { id: "monitoring", label: "Monitoring & Penilaian", icon: Monitor },
    { id: "ai_generator", label: "AI Generator & Editor Soal", icon: Sparkles },
    { id: "item_analysis", label: "Analisis Butir & Riwayat", icon: BarChart3 },
    { id: "tokens", label: "Token & Kode Soal", icon: Key },
    { id: "school_profile", label: "Profil Sekolah & Kop Docs", icon: Building2 },
    { id: "backup_restore", label: "Backup & Restore", icon: Cloud },
  ];

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-300 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Main Navigation Bar */}
      <header className="bg-[#0c0c0e] border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Brand Logo & Name */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 font-bold shrink-0">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-white text-base sm:text-lg tracking-tight">
                    SlideExam <span className="text-indigo-400">CBT</span>
                  </h1>
                  <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 font-semibold rounded text-[10px] uppercase border border-indigo-500/20 hidden sm:inline">
                    Gemini AI
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden md:block">
                  Aplikasi Ujian Berbasis Presentasi Slides & Penilaian Otomatis
                </p>
              </div>
            </div>

            {/* Exam Package Switcher (for Teacher/Admin) */}
            <div className="hidden lg:flex items-center gap-2 bg-[#1a1a1c] px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Naskah:</span>
              <select
                value={activeExamId}
                onChange={(e) => handleSelectExamId(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-200 focus:outline-none max-w-[200px] truncate cursor-pointer"
              >
                {exams.map((e) => (
                  <option key={e.id} value={e.id} className="bg-[#121214] text-slate-200">
                    {e.title} ({e.code})
                  </option>
                ))}
              </select>
              <button
                onClick={handleCreateNewExam}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Buat Paket Ujian Baru"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Desktop Active Mode Tab Selector & Gemini Key Button */}
            <div className="flex items-center gap-2">
              <button
                id="btn-gemini-key"
                onClick={() => setIsGeminiModalOpen(true)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  geminiStatus?.configured
                    ? "bg-indigo-950/40 hover:bg-indigo-900/50 border-indigo-500/40 text-indigo-300 shadow-sm"
                    : "bg-amber-950/30 hover:bg-amber-900/40 border-amber-500/40 text-amber-300 animate-pulse"
                }`}
                title="Hubungkan atau kelola Kunci API Gemini AI"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Kunci API Gemini</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    geminiStatus?.configured ? "bg-emerald-400 shadow-xs shadow-emerald-400" : "bg-amber-400"
                  }`}
                />
              </button>

              <button
                id="btn-mode-siswa"
                onClick={() => setActiveTab("student_exam")}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === "student_exam"
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                    : "bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-800"
                }`}
              >
                <Play className="w-3.5 h-3.5 fill-current text-white" />
                <span>Mode Siswa</span>
              </button>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-xl bg-[#1a1a1c] border border-slate-800 text-slate-300 md:hidden cursor-pointer"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Secondary Desktop Horizontal Tabs */}
          <div className="hidden md:flex space-x-1 py-1.5 overflow-x-auto scrollbar-none border-t border-slate-800/80 text-xs font-medium">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`nav-tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "bg-[#1a1a1c] text-white border border-slate-700 shadow-sm"
                      : "text-slate-400 hover:text-white hover:bg-[#121214]"
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-[#0c0c0e] px-4 py-3 space-y-2">
            {/* Exam selector mobile */}
            <div className="p-2.5 bg-[#121214] rounded-xl border border-slate-800 space-y-1">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Pilih Naskah Ujian:</label>
              <select
                value={activeExamId}
                onChange={(e) => {
                  handleSelectExamId(e.target.value);
                  setIsMobileMenuOpen(false);
                }}
                className="w-full bg-[#1a1a1c] text-slate-200 border border-slate-700 rounded-lg p-2 text-xs font-semibold"
              >
                {exams.map((e) => (
                  <option key={e.id} value={e.id} className="bg-[#121214] text-slate-200">
                    {e.title} ({e.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              {navTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setIsMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive ? "bg-indigo-600 text-white" : "text-slate-300 hover:bg-[#1a1a1c]"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* TAB 1: Mode Ujian Siswa (Slide Presentation CBT) */}
        {activeTab === "student_exam" && (
          <StudentSlideExam
            exam={activeExam}
            tokens={tokens}
            currentSession={activeSession}
            onSaveSession={handleSaveStudentSession}
            onSubmitExam={handleSubmitStudentExam}
            onExit={() => setActiveTab("monitoring")}
          />
        )}

        {/* TAB 2: Live Monitoring & Real-Time Grading Dashboard */}
        {activeTab === "monitoring" && (
          <LiveMonitoringDashboard
            exam={activeExam}
            school={schoolProfile}
            history={history}
            tokens={tokens}
            onForceSubmitStudent={handleForceSubmitStudent}
            onResetStudentSession={handleResetStudentSession}
          />
        )}

        {/* TAB 3: Gemini AI Question Generator & Slide Editor */}
        {activeTab === "ai_generator" && (
          <AIGeneratorAndEditor
            activeExam={activeExam}
            onUpdateExam={handleUpdateActiveExam}
            onPreviewSlides={() => setActiveTab("student_exam")}
            onOpenGeminiModal={() => setIsGeminiModalOpen(true)}
          />
        )}

        {/* TAB 4: Item Analysis & History with Bulk Sheets Download */}
        {activeTab === "item_analysis" && (
          <ItemAnalysisAndHistory
            exam={activeExam}
            school={schoolProfile}
            history={history}
          />
        )}

        {/* TAB 5: Exam Codes & Token Manager */}
        {activeTab === "tokens" && (
          <TokenManager
            exam={activeExam}
            school={schoolProfile}
            tokens={tokens}
            onUpdateExamToken={handleUpdateExamToken}
            onUpdateTokens={handleUpdateTokens}
          />
        )}

        {/* TAB 6: School Profile & Formal Docs Print */}
        {activeTab === "school_profile" && (
          <SchoolProfileAndPrintView
            school={schoolProfile}
            activeExam={activeExam}
            onUpdateSchool={handleUpdateSchool}
            onUpdateExam={handleUpdateActiveExam}
          />
        )}

        {/* TAB 7: Backup & Restore (Google Drive Sync Folder) */}
        {activeTab === "backup_restore" && (
          <BackupRestoreView onDataRestored={handleReloadAllData} />
        )}
      </main>

      {/* Gemini API Key Configuration Modal */}
      <GeminiApiKeyModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        onKeyUpdated={checkGeminiStatus}
      />

      {/* Modern Compact Footer */}
      <footer className="bg-[#0c0c0e] border-t border-slate-800 py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-300">SlideExam CBT</span>
            <span>•</span>
            <span className="text-slate-400">{schoolProfile.schoolName}</span>
          </div>
          <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Didukung oleh Google Gemini AI • Auto-Grading CBT Engine
          </div>
        </div>
      </footer>
    </div>
  );
}
