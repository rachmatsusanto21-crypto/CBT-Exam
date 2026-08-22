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
  X,
  Share2,
  ExternalLink
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
import { DirectStudentShareModal } from "./components/DirectStudentShareModal";
import { getGeminiRequestHeaders } from "./utils/storage";

export default function App() {
  // Direct Student Link Detection
  const [isDirectStudentMode, setIsDirectStudentMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    return params.get("mode") === "student";
  });

  const [urlToken, setUrlToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  });

  // Navigation & View State
  const [activeTab, setActiveTab] = useState<NavigationTab>("student_exam");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState<{ configured: boolean; source: string } | null>(null);

  // App Data State
  const [schoolProfile, setSchoolProfileState] = useState<SchoolProfile>(getSchoolProfile);
  const [exams, setExamsState] = useState<ExamPackage[]>(getExamPackages);
  const [activeExamId, setActiveExamIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const examParam = params.get("examId") || params.get("code");
      const all = getExamPackages();
      if (examParam) {
        const found = all.find((e) => e.id === examParam || e.code.toUpperCase() === examParam.toUpperCase());
        if (found) return found.id;
      }
    }
    const saved = getActiveExamId();
    const all = getExamPackages();
    return all.some((e) => e.id === saved) ? saved : all[0]?.id || "";
  });
  const [tokens, setTokensState] = useState<StudentTokenItem[]>(getStudentTokens);
  const [history, setHistoryState] = useState<StudentExamSession[]>(getExamHistory);
  const [activeSession, setActiveSessionState] = useState<StudentExamSession | null>(getActiveStudentSession);

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

  // Listen to popstate / url changes
  useEffect(() => {
    const handleUrlCheck = () => {
      const params = new URLSearchParams(window.location.search);
      const isStudent = params.get("mode") === "student";
      setIsDirectStudentMode(isStudent);
      const token = params.get("token");
      if (token) setUrlToken(token);
      const examParam = params.get("examId") || params.get("code");
      if (examParam) {
        const found = exams.find((e) => e.id === examParam || e.code.toUpperCase() === examParam.toUpperCase());
        if (found) {
          setActiveExamIdState(found.id);
          saveActiveExamId(found.id);
        }
      }
    };
    window.addEventListener("popstate", handleUrlCheck);
    return () => window.removeEventListener("popstate", handleUrlCheck);
  }, [exams]);

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

    const finalized: StudentExamSession = {
      ...s,
      status: "submitted",
      submitTime: new Date().toISOString(),
      totalScoreEarned,
      maxScore,
      percentage,
      passed,
    };

    handleSubmitStudentExam(finalized);
  };

  const handleResetStudentSession = (sessionId: string) => {
    const updatedHistory = history.filter((item) => item.id !== sessionId);
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
    setActiveExamIdState(getActiveExamId() || allExams[0]?.id || "");
    setTokensState(getStudentTokens());
    setHistoryState(getExamHistory());
    setActiveSessionState(getActiveStudentSession());
  };

  // Navigation Items
  const navTabs = [
    { id: "student_exam" as NavigationTab, label: "Mode Siswa (Slide CBT)", icon: Play },
    { id: "monitoring" as NavigationTab, label: "Live Monitoring Guru", icon: Monitor },
    { id: "ai_generator" as NavigationTab, label: "Editor Soal & AI Gemini", icon: Sparkles },
    { id: "item_analysis" as NavigationTab, label: "Analisis Butir & Nilai", icon: BarChart3 },
    { id: "tokens" as NavigationTab, label: "Token & Kode Akses", icon: Key },
    { id: "school_profile" as NavigationTab, label: "Profil & Cetak Naskah", icon: Building2 },
    { id: "backup_restore" as NavigationTab, label: "Sinkronisasi Cloud", icon: Cloud },
  ];

  // =========================================================================
  // STANDALONE DIRECT STUDENT LINK VIEW (NO TEACHER NAVIGATION / DISTRACTIONS)
  // =========================================================================
  if (isDirectStudentMode) {
    return (
      <div className="min-h-screen bg-[#09090b] text-slate-100 flex flex-col justify-between selection:bg-indigo-600 selection:text-white">
        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8">
          <StudentSlideExam
            exam={activeExam}
            tokens={tokens}
            currentSession={activeSession}
            onSaveSession={handleSaveStudentSession}
            onSubmitExam={handleSubmitStudentExam}
            onExit={() => {
              // Switch back to normal admin mode
              const url = new URL(window.location.href);
              url.searchParams.delete("mode");
              url.searchParams.delete("token");
              url.searchParams.delete("examId");
              window.history.pushState({}, "", url.toString());
              setIsDirectStudentMode(false);
              setActiveTab("monitoring");
            }}
            initialToken={urlToken}
            isDirectLink={true}
          />
        </main>

        <footer className="bg-[#0c0c0e] border-t border-slate-850 py-3 px-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="text-[11px] text-slate-400">
              {activeExam.schoolProfile.schoolName} • SlideExam CBT Siswa
            </div>
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.delete("mode");
                window.history.pushState({}, "", url.toString());
                setIsDirectStudentMode(false);
                setActiveTab("monitoring");
              }}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer underline"
            >
              Masuk ke Dashboard Guru / Admin
            </button>
          </div>
        </footer>
      </div>
    );
  }

  // =========================================================================
  // TEACHER / ADMIN WORKSPACE VIEW
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#09090b] text-slate-100 flex flex-col selection:bg-indigo-600 selection:text-white">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-[#0c0c0e]/95 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & School Name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-950 shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-white tracking-tight">SlideExam AI CBT</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                  v2.6 Multi-Format
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate max-w-[200px] lg:max-w-xs">
                {schoolProfile.schoolName}
              </p>
            </div>
          </div>

          {/* Active Exam Selector Dropdown & Direct Share */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <select
                id="active-exam-selector"
                value={activeExamId}
                onChange={(e) => handleSelectExamId(e.target.value)}
                className="bg-[#161618] text-slate-200 text-xs font-semibold rounded-xl pl-3 pr-8 py-2 border border-slate-700 hover:border-slate-600 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer max-w-[170px] sm:max-w-[240px] truncate"
              >
                {exams.map((e) => (
                  <option key={e.id} value={e.id} className="bg-[#121214] text-slate-200">
                    {e.title} ({e.questions.length} Soal)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 pointer-events-none" />
            </div>

            {/* Quick Share Link Modal Trigger */}
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="p-2 sm:px-3 sm:py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm shrink-0"
              title="Bagikan Tautan Ujian Siswa Langsung"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Bagikan Link Siswa</span>
            </button>

            <button
              onClick={handleCreateNewExam}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors cursor-pointer shrink-0"
              title="Buat Paket Naskah Ujian Baru"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Gemini API Key Status Badge */}
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={() => setIsGeminiModalOpen(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                geminiStatus?.configured
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              <span>{geminiStatus?.configured ? "Gemini AI Aktif" : "Set Kunci Gemini"}</span>
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex md:hidden">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-xl bg-[#161618] text-slate-300 border border-slate-700 cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:flex border-t border-slate-800/80 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto overflow-x-auto scrollbar-none">
          <nav className="flex space-x-1 py-1.5 min-w-max">
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-950"
                      : "text-slate-400 hover:text-slate-200 hover:bg-[#161618]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Mobile Navigation Drawer */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-[#0c0c0e] p-4 space-y-3 animate-in slide-in-from-top-2">
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
            activeToken={activeExam.sessionToken}
            school={schoolProfile}
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
            onUpdateExam={handleUpdateActiveExam}
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

      {/* Direct Student Share Modal */}
      <DirectStudentShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        exam={activeExam}
        token={activeExam.sessionToken}
      />

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
