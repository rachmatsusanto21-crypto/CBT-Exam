import React, { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  UserCheck,
  Building2,
  GraduationCap,
  Sparkles,
  HelpCircle,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Layers,
  Key,
  ShieldCheck,
  ShieldAlert,
  Check,
  Send,
  Volume2,
  VolumeX,
  BellRing,
  X
} from "lucide-react";
import {
  ExamPackage,
  Question,
  StudentAnswerItem,
  StudentExamSession,
  StudentTokenItem,
  CheatingViolationLog
} from "../types";
import { StudentResultView } from "./StudentResultView";
import { prepareStudentExamQuestions } from "../utils/shuffle";
import {
  playExamTimeWarningSound,
  isSoundNotificationEnabled,
  setSoundNotificationEnabled,
} from "../utils/audioAlert";

interface StudentSlideExamProps {
  exam: ExamPackage;
  tokens: StudentTokenItem[];
  currentSession: StudentExamSession | null;
  onSaveSession: (session: StudentExamSession) => void;
  onSubmitExam: (session: StudentExamSession) => void;
  onExit: () => void;
}

export const StudentSlideExam: React.FC<StudentSlideExamProps> = ({
  exam,
  tokens,
  currentSession,
  onSaveSession,
  onSubmitExam,
  onExit,
}) => {
  // Login Gate State (if no session active)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(!!currentSession);
  const [loginStudentName, setLoginStudentName] = useState("");
  const [loginNisn, setLoginNisn] = useState("");
  const [loginClass, setLoginClass] = useState("X MIPA 1");
  const [loginExamCode, setLoginExamCode] = useState(exam.code);
  const [loginToken, setLoginToken] = useState(exam.sessionToken);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active Session State
  const [session, setSession] = useState<StudentExamSession | null>(currentSession);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(currentSession?.currentSlideIndex || 0);
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("normal");
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);
  const [showMatrixDrawer, setShowMatrixDrawer] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(currentSession?.status === "submitted");

  // Sound Warning & Alert Banner State
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => isSoundNotificationEnabled());
  const [dismissedWarningBanner, setDismissedWarningBanner] = useState<boolean>(false);
  const hasAlerted5Min = useRef<boolean>(false);
  const hasAlerted1Min = useRef<boolean>(false);

  // Anti-Cheating & Fullscreen State
  const [isFullscreenActive, setIsFullscreenActive] = useState<boolean>(
    typeof document !== "undefined" ? !!document.fullscreenElement : false
  );
  const [violationAlertModal, setViolationAlertModal] = useState<{
    show: boolean;
    type: string;
    message: string;
    count: number;
  }>({
    show: false,
    type: "",
    message: "",
    count: 0,
  });

  const requestFullscreenSafe = async () => {
    try {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      setIsFullscreenActive(true);
    } catch (err) {
      console.warn("Fullscreen request not permitted or blocked", err);
    }
  };

  const exitFullscreenSafe = async () => {
    try {
      const doc = document as any;
      if (doc.exitFullscreen) {
        await doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen();
      }
      setIsFullscreenActive(false);
    } catch (err) {
      console.warn("Exit fullscreen error:", err);
    }
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      exitFullscreenSafe();
    } else {
      requestFullscreenSafe();
    }
  };

  // Timer State (seconds remaining)
  const totalDurationSeconds = (exam.durationMinutes || 45) * 60;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (currentSession) {
      const elapsed = Math.floor((Date.now() - new Date(currentSession.startTime).getTime()) / 1000);
      return Math.max(0, totalDurationSeconds - elapsed);
    }
    return totalDurationSeconds;
  });

  // Active Questions for this student session (supports question & option shuffling)
  const activeQuestions: Question[] = session?.shuffledQuestions && session.shuffledQuestions.length > 0
    ? session.shuffledQuestions
    : exam.questions;

  // Calculate Slide structure:
  // Slide 0: Profil Sekolah & Identitas Ujian
  // Slide 1: Profil Mata Pelajaran & Guru Pengampu
  // Slide 2: Petunjuk Pengerjaan & Tata Tertib
  // Slide 3 to (3 + activeQuestions.length - 1): Question Slides
  // Slide (3 + activeQuestions.length): Lembar Ringkasan & Konfirmasi
  const totalSlides = 3 + activeQuestions.length + 1;
  const isIntroSlide = currentSlideIndex < 3;
  const isFinalSlide = currentSlideIndex === totalSlides - 1;
  const currentQuestionIndex = currentSlideIndex >= 3 && currentSlideIndex < totalSlides - 1 ? currentSlideIndex - 3 : -1;
  const currentQuestion: Question | null = currentQuestionIndex >= 0 ? activeQuestions[currentQuestionIndex] : null;

  // Sync Timer & Trigger Sound Warning at <5m (300s) and <1m (60s)
  useEffect(() => {
    if (!isLoggedIn || isSubmitted || secondsRemaining <= 0) return;

    // Check milestones for sound alert
    if (secondsRemaining <= 300 && secondsRemaining > 60 && !hasAlerted5Min.current) {
      hasAlerted5Min.current = true;
      if (soundEnabled) {
        playExamTimeWarningSound("5min");
      }
    }

    if (secondsRemaining <= 60 && secondsRemaining > 0 && !hasAlerted1Min.current) {
      hasAlerted1Min.current = true;
      if (soundEnabled) {
        playExamTimeWarningSound("1min");
      }
    }

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleFinalSubmit("timed_out");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoggedIn, isSubmitted, secondsRemaining, soundEnabled]);

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setSoundNotificationEnabled(next);
    if (next) {
      playExamTimeWarningSound("test");
    }
  };

  // Anti-cheating detection: tab switching, window blur, and exiting fullscreen
  useEffect(() => {
    if (!isLoggedIn || isSubmitted) return;

    let lastViolationTime = 0;

    const triggerViolation = (violationType: "tab_switch" | "window_blur" | "fullscreen_exit", message: string) => {
      const now = Date.now();
      // Debounce rapid consecutive blur events within 2.5 seconds
      if (now - lastViolationTime < 2500) return;
      lastViolationTime = now;

      setSession((prevSession) => {
        if (!prevSession || prevSession.status === "submitted") return prevSession;

        const newViolation: CheatingViolationLog = {
          id: `viol-${now}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          violationType,
          message,
        };

        const existingViolations = prevSession.cheatViolations || [];
        const updatedViolations = [...existingViolations, newViolation];
        const newCount = (prevSession.violationCount || 0) + 1;

        const updatedSession: StudentExamSession = {
          ...prevSession,
          cheatViolations: updatedViolations,
          violationCount: newCount,
        };

        onSaveSession(updatedSession);

        setViolationAlertModal({
          show: true,
          type: violationType,
          message,
          count: newCount,
        });

        return updatedSession;
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        triggerViolation(
          "tab_switch",
          "Terdeteksi beralih tab atau membuka aplikasi lain di luar layar ujian CBT."
        );
      }
    };

    const handleWindowBlur = () => {
      triggerViolation(
        "window_blur",
        "Jendela ujian kehilangan fokus / terindikasi beralih ke program lain."
      );
    };

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreenActive(isFull);
      // If student exited fullscreen while doing exam questions (slide >= 3)
      if (!isFull && currentSlideIndex >= 3) {
        triggerViolation(
          "fullscreen_exit",
          "Terdeteksi keluar dari mode layar penuh (fullscreen) saat pengerjaan soal."
        );
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isLoggedIn, isSubmitted, currentSlideIndex, onSaveSession]);

  // Keyboard navigation & shortcut A,B,C,D,E
  useEffect(() => {
    if (!isLoggedIn || isSubmitted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in an input
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) return;

      const key = e.key.toUpperCase();
      if (currentQuestion && ["A", "B", "C", "D", "E"].includes(key)) {
        handleSelectOption(currentQuestion.id, key);
      } else if (e.key === "ArrowRight") {
        handleNextSlide();
      } else if (e.key === "ArrowLeft") {
        handlePrevSlide();
      } else if (e.key.toLowerCase() === "r" && currentQuestion) {
        handleToggleFlag(currentQuestion.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoggedIn, isSubmitted, currentSlideIndex, currentQuestion, session]);

  const executeStartExam = async (enterFullscreen: boolean = false) => {
    setLoginError(null);

    if (!loginStudentName.trim()) {
      setLoginError("Mohon masukkan Nama Lengkap Siswa.");
      return;
    }

    // Validate token against exam package or student tokens list
    const isMasterTokenValid = loginToken.trim().toUpperCase() === exam.sessionToken.toUpperCase();
    const isStudentTokenValid = tokens.some(
      (t) =>
        t.examCode.toUpperCase() === loginExamCode.trim().toUpperCase() &&
        t.token.toUpperCase() === loginToken.trim().toUpperCase()
    );

    if (!isMasterTokenValid && !isStudentTokenValid) {
      setLoginError("Kode Soal atau Token Ujian tidak valid. Pastikan token sesuai dengan yang diberikan oleh Pengawas.");
      return;
    }

    if (enterFullscreen) {
      await requestFullscreenSafe();
    }

    const preparedQuestions = prepareStudentExamQuestions(exam);

    const newSession: StudentExamSession = {
      id: `sess-${Date.now()}`,
      examId: exam.id,
      examCode: exam.code,
      examTitle: exam.title,
      subject: exam.teacherProfile.subject,
      studentName: loginStudentName.trim(),
      nisn: loginNisn.trim() || "0078" + Math.floor(100000 + Math.random() * 900000),
      className: loginClass,
      token: loginToken.trim().toUpperCase(),
      currentSlideIndex: 0,
      answers: {},
      startTime: new Date().toISOString(),
      timeSpentSeconds: 0,
      totalScoreEarned: 0,
      maxScore: exam.totalScore,
      percentage: 0,
      passed: false,
      status: "in_progress",
      shuffledQuestions: preparedQuestions,
      cheatViolations: [],
      violationCount: 0,
    };

    setSession(newSession);
    setIsLoggedIn(true);
    setCurrentSlideIndex(0);
    setSecondsRemaining(totalDurationSeconds);
    onSaveSession(newSession);
  };

  const handleStartExamLogin = (e: React.FormEvent) => {
    e.preventDefault();
    executeStartExam(false);
  };

  const handleSelectOption = (questionId: string, optionKey: string) => {
    if (!session || isSubmitted) return;

    const q = activeQuestions.find((item) => item.id === questionId);
    const isCorrect = q ? q.correctAnswer.toUpperCase() === optionKey.toUpperCase() : false;
    const scoreEarned = isCorrect ? (q?.score || 0) : 0;

    const currentAnswer = session.answers[questionId] || {
      questionId,
      selectedOption: "",
      isFlagged: false,
    };

    const updatedAnswer: StudentAnswerItem = {
      ...currentAnswer,
      selectedOption: optionKey,
      isCorrect,
      scoreEarned,
      answeredAt: new Date().toISOString(),
    } as any;

    const updatedAnswers = {
      ...session.answers,
      [questionId]: updatedAnswer,
    };

    const updatedSession: StudentExamSession = {
      ...session,
      answers: updatedAnswers,
    };

    setSession(updatedSession);
    onSaveSession(updatedSession);
  };

  const handleToggleFlag = (questionId: string) => {
    if (!session || isSubmitted) return;

    const currentAnswer = session.answers[questionId] || {
      questionId,
      selectedOption: "",
      isFlagged: false,
    };

    const updatedAnswer: StudentAnswerItem = {
      ...currentAnswer,
      isFlagged: !currentAnswer.isFlagged,
    };

    const updatedAnswers = {
      ...session.answers,
      [questionId]: updatedAnswer,
    };

    const updatedSession: StudentExamSession = {
      ...session,
      answers: updatedAnswers,
    };

    setSession(updatedSession);
    onSaveSession(updatedSession);
  };

  const handleNextSlide = () => {
    if (currentSlideIndex < totalSlides - 1) {
      const nextIdx = currentSlideIndex + 1;
      setCurrentSlideIndex(nextIdx);
      if (session) {
        onSaveSession({ ...session, currentSlideIndex: nextIdx });
      }
    }
  };

  const handlePrevSlide = () => {
    if (currentSlideIndex > 0) {
      const prevIdx = currentSlideIndex - 1;
      setCurrentSlideIndex(prevIdx);
      if (session) {
        onSaveSession({ ...session, currentSlideIndex: prevIdx });
      }
    }
  };

  const handleJumpToSlide = (slideIdx: number) => {
    setCurrentSlideIndex(slideIdx);
    setShowMatrixDrawer(false);
    if (session) {
      onSaveSession({ ...session, currentSlideIndex: slideIdx });
    }
  };

  const handleFinalSubmit = (status: "submitted" | "timed_out" = "submitted") => {
    if (!session) return;

    let totalScoreEarned = 0;
    activeQuestions.forEach((q) => {
      const ans = session.answers[q.id];
      if (ans && ans.selectedOption.toUpperCase() === q.correctAnswer.toUpperCase()) {
        totalScoreEarned += q.score;
      }
    });

    const maxScore = exam.totalScore > 0 ? exam.totalScore : 100;
    const percentage = Math.round((totalScoreEarned / maxScore) * 100);
    const passed = percentage >= (exam.teacherProfile.passingGrade || 75);
    const timeSpentSeconds = totalDurationSeconds - secondsRemaining;

    const finalizedSession: StudentExamSession = {
      ...session,
      status,
      submitTime: new Date().toISOString(),
      timeSpentSeconds,
      totalScoreEarned,
      maxScore,
      percentage,
      passed,
    };

    setSession(finalizedSession);
    setIsSubmitted(true);
    setShowSummaryModal(false);
    onSubmitExam(finalizedSession);
  };

  // Format Timer
  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
  };

  const isLowTime = secondsRemaining <= 300; // < 5 minutes

  // If exam completed and submitted, show Result View
  if (isSubmitted && session) {
    return <StudentResultView session={session} exam={exam} onExit={onExit} />;
  }

  // LOGIN GATE / TOKEN AUTH VIEW
  if (!isLoggedIn) {
    return (
      <div id="student-login-gate" className="max-w-xl mx-auto py-8">
        <div className="bg-[#121214] rounded-3xl p-8 border border-slate-800 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
              <GraduationCap className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-white">Portal Ujian CBT Slides</h2>
            <p className="text-xs text-slate-400">
              Silakan masukkan identitas diri, Kode Soal, dan Token Ujian yang diberikan oleh Pengawas untuk memulai.
            </p>
          </div>

          {loginError && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleStartExamLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Nama Lengkap Siswa *</label>
              <input
                type="text"
                required
                value={loginStudentName}
                onChange={(e) => setLoginStudentName(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#1a1a1c] border border-slate-700 rounded-xl text-white text-sm font-medium focus:bg-[#161618] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-500"
                placeholder="Contoh: Muhammad Farhan Pratama"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">NISN / No. Induk</label>
                <input
                  type="text"
                  value={loginNisn}
                  onChange={(e) => setLoginNisn(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#1a1a1c] border border-slate-700 rounded-xl text-white text-sm focus:bg-[#161618] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none font-mono placeholder-slate-500"
                  placeholder="0078123456"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Kelas</label>
                <input
                  type="text"
                  value={loginClass}
                  onChange={(e) => setLoginClass(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#1a1a1c] border border-slate-700 rounded-xl text-white text-sm focus:bg-[#161618] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-500"
                  placeholder="X MIPA 1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Kode Soal</label>
                <input
                  type="text"
                  value={loginExamCode}
                  onChange={(e) => setLoginExamCode(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#1a1a1c] border border-slate-700 rounded-xl text-white text-sm font-mono font-bold uppercase focus:bg-[#161618] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-indigo-300 mb-1 flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Token Sesi Ujian *</span>
                </label>
                <input
                  type="text"
                  required
                  value={loginToken}
                  onChange={(e) => setLoginToken(e.target.value.toUpperCase())}
                  className="w-full px-4 py-2.5 bg-indigo-950/40 border border-indigo-500/40 rounded-xl text-indigo-200 text-sm font-mono font-bold uppercase tracking-widest text-center focus:bg-indigo-950/60 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-indigo-500/50"
                  placeholder="TOKEN"
                />
              </div>
            </div>

            <div className="p-3 bg-[#161618] rounded-2xl border border-slate-800 text-xs text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-slate-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Paket Ujian Terpilih:</span>
              </div>
              <p className="font-medium text-slate-300">{exam.title}</p>
              <p className="text-[11px] text-slate-500">
                Mata Pelajaran: {exam.teacherProfile.subject} ({exam.questions.length} Soal, {exam.durationMinutes} Menit)
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                id="student-login-fullscreen-btn"
                type="button"
                onClick={() => executeStartExam(true)}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold text-sm transition-all shadow-lg shadow-emerald-950 cursor-pointer flex items-center justify-center gap-2"
              >
                <Maximize2 className="w-4 h-4" />
                <span>Mulai Ujian Fullscreen (Layar Penuh)</span>
              </button>

              <button
                id="student-login-submit-btn"
                type="submit"
                className="w-full py-2.5 px-4 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-2xl font-medium text-xs transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                <span>Mulai Ujian Mode Standar</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // SLIDE PRESENTATION MAIN CONTAINER
  const answeredCount = Object.keys(session?.answers || {}).length;
  const progressPercent = Math.round(((currentSlideIndex + 1) / totalSlides) * 100);

  return (
    <div id="slide-exam-container" className="max-w-5xl mx-auto space-y-4">
      {/* Top Presentation Bar */}
      <div className="bg-[#121214] rounded-2xl px-5 py-3 border border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-3">
        {/* Left: Slide Indicator & Title */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-[#1a1a1c] border border-slate-700 text-indigo-300 rounded-xl text-xs font-semibold font-mono">
            Slide {currentSlideIndex + 1} / {totalSlides}
          </div>
          <div>
            <h3 className="text-xs font-bold text-white line-clamp-1">{exam.title}</h3>
            <p className="text-[11px] text-slate-400">
              Siswa: <span className="font-semibold text-slate-300">{session?.studentName}</span> ({session?.className})
            </p>
          </div>
        </div>

        {/* Center / Right: Floating Timer, Sound Toggle, Font Size, Matrix Drawer */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Sound Alert Toggle */}
          <button
            id="toggle-exam-sound-btn"
            onClick={handleToggleSound}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              soundEnabled
                ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20"
                : "bg-[#1a1a1c] border-slate-700 text-slate-500 hover:text-slate-400"
            }`}
            title={soundEnabled ? "Notifikasi Suara Aktif (Klik untuk mute)" : "Notifikasi Suara Nonaktif (Klik untuk aktifkan)"}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden md:inline text-[11px]">{soundEnabled ? "Suara ON" : "Suara Mute"}</span>
          </button>

          {/* Timer Badge */}
          <div
            id="student-exam-timer-badge"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold text-xs border transition-all ${
              secondsRemaining <= 60
                ? "bg-rose-600/25 border-rose-500 text-rose-200 animate-bounce ring-2 ring-rose-500/40 shadow-lg shadow-rose-950"
                : isLowTime
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 animate-pulse ring-1 ring-amber-500/30"
                : "bg-indigo-500/10 border-indigo-500/20 text-indigo-300"
            }`}
          >
            {isLowTime ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
            ) : (
              <Clock className="w-3.5 h-3.5" />
            )}
            <span>{formatTime(secondsRemaining)}</span>
            {isLowTime && (
              <span className="hidden lg:inline text-[10px] uppercase font-sans font-bold px-1.5 py-0.2 bg-rose-500/20 text-rose-300 rounded border border-rose-500/30">
                {secondsRemaining <= 60 ? "Kritis" : "< 5 Menit"}
              </span>
            )}
          </div>

          {/* Font Resizer */}
          <div className="hidden sm:flex items-center bg-[#1a1a1c] border border-slate-700 rounded-xl p-0.5 text-xs">
            <button
              onClick={() => setFontSize("normal")}
              className={`px-2 py-1 rounded-lg font-semibold cursor-pointer ${
                fontSize === "normal" ? "bg-[#28282c] shadow-xs text-white" : "text-slate-400"
              }`}
              title="Ukuran Font Normal"
            >
              A
            </button>
            <button
              onClick={() => setFontSize("large")}
              className={`px-2 py-1 rounded-lg font-semibold cursor-pointer text-sm ${
                fontSize === "large" ? "bg-[#28282c] shadow-xs text-white" : "text-slate-400"
              }`}
              title="Ukuran Font Besar"
            >
              A+
            </button>
          </div>

          {/* Fullscreen Toggle Button */}
          <button
            id="toggle-fullscreen-btn"
            onClick={toggleFullscreen}
            className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              isFullscreenActive
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                : "bg-[#1a1a1c] border-slate-700 text-slate-400 hover:text-white"
            }`}
            title={isFullscreenActive ? "Keluar Layar Penuh (Fullscreen)" : "Masuk Mode Layar Penuh (Fullscreen)"}
          >
            {isFullscreenActive ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden md:inline text-[11px]">{isFullscreenActive ? "Layar Penuh" : "Fullscreen"}</span>
          </button>

          {/* Quick Matrix Drawer Toggle */}
          <button
            onClick={() => setShowMatrixDrawer(!showMatrixDrawer)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Kisi Soal ({answeredCount}/{activeQuestions.length})</span>
          </button>
        </div>
      </div>

      {/* Visual Warning Banner When Remaining Time <= 5 Minutes */}
      {isLowTime && !dismissedWarningBanner && (
        <div
          id="five-minute-warning-banner"
          className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
            secondsRemaining <= 60
              ? "bg-rose-950/50 border-rose-500/60 text-rose-200 shadow-xl shadow-rose-950/50 ring-1 ring-rose-500/40"
              : "bg-amber-950/40 border-amber-500/50 text-amber-200 shadow-lg shadow-amber-950/30"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                secondsRemaining <= 60
                  ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse"
              }`}
            >
              {secondsRemaining <= 60 ? (
                <BellRing className="w-5 h-5 text-rose-400 animate-bounce" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white">
                  {secondsRemaining <= 60
                    ? "🚨 Peringatan Kritis: Waktu Ujian Hampir Habis!"
                    : "⚠️ Peringatan Sisa Waktu Ujian Kurang dari 5 Menit!"}
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-black/40 border border-white/10 text-white">
                  Tersisa {formatTime(secondsRemaining)}
                </span>
              </div>
              <p className="text-[11px] opacity-90 truncate sm:whitespace-normal mt-0.5">
                {secondsRemaining <= 60
                  ? "Waktu pengerjaan tersisa kurang dari 1 menit! Sistem akan otomatis menyimpan dan mengumpulkan jawaban."
                  : `Waktu pengerjaan tersisa ${formatTime(secondsRemaining)}. Periksa lembar ringkasan dan pastikan seluruh ${activeQuestions.length} soal telah terjawab.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowMatrixDrawer(true)}
              className="hidden sm:inline-flex px-3 py-1.5 bg-black/40 hover:bg-black/60 border border-white/20 rounded-xl text-xs font-semibold text-white transition-all cursor-pointer"
            >
              Periksa Kisi Soal
            </button>
            <button
              onClick={() => setDismissedWarningBanner(true)}
              className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-black/30 cursor-pointer"
              title="Tutup banner peringatan"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Slide Progress Line */}
      <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            secondsRemaining <= 60
              ? "bg-rose-500 animate-pulse"
              : isLowTime
              ? "bg-amber-500"
              : "bg-indigo-500"
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* PRESENTATION SLIDE CARD (16:9 Cinema / Canvas Slide Aesthetic) */}
      <div
        className={`bg-[#121214] rounded-3xl border border-slate-800 shadow-2xl min-h-[500px] flex flex-col justify-between p-6 sm:p-10 relative overflow-hidden transition-all duration-200 text-slate-200 ${
          fontSize === "large" ? "text-base" : fontSize === "xlarge" ? "text-lg" : "text-sm"
        }`}
      >
        {/* ========================================================================= */}
        {/* SLIDE 0: PROFIL SEKOLAH & IDENTITAS UJIAN */}
        {/* ========================================================================= */}
        {currentSlideIndex === 0 && (
          <div className="space-y-6 my-auto text-center animate-in fade-in duration-300">
            {/* Kop Surat Header Logos */}
            <div className="flex items-center justify-center gap-6 pb-4 border-b border-slate-800 max-w-2xl mx-auto">
              {exam.schoolProfile.logoLeftUrl && (
                <img
                  src={exam.schoolProfile.logoLeftUrl}
                  alt="Logo Instansi"
                  className="w-16 h-16 object-contain"
                />
              )}
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {exam.schoolProfile.agencyName}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white uppercase tracking-tight">
                  {exam.schoolProfile.schoolName}
                </h1>
                <p className="text-xs text-slate-400 italic">{exam.schoolProfile.address}</p>
              </div>
              {exam.schoolProfile.logoRightUrl && (
                <img
                  src={exam.schoolProfile.logoRightUrl}
                  alt="Logo Sekolah"
                  className="w-16 h-16 object-contain rounded-full shadow-sm"
                />
              )}
            </div>

            <div className="space-y-2 py-4">
              <span className="px-4 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full font-bold text-xs uppercase tracking-wider inline-block">
                SLIDE 1 • PROFIL SEKOLAH & NASKAH UJIAN
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">{exam.title}</h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto">
                Tahun Ajaran {exam.teacherProfile.academicYear} • Semester {exam.teacherProfile.semester}
              </p>
            </div>

            {exam.schoolProfile.motto && (
              <div className="p-3 bg-[#161618] rounded-2xl border border-slate-800 max-w-lg mx-auto text-xs text-slate-400 italic">
                "{exam.schoolProfile.motto}"
              </div>
            )}

            <div className="pt-4">
              <button
                onClick={handleNextSlide}
                className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-sm shadow-lg shadow-indigo-950 hover:shadow-indigo-900 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <span>Buka Profil Mata Pelajaran & Guru</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SLIDE 1: PROFIL MATA PELAJARAN & GURU PENGAMPU */}
        {/* ========================================================================= */}
        {currentSlideIndex === 1 && (
          <div className="space-y-6 my-auto max-w-3xl mx-auto w-full animate-in fade-in duration-300">
            <div className="text-center space-y-2">
              <span className="px-4 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full font-bold text-xs uppercase tracking-wider inline-block">
                SLIDE 2 • IDENTITAS MATA PELAJARAN & PENGAMPU
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">
                {exam.teacherProfile.subject}
              </h2>
              <p className="text-xs text-slate-400 font-mono">Kode Mata Pelajaran: {exam.teacherProfile.subjectCode}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#161618] rounded-2xl p-5 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Guru Pengampu Ujian</span>
                </div>
                <div className="text-base font-extrabold text-white">{exam.teacherProfile.teacherName}</div>
                <div className="text-xs text-slate-400 font-mono">NIP: {exam.teacherProfile.teacherNIP || "-"}</div>
              </div>

              <div className="bg-[#161618] rounded-2xl p-5 border border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-emerald-400" />
                  <span>Kriteria Penilaian</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Batas Kelulusan (KKM):</span>
                  <span className="px-2.5 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold rounded text-xs">
                    {exam.teacherProfile.passingGrade} Poin
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Alokasi Waktu:</span>
                  <span className="font-semibold text-slate-200 text-xs">{exam.durationMinutes} Menit</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total Butir Soal:</span>
                  <span className="font-semibold text-slate-200 text-xs">{activeQuestions.length} Butir ({exam.totalScore} Poin)</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20 text-xs text-indigo-300 leading-relaxed text-center">
              "Kerjakanlah soal dengan jujur, teliti, dan penuh percaya diri. Kemampuan berpikir kritis Anda adalah kunci keberhasilan."
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={handlePrevSlide}
                className="px-5 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Slide Sebelumnya</span>
              </button>

              <button
                onClick={handleNextSlide}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-bold text-xs shadow-lg shadow-indigo-950 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <span>Buka Petunjuk & Tata Tertib</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SLIDE 2: TATA TERTIB & PANDUAN MENJAWAB */}
        {/* ========================================================================= */}
        {currentSlideIndex === 2 && (
          <div className="space-y-6 my-auto max-w-3xl mx-auto w-full animate-in fade-in duration-300">
            <div className="text-center space-y-2">
              <span className="px-4 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full font-bold text-xs uppercase tracking-wider inline-block">
                SLIDE 3 • PETUNJUK PENGERJAAN UJIAN
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">Tata Tertib & Panduan</h2>
              <p className="text-xs text-slate-400">Harap baca petunjuk berikut sebelum memulai slide pertanyaan.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-2">
                <div className="font-bold text-indigo-400 flex items-center gap-1.5">
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>Shortcut Keyboard</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Tekan huruf <strong>A, B, C, D, atau E</strong> di keyboard untuk langsung memilih jawaban tanpa mouse. Tekan tombol <strong>R</strong> untuk menandai ragu-ragu.
                </p>
              </div>

              <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-2">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Flag className="w-4 h-4 text-amber-400" />
                  <span>Tandai Ragu-Ragu</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Jika belum yakin dengan jawaban, aktifkan tombol <strong>Ragu-Ragu</strong>. Anda dapat meninjau kembali sebelum klik Selesai.
                </p>
              </div>

              <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Waktu & Auto-Save</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Jawaban tersimpan otomatis setiap kali Anda memilih opsi. Jika waktu habis, sistem akan melakukan penilaian secara otomatis.
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4">
              <button
                onClick={handlePrevSlide}
                className="px-5 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>

              <button
                id="start-question-slides-btn"
                onClick={handleNextSlide}
                className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-950 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <span>Mulai Kerjakan Soal #1</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SLIDE 3 to N: INTERACTIVE QUESTION SLIDES */}
        {/* ========================================================================= */}
        {!isIntroSlide && !isFinalSlide && currentQuestion && (
          <div className="space-y-6 animate-in fade-in duration-200 flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {/* Question Slide Meta Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 bg-indigo-600 text-white rounded-xl font-bold text-xs">
                    Nomor Soal {currentQuestion.questionNumber}
                  </span>
                  <span className="text-xs font-semibold text-slate-300 bg-[#1a1a1c] border border-slate-700 px-2 py-0.5 rounded">
                    {currentQuestion.topicTag || "Topik Materi"}
                  </span>
                  {currentQuestion.cognitiveLevel && (
                    <span className="text-xs font-medium text-slate-400 bg-[#161618] px-2 py-0.5 rounded border border-slate-800">
                      {currentQuestion.cognitiveLevel}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-xl">
                    Bobot: {currentQuestion.score} Poin
                  </span>
                  <button
                    onClick={() => handleToggleFlag(currentQuestion.id)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                      session?.answers[currentQuestion.id]?.isFlagged
                        ? "bg-amber-400 text-amber-950 border-amber-500 shadow-sm"
                        : "bg-[#1a1a1c] text-slate-400 border-slate-700 hover:bg-slate-800"
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{session?.answers[currentQuestion.id]?.isFlagged ? "Ragu-Ragu" : "Tandai Ragu"}</span>
                  </button>
                </div>
              </div>

              {/* Stimulus Context Box (If available) */}
              {currentQuestion.stimulus && (
                <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 text-xs text-slate-300 leading-relaxed italic space-y-1">
                  <span className="font-semibold text-slate-200 not-italic block text-[11px] uppercase tracking-wide">
                    Stimulus / Bacaan Kasus:
                  </span>
                  <p>{currentQuestion.stimulus}</p>
                </div>
              )}

              {/* Main Question Text */}
              <div className="font-bold text-white text-base sm:text-lg leading-relaxed py-1">
                {currentQuestion.questionText}
              </div>

              {/* Options Clickable Cards */}
              <div className="space-y-3 pt-2">
                {currentQuestion.options.map((opt) => {
                  const isSelected = session?.answers[currentQuestion.id]?.selectedOption === opt.key;
                  return (
                    <div
                      key={opt.key}
                      id={`option-card-${currentQuestion.id}-${opt.key}`}
                      onClick={() => handleSelectOption(currentQuestion.id, opt.key)}
                      className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3.5 ${
                        isSelected
                          ? "bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500/40"
                          : "bg-[#161618] border-slate-800 hover:border-slate-700 hover:bg-[#1a1a1c]"
                      }`}
                    >
                      <div
                        className={`w-7 h-7 rounded-xl font-bold text-xs flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-[#222226] text-slate-300 border border-slate-700"
                        }`}
                      >
                        {opt.key}
                      </div>

                      <div className="flex-1 font-medium text-slate-200 text-xs sm:text-sm pt-0.5">
                        {opt.text}
                      </div>

                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Slide Action Navigation Footer */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-800 mt-6">
              <button
                onClick={handlePrevSlide}
                className="px-5 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5 transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                  {currentQuestionIndex + 1} dari {activeQuestions.length} Soal
                </span>
              </div>

              <button
                onClick={handleNextSlide}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs cursor-pointer inline-flex items-center gap-2 transition-all shadow-md shadow-indigo-950"
              >
                <span>{currentQuestionIndex === activeQuestions.length - 1 ? "Lembar Ringkasan" : "Selanjutnya"}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SLIDE AKHIR: RINGKASAN & KONFIRMASI SUBMIT */}
        {/* ========================================================================= */}
        {isFinalSlide && (
          <div className="space-y-6 my-auto max-w-3xl mx-auto w-full animate-in fade-in duration-300">
            <div className="text-center space-y-2">
              <span className="px-4 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-full font-bold text-xs uppercase tracking-wider inline-block">
                SLIDE AKHIR • RINGKASAN JAWABAN
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white">Konfirmasi Selesai Ujian</h2>
              <p className="text-xs text-slate-400">
                Periksalah kembali seluruh jawaban Anda. Klik pada nomor soal untuk meninjau kembali.
              </p>
            </div>

            {/* Answer Matrix Grid */}
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2.5 p-5 bg-[#161618] rounded-2xl border border-slate-800 max-h-[260px] overflow-y-auto">
              {activeQuestions.map((q, idx) => {
                const ans = session?.answers[q.id];
                const hasAnswer = !!ans?.selectedOption;
                const isFlagged = !!ans?.isFlagged;

                let badgeStyle = "bg-[#1a1a1c] border-slate-700 text-slate-400";
                if (isFlagged) {
                  badgeStyle = "bg-amber-400 border-amber-500 text-amber-950 font-bold";
                } else if (hasAnswer) {
                  badgeStyle = "bg-emerald-600 border-emerald-500 text-white font-bold";
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => handleJumpToSlide(3 + idx)}
                    className={`h-12 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer hover:scale-105 ${badgeStyle}`}
                  >
                    <span className="text-[10px] opacity-80">Soal</span>
                    <span className="text-sm font-extrabold">{idx + 1}</span>
                    {hasAnswer && !isFlagged && (
                      <span className="text-[9px] uppercase font-mono">{ans.selectedOption}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-600" />
                <span className="text-slate-300">Sudah Dijawab ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="text-slate-300">Ragu-Ragu ({Object.values(session?.answers || {}).filter((a: any) => a.isFlagged).length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-slate-600" />
                <span className="text-slate-300">Belum Dijawab ({activeQuestions.length - answeredCount})</span>
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <button
                onClick={handlePrevSlide}
                className="px-5 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Kembali ke Soal Terakhir</span>
              </button>

              <button
                id="open-submit-modal-btn"
                onClick={() => setShowSummaryModal(true)}
                className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-extrabold text-sm shadow-lg shadow-emerald-950 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>Kumpulkan Jawaban Ujian</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Jump Matrix Modal / Drawer */}
      {showMatrixDrawer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-3xl p-6 max-w-lg w-full border border-slate-800 shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-base">Navigasi Butir Soal</h3>
              <button
                onClick={() => setShowMatrixDrawer(false)}
                className="text-slate-400 hover:text-white text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-y-auto p-1">
              {activeQuestions.map((q, idx) => {
                const ans = session?.answers[q.id];
                const hasAnswer = !!ans?.selectedOption;
                const isFlagged = !!ans?.isFlagged;
                const isCurrent = currentQuestionIndex === idx;

                let style = "bg-[#1a1a1c] border-slate-700 text-slate-400";
                if (isFlagged) style = "bg-amber-400 border-amber-500 text-amber-950 font-bold";
                else if (hasAnswer) style = "bg-emerald-600 border-emerald-500 text-white font-bold";

                return (
                  <button
                    key={q.id}
                    onClick={() => handleJumpToSlide(3 + idx)}
                    className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${style} ${
                      isCurrent ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-[#121214]" : ""
                    }`}
                  >
                    <span className="text-[10px]">Soal</span>
                    <span className="text-base font-bold">{idx + 1}</span>
                    <span className="text-[10px] font-mono">{ans?.selectedOption || "-"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Submit Confirmation Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#121214] rounded-3xl p-6 max-w-md w-full border border-slate-800 shadow-2xl space-y-4 text-center text-slate-200">
            <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <h3 className="text-xl font-extrabold text-white">Kumpulkan Ujian Sekarang?</h3>
              <p className="text-xs text-slate-400">
                Anda telah menjawab <strong>{answeredCount}</strong> dari <strong>{activeQuestions.length}</strong> butir soal.
                Setelah dikumpulkan, sistem akan langsung melakukan penilaian otomatis.
              </p>
            </div>

            {answeredCount < activeQuestions.length && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-xs text-left flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  Masih terdapat <strong>{activeQuestions.length - answeredCount} butir soal</strong> yang belum Anda jawab.
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowSummaryModal(false)}
                className="flex-1 py-3 px-4 bg-[#1a1a1c] hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-xl font-semibold text-xs cursor-pointer"
              >
                Tinjau Ulang
              </button>
              <button
                id="confirm-final-submit-btn"
                onClick={() => handleFinalSubmit("submitted")}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs cursor-pointer shadow-lg shadow-emerald-950"
              >
                Ya, Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anti-Cheating Violation Warning Alert Modal */}
      {violationAlertModal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#141416] rounded-3xl p-6 max-w-md w-full border-2 border-rose-500/60 shadow-2xl shadow-rose-950/60 space-y-4 text-center text-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="w-14 h-14 bg-rose-500/20 border border-rose-500/40 text-rose-400 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/20 text-rose-300 rounded-full text-xs font-bold font-mono">
                <span>Peringatan Integritas #{violationAlertModal.count}</span>
              </div>
              <h3 className="text-lg font-extrabold text-white">Aktivitas Mencurigakan Terdeteksi!</h3>
              <p className="text-xs text-rose-200 font-medium">
                {violationAlertModal.message}
              </p>
            </div>

            <div className="p-3.5 bg-rose-950/40 border border-rose-900/50 rounded-2xl text-[11px] text-slate-300 text-left space-y-1">
              <p className="font-semibold text-rose-300">Catatan untuk Peserta Ujian:</p>
              <p className="text-slate-400">
                1. Dilarang membuka tab baru, beralih aplikasi, atau meminimalisir jendela selama ujian berlangsung.
              </p>
              <p className="text-slate-400">
                2. Setiap tindakan keluar dari layar ujian telah dicatat otomatis pada sistem pengawasan guru.
              </p>
            </div>

            <div className="pt-2">
              <button
                id="dismiss-violation-alert-btn"
                onClick={() => {
                  setViolationAlertModal({ show: false, type: "", message: "", count: 0 });
                  if (!document.fullscreenElement) {
                    requestFullscreenSafe();
                  }
                }}
                className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs cursor-pointer shadow-lg shadow-rose-950 transition-all flex items-center justify-center gap-2"
              >
                <span>Saya Mengerti & Kembali ke Ujian Fullscreen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
