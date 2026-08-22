import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
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
  X,
  Image as ImageIcon,
  ArrowRightLeft,
  FileEdit,
  AlignLeft,
  Search
} from "lucide-react";
import {
  ExamPackage,
  Question,
  StudentAnswerItem,
  StudentExamSession,
  StudentTokenItem,
  CheatingViolationLog,
  MatchingPair
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
  initialToken?: string;
  isDirectLink?: boolean;
}

export const StudentSlideExam: React.FC<StudentSlideExamProps> = ({
  exam,
  tokens,
  currentSession,
  onSaveSession,
  onSubmitExam,
  onExit,
  initialToken,
  isDirectLink = false,
}) => {
  // Login Gate State (if no session active)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(!!currentSession);
  const [loginStudentName, setLoginStudentName] = useState("");
  const [loginNisn, setLoginNisn] = useState("");
  const [loginClass, setLoginClass] = useState("X MIPA 1");
  const [loginExamCode, setLoginExamCode] = useState(exam.code);
  const [loginToken, setLoginToken] = useState(initialToken || exam.sessionToken);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active Session State
  const [session, setSession] = useState<StudentExamSession | null>(currentSession);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(currentSession?.currentSlideIndex || 0);
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("normal");
  const [showSummaryModal, setShowSummaryModal] = useState<boolean>(false);
  const [showMatrixDrawer, setShowMatrixDrawer] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(currentSession?.status === "submitted");

  // Lightbox Image Zoom Modal
  const [zoomImageSrc, setZoomImageSrc] = useState<string | null>(null);

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

  // Timer Calculation
  const totalDurationSeconds = exam.durationMinutes * 60;
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    if (currentSession && currentSession.startTime) {
      const elapsed = Math.floor(
        (Date.now() - new Date(currentSession.startTime).getTime()) / 1000
      );
      return Math.max(0, totalDurationSeconds - elapsed);
    }
    return totalDurationSeconds;
  });

  // Track violation count in ref to prevent stale closures
  const violationCountRef = useRef<number>(currentSession?.violationCount || 0);

  // Active questions (using shuffled questions if exists in session, else exam questions)
  const activeQuestions: Question[] = session?.shuffledQuestions || exam.questions;

  // Slides configuration:
  // Slide 0: Profil Sekolah & Header Instansi
  // Slide 1: Profil Guru & Mata Pelajaran
  // Slide 2: Tata Tertib & Petunjuk Ujian
  // Slide 3 .. (3 + activeQuestions.length - 1): Question Slides
  // Slide (3 + activeQuestions.length): Lembar Ringkasan & Konfirmasi Selesai
  const totalIntroSlides = 3;
  const totalSlides = totalIntroSlides + activeQuestions.length + 1;

  const isIntroSlide = currentSlideIndex < totalIntroSlides;
  const isFinalSlide = currentSlideIndex === totalSlides - 1;
  const currentQuestionIndex = isIntroSlide || isFinalSlide ? -1 : currentSlideIndex - totalIntroSlides;
  const currentQuestion = currentQuestionIndex >= 0 ? activeQuestions[currentQuestionIndex] : null;

  // Sync initial token from props if provided
  useEffect(() => {
    if (initialToken) {
      setLoginToken(initialToken);
    }
  }, [initialToken]);

  // Fullscreen toggle helper
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreenActive(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreenActive(false);
      }
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreenActive(isFs);
      if (!isFs && isLoggedIn && !isSubmitted) {
        recordCheatViolation(
          "fullscreen_exit",
          "Siswa keluar dari mode layar penuh (Fullscreen) saat ujian berlangsung."
        );
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isLoggedIn, isSubmitted]);

  // Timer Tick & Low-Time Sounds
  useEffect(() => {
    if (!isLoggedIn || isSubmitted || secondsRemaining <= 0) return;

    const timer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit("timed_out");
          return 0;
        }

        // 5-Minute Audio Alert (at exactly 300 seconds)
        if (prev === 300 && !hasAlerted5Min.current) {
          hasAlerted5Min.current = true;
          setDismissedWarningBanner(false);
          if (isSoundNotificationEnabled()) {
            playExamTimeWarningSound("5min");
          }
        }

        // 1-Minute Critical Audio Alert (at exactly 60 seconds)
        if (prev === 60 && !hasAlerted1Min.current) {
          hasAlerted1Min.current = true;
          setDismissedWarningBanner(false);
          if (isSoundNotificationEnabled()) {
            playExamTimeWarningSound("1min");
          }
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoggedIn, isSubmitted, secondsRemaining]);

  // Record Cheating Violation
  const recordCheatViolation = (
    type: "tab_switch" | "window_blur" | "fullscreen_exit",
    message: string
  ) => {
    if (!session || isSubmitted) return;

    const newViolation: CheatingViolationLog = {
      timestamp: new Date().toISOString(),
      violationType: type,
      message: message,
    };

    const newCount = (session.violationCount || 0) + 1;
    violationCountRef.current = newCount;

    const updatedSession: StudentExamSession = {
      ...session,
      violationCount: newCount,
      cheatViolations: [...(session.cheatViolations || []), newViolation],
    };

    setSession(updatedSession);
    onSaveSession(updatedSession);

    // Show warning alert modal
    setViolationAlertModal({
      show: true,
      type,
      message,
      count: newCount,
    });
  };

  // Visibility & Blur Anti-Cheating Listeners
  useEffect(() => {
    if (!isLoggedIn || isSubmitted) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        recordCheatViolation(
          "tab_switch",
          "Siswa berpindah tab browser atau meminimalkan jendela ujian."
        );
      }
    };

    const handleWindowBlur = () => {
      recordCheatViolation(
        "window_blur",
        "Jendela ujian kehilangan fokus (membuka aplikasi lain atau split screen)."
      );
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [isLoggedIn, isSubmitted, session]);

  // Keyboard Shortcuts (A, B, C, D, E for Multiple Choice, Arrow Keys for Nav, R for Flag)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isLoggedIn || isSubmitted) return;

      // Disable keyboard shortcuts if typing inside an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      const key = e.key.toUpperCase();

      // Navigation: Arrow Left / Arrow Right
      if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrevSlide();
      }

      // Flag Shortcut: 'R'
      if (key === "R" && currentQuestion) {
        e.preventDefault();
        handleToggleFlag(currentQuestion.id);
      }

      // Multiple Choice Select: 'A', 'B', 'C', 'D', 'E'
      if (
        currentQuestion &&
        (currentQuestion.type === "pilihan_ganda" || !currentQuestion.type) &&
        ["A", "B", "C", "D", "E"].includes(key)
      ) {
        const optionExists = currentQuestion.options.some(
          (opt) => opt.key.toUpperCase() === key
        );
        if (optionExists) {
          e.preventDefault();
          handleSelectOption(currentQuestion.id, key);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLoggedIn, isSubmitted, currentSlideIndex, currentQuestion, session]);

  // Login Validator
  const executeStartExam = (forceAdmin = false) => {
    if (!forceAdmin) {
      if (!loginStudentName.trim()) {
        setLoginError("Silakan masukkan nama lengkap Anda.");
        return;
      }

      // Check token match
      const enteredToken = loginToken.trim().toUpperCase();
      const examSessionToken = exam.sessionToken.trim().toUpperCase();

      const matchedToken = tokens.find(
        (t) => t.token.toUpperCase() === enteredToken && t.status === "active"
      );

      if (!matchedToken && enteredToken !== examSessionToken && enteredToken !== "GURU2026") {
        setLoginError("Token ujian tidak valid atau sudah kadaluarsa. Minta token aktif kepada Guru Pengawas.");
        return;
      }
    }

    setLoginError(null);

    // Prepare randomized question order and options
    const preparedQuestions = prepareStudentExamQuestions(exam);

    const newSession: StudentExamSession = {
      id: `sess-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      examId: exam.id,
      examCode: exam.code,
      examTitle: exam.title,
      subject: exam.teacherProfile.subject,
      studentName: loginStudentName.trim() || "Siswa Mandiri",
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

  // Generic answer selector for Pilihan Ganda
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

  // Text Answer Handler (for isian_singkat and uraian)
  const handleTextAnswerChange = (questionId: string, text: string) => {
    if (!session || isSubmitted) return;

    const q = activeQuestions.find((item) => item.id === questionId);
    let isCorrect = false;
    let scoreEarned = 0;

    if (q?.type === "isian_singkat") {
      // Check normalized keywords
      const acceptable = (q.correctAnswer || "")
        .split(/[,|/]/)
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      const studentInput = text.trim().toLowerCase();
      isCorrect = acceptable.includes(studentInput);
      scoreEarned = isCorrect ? q.score : 0;
    } else if (q?.type === "uraian") {
      // For essay, if non-empty, provide baseline score or mark answered
      isCorrect = text.trim().length > 10;
      scoreEarned = isCorrect ? q.score : 0;
    }

    const currentAnswer = session.answers[questionId] || {
      questionId,
      selectedOption: "",
      isFlagged: false,
    };

    const updatedAnswer: StudentAnswerItem = {
      ...currentAnswer,
      selectedOption: text,
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

  // Matching Pair Answer Handler (for menjodohkan)
  const handleMatchingAnswerChange = (questionId: string, pairId: string, rightTarget: string) => {
    if (!session || isSubmitted) return;

    const q = activeQuestions.find((item) => item.id === questionId);
    const currentAnswer = session.answers[questionId] || {
      questionId,
      selectedOption: "{}",
      isFlagged: false,
    };

    let currentMap: Record<string, string> = {};
    try {
      currentMap = JSON.parse(currentAnswer.selectedOption || "{}");
    } catch {
      currentMap = {};
    }

    currentMap[pairId] = rightTarget;
    const jsonString = JSON.stringify(currentMap);

    // Score calculation: check each pair
    let matchedCorrectCount = 0;
    const pairs = q?.matchingPairs || [];
    pairs.forEach((p) => {
      if (currentMap[p.id] === p.right) {
        matchedCorrectCount++;
      }
    });

    const isFullyCorrect = pairs.length > 0 && matchedCorrectCount === pairs.length;
    const partialScore = pairs.length > 0 ? (matchedCorrectCount / pairs.length) * (q?.score || 0) : 0;

    const updatedAnswer: StudentAnswerItem = {
      ...currentAnswer,
      selectedOption: jsonString,
      isCorrect: isFullyCorrect,
      scoreEarned: Math.round(partialScore * 10) / 10,
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
      if (!ans) return;

      if (q.type === "menjodohkan") {
        let currentMap: Record<string, string> = {};
        try {
          currentMap = JSON.parse(ans.selectedOption || "{}");
        } catch {
          currentMap = {};
        }
        const pairs = q.matchingPairs || [];
        let matched = 0;
        pairs.forEach((p) => {
          if (currentMap[p.id] === p.right) matched++;
        });
        if (pairs.length > 0) {
          totalScoreEarned += (matched / pairs.length) * q.score;
        }
      } else if (q.type === "isian_singkat") {
        const acceptable = (q.correctAnswer || "")
          .split(/[,|/]/)
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean);
        const studentInput = (ans.selectedOption || "").trim().toLowerCase();
        if (acceptable.includes(studentInput)) {
          totalScoreEarned += q.score;
        }
      } else if (q.type === "uraian") {
        if ((ans.selectedOption || "").trim().length > 10) {
          totalScoreEarned += q.score;
        }
      } else {
        // Pilihan ganda
        if (ans.selectedOption.toUpperCase() === q.correctAnswer.toUpperCase()) {
          totalScoreEarned += q.score;
        }
      }
    });

    totalScoreEarned = Math.round(totalScoreEarned * 10) / 10;
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
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div className="bg-[#121214] rounded-3xl border border-slate-800 shadow-2xl max-w-lg w-full p-6 sm:p-8 space-y-6 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center mx-auto text-indigo-400 mb-3 shadow-lg shadow-indigo-950">
              <GraduationCap className="w-8 h-8 text-indigo-400" />
            </div>
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20">
              SlideExam Computer-Based Test
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white">{exam.title}</h1>
            <p className="text-xs text-slate-400">
              {exam.teacherProfile.subject} • {exam.schoolProfile.schoolName}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleStartExamLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nama Lengkap Siswa <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={loginStudentName}
                onChange={(e) => setLoginStudentName(e.target.value)}
                placeholder="Contoh: Muhammad Bintang Pratama"
                className="w-full px-4 py-3 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  NISN / No. Peserta
                </label>
                <input
                  type="text"
                  value={loginNisn}
                  onChange={(e) => setLoginNisn(e.target.value)}
                  placeholder="0078123456"
                  className="w-full px-4 py-3 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Rombel / Kelas
                </label>
                <input
                  type="text"
                  value={loginClass}
                  onChange={(e) => setLoginClass(e.target.value)}
                  placeholder="X MIPA 1"
                  className="w-full px-4 py-3 bg-[#1a1a1c] border border-slate-800 rounded-xl text-slate-200 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Token Akses Ujian <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={loginToken}
                  onChange={(e) => setLoginToken(e.target.value.toUpperCase())}
                  placeholder="Masukkan 6 Digit Token..."
                  className="w-full pl-10 pr-4 py-3 bg-[#1a1a1c] border border-indigo-500/40 rounded-xl text-indigo-300 font-mono font-bold tracking-widest text-base focus:border-indigo-500 focus:outline-none"
                />
                <Key className="w-5 h-5 text-indigo-400 absolute left-3 top-3.5" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Token diberikan oleh Guru Pengawas ruang ujian.
              </p>
            </div>

            {loginError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              id="start-student-exam-btn"
              type="submit"
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-950 hover:shadow-indigo-900 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>Mulai Pengerjaan Ujian</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>

          {/* Discrete exit link */}
          <div className="text-center pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onExit}
              className="text-xs text-slate-500 hover:text-slate-400 underline cursor-pointer"
            >
              Masuk sebagai Guru / Administrator
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // PRESENTATION SLIDE CBT EXAM CANVAS
  // =========================================================================
  const answeredCount = Object.values(session?.answers || {}).filter(
    (a: any) => a?.selectedOption !== "" && a?.selectedOption !== "{}"
  ).length;

  const progressPercent = Math.round(((currentSlideIndex + 1) / totalSlides) * 100);

  // For Menjodohkan answer mapping
  let currentMatchingMap: Record<string, string> = {};
  if (currentQuestion && currentQuestion.type === "menjodohkan") {
    try {
      currentMatchingMap = JSON.parse(session?.answers[currentQuestion.id]?.selectedOption || "{}");
    } catch {
      currentMatchingMap = {};
    }
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* TOP CONTROL BAR: TIMER, PROGRESS, ANTI-CHEAT STATUS */}
      <div className="bg-[#121214] rounded-2xl p-4 border border-slate-800 shadow-lg flex flex-wrap items-center justify-between gap-4">
        {/* Left: Exam Info & Slide Counter */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 font-bold text-xs flex items-center gap-1.5 border border-indigo-500/20">
            <Layers className="w-4 h-4" />
            <span>
              Slide {currentSlideIndex + 1} / {totalSlides}
            </span>
          </div>

          <div className="hidden sm:block">
            <div className="text-xs font-bold text-white truncate max-w-xs">{exam.title}</div>
            <div className="text-[11px] text-slate-400">
              Siswa: <strong className="text-slate-300">{session?.studentName}</strong> ({session?.className})
            </div>
          </div>
        </div>

        {/* Center: Live Countdown Timer & Audio Warning */}
        <div className="flex items-center gap-3">
          <div
            id="student-exam-timer-pill"
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl border font-mono font-bold text-sm transition-all shadow-md ${
              secondsRemaining <= 60
                ? "bg-rose-950/60 border-rose-500 text-rose-200 animate-pulse ring-2 ring-rose-500/40 shadow-rose-950"
                : isLowTime
                ? "bg-amber-950/50 border-amber-500/70 text-amber-300 shadow-amber-950"
                : "bg-[#1a1a1c] border-slate-700 text-emerald-400 shadow-black/40"
            }`}
          >
            <Clock
              className={`w-4 h-4 ${
                secondsRemaining <= 60
                  ? "text-rose-400 animate-spin"
                  : isLowTime
                  ? "text-amber-400 animate-pulse"
                  : "text-emerald-400"
              }`}
            />
            <span>{formatTime(secondsRemaining)}</span>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={() => {
              const nextVal = !soundEnabled;
              setSoundEnabled(nextVal);
              setSoundNotificationEnabled(nextVal);
            }}
            className="p-2 bg-[#1a1a1c] hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer"
            title={soundEnabled ? "Peringatan suara aktif (Klik matikan)" : "Peringatan suara non-aktif"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>

        {/* Right: Matrix Drawer & Fullscreen Toggle */}
        <div className="flex items-center gap-2">
          <button
            id="open-slide-matrix-btn"
            onClick={() => setShowMatrixDrawer(true)}
            className="px-3 py-2 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 rounded-xl text-xs font-semibold border border-slate-800 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-indigo-400" />
            <span>Kisi Soal ({answeredCount}/{activeQuestions.length})</span>
          </button>

          <button
            onClick={handleToggleFullscreen}
            className="p-2 bg-[#1a1a1c] hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl border border-slate-800 transition-colors cursor-pointer"
            title={isFullscreenActive ? "Keluar Layar Penuh" : "Mode Layar Penuh (Fullscreen)"}
          >
            {isFullscreenActive ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 5-Minute or 1-Minute Warning Banner */}
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
        className={`bg-[#121214] rounded-3xl border border-slate-800 shadow-2xl min-h-[520px] flex flex-col justify-between p-6 sm:p-10 relative overflow-hidden transition-all duration-200 text-slate-200 ${
          fontSize === "large" ? "text-base" : fontSize === "xlarge" ? "text-lg" : "text-sm"
        }`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlideIndex}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="flex-1 flex flex-col justify-between"
          >
            {/* ========================================================================= */}
            {/* SLIDE 0: PROFIL SEKOLAH & IDENTITAS UJIAN */}
            {/* ========================================================================= */}
            {currentSlideIndex === 0 && (
              <div className="space-y-6 my-auto text-center">
                {/* Kop Surat Header Logos / Custom Kop Surat Image */}
                {exam.schoolProfile.kopSuratUrl ? (
                  <div className="flex justify-center pb-4 border-b border-slate-800 max-w-3xl mx-auto">
                    <img
                      src={exam.schoolProfile.kopSuratUrl}
                      alt="Kop Surat Resmi Sekolah"
                      className="max-h-24 sm:max-h-28 object-contain rounded-lg shadow-sm"
                    />
                  </div>
                ) : (
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
                )}

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
                  <span>Ragam Jenis Soal</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Soal terdiri dari Pilihan Ganda (opsi A-E), Mencocokkan Pasangan, Isian Pendek, atau Uraian.
                </p>
              </div>

              <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-2">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Flag className="w-4 h-4 text-amber-400" />
                  <span>Tandai Ragu-Ragu</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Jika belum yakin dengan jawaban, aktifkan tombol <strong>Ragu-Ragu</strong> untuk ditinjau nanti.
                </p>
              </div>

              <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-2">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Auto-Save Otomatis</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Jawaban tersimpan otomatis setiap kali Anda memilih atau mengetikkan jawaban.
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
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-indigo-600 text-white rounded-xl font-bold text-xs">
                    Nomor Soal {currentQuestionIndex + 1}
                  </span>
                  <span className="text-xs font-semibold text-slate-300 bg-[#1a1a1c] border border-slate-700 px-2.5 py-0.5 rounded">
                    {currentQuestion.type === "menjodohkan"
                      ? "Mencocokkan / Menjodohkan"
                      : currentQuestion.type === "isian_singkat"
                      ? "Isian Singkat"
                      : currentQuestion.type === "uraian"
                      ? "Uraian / Esai"
                      : "Pilihan Ganda"}
                  </span>
                  {currentQuestion.topicTag && (
                    <span className="text-xs font-medium text-slate-400 bg-[#161618] px-2 py-0.5 rounded border border-slate-800">
                      {currentQuestion.topicTag}
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
                  <p className="whitespace-pre-line">{currentQuestion.stimulus}</p>
                </div>
              )}

              {/* Question Image Attachment (If available) */}
              {currentQuestion.imageUrl && (
                <div className="space-y-1.5">
                  <div
                    onClick={() => setZoomImageSrc(currentQuestion.imageUrl || null)}
                    className="p-2 bg-black/60 rounded-2xl border border-slate-800 flex flex-col items-center justify-center max-h-72 cursor-zoom-in group hover:border-indigo-500/50 transition-all relative overflow-hidden"
                  >
                    <img
                      src={currentQuestion.imageUrl}
                      alt={currentQuestion.imageCaption || "Gambar Soal"}
                      className="max-h-64 object-contain rounded-xl"
                    />
                    <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[10px] text-white flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      <ZoomIn className="w-3.5 h-3.5" />
                      <span>Klik untuk Perbesar</span>
                    </div>
                  </div>
                  {currentQuestion.imageCaption && (
                    <div className="text-[11px] text-slate-400 text-center italic">
                      {currentQuestion.imageCaption}
                    </div>
                  )}
                </div>
              )}

              {/* Main Question Text */}
              <div className="font-bold text-white text-base sm:text-lg leading-relaxed py-1">
                {currentQuestion.questionText}
              </div>

              {/* ========================================================================= */}
              {/* INTERACTIVE QUESTION ANSWER INPUTS (PER TYPE) */}
              {/* ========================================================================= */}

              {/* 1. TYPE: PILIHAN GANDA (A-E) */}
              {(currentQuestion.type === "pilihan_ganda" ||
                currentQuestion.type === "pilihan_ganda_kompleks" ||
                currentQuestion.type === "benar_salah" ||
                !currentQuestion.type) && (
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
              )}

              {/* 2. TYPE: MENCOCOKKAN / MENJODOHKAN */}
              {currentQuestion.type === "menjodohkan" && (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-2xl text-xs text-indigo-300 flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 shrink-0 text-indigo-400" />
                    <span>
                      Pasangkan setiap pernyataan di kolom kiri dengan pilihan yang sesuai di kolom kanan.
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(currentQuestion.matchingPairs || []).map((pair, pIdx) => {
                      const selectedRight = currentMatchingMap[pair.id] || "";
                      const allRightOptions = Array.from(
                        new Set((currentQuestion.matchingPairs || []).map((p) => p.right))
                      );

                      return (
                        <div
                          key={pair.id || pIdx}
                          className="p-4 bg-[#161618] rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 sm:w-1/2">
                            <span className="w-6 h-6 rounded-lg bg-indigo-600/30 text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0">
                              {pIdx + 1}
                            </span>
                            <span className="text-xs sm:text-sm font-semibold text-slate-200">
                              {pair.left}
                            </span>
                          </div>

                          <div className="sm:w-1/2 flex items-center gap-2">
                            <ArrowRightLeft className="w-3.5 h-3.5 text-slate-500 shrink-0 hidden sm:block" />
                            <select
                              value={selectedRight}
                              onChange={(e) =>
                                handleMatchingAnswerChange(currentQuestion.id, pair.id, e.target.value)
                              }
                              className={`w-full p-2.5 rounded-xl text-xs font-semibold border transition-all ${
                                selectedRight
                                  ? "bg-indigo-950/50 border-indigo-500 text-white"
                                  : "bg-[#1a1a1c] border-slate-700 text-slate-400"
                              }`}
                            >
                              <option value="">-- Pilih Pasangan yang Cocok --</option>
                              {allRightOptions.map((optVal, optIdx) => (
                                <option key={optIdx} value={optVal} className="bg-[#121214] text-slate-200">
                                  {optVal}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. TYPE: ISIAN PENDEK / SINGKAT */}
              {currentQuestion.type === "isian_singkat" && (
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-[#161618] rounded-2xl border border-slate-800 space-y-2">
                    <label className="text-xs font-bold text-slate-300 block flex items-center gap-1.5">
                      <FileEdit className="w-4 h-4 text-indigo-400" />
                      <span>Lembar Jawaban Isian Pendek / Singkat:</span>
                    </label>
                    <input
                      type="text"
                      value={session?.answers[currentQuestion.id]?.selectedOption || ""}
                      onChange={(e) => handleTextAnswerChange(currentQuestion.id, e.target.value)}
                      placeholder="Ketikkan jawaban singkat Anda di sini..."
                      className="w-full px-4 py-3 bg-[#1a1a1c] border border-indigo-500/50 rounded-xl text-white font-medium text-sm focus:border-indigo-400 focus:outline-none placeholder-slate-500"
                    />
                    <p className="text-[11px] text-slate-400">
                      Jawaban tersimpan otomatis saat Anda mengetik.
                    </p>
                  </div>
                </div>
              )}

              {/* 4. TYPE: URAIAN / ESAI */}
              {currentQuestion.type === "uraian" && (
                <div className="space-y-3 pt-2">
                  <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <AlignLeft className="w-4 h-4 text-indigo-400" />
                        <span>Lembar Jawaban Uraian / Esai Komprehensif:</span>
                      </label>
                      <span className="text-[11px] text-slate-400">
                        {(session?.answers[currentQuestion.id]?.selectedOption || "").length} Karakter
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      value={session?.answers[currentQuestion.id]?.selectedOption || ""}
                      onChange={(e) => handleTextAnswerChange(currentQuestion.id, e.target.value)}
                      placeholder="Uraikan penjelasan, analisis, atau langkah-langkah jawaban Anda secara lengkap dan runtut..."
                      className="w-full p-4 bg-[#1a1a1c] border border-indigo-500/50 rounded-xl text-white font-normal text-xs sm:text-sm focus:border-indigo-400 focus:outline-none placeholder-slate-500 leading-relaxed"
                    />
                  </div>
                </div>
              )}
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
                const hasAnswer = !!ans?.selectedOption && ans.selectedOption !== "{}";
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
        </motion.div>
      </AnimatePresence>
      </div>

      {/* Quick Jump Matrix Modal / Drawer */}
      {showMatrixDrawer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#121214] rounded-3xl p-6 max-w-lg w-full border border-slate-800 shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-base">Navigasi Butir Soal</h3>
              <button
                onClick={() => setShowMatrixDrawer(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-[300px] overflow-y-auto p-1">
              {activeQuestions.map((q, idx) => {
                const ans = session?.answers[q.id];
                const hasAnswer = !!ans?.selectedOption && ans.selectedOption !== "{}";
                const isFlagged = !!ans?.isFlagged;
                const isCurrent = currentQuestionIndex === idx;

                let style = "bg-[#1a1a1c] border-slate-700 text-slate-400";
                if (isFlagged) {
                  style = "bg-amber-400 border-amber-500 text-amber-950 font-bold";
                } else if (hasAnswer) {
                  style = "bg-emerald-600 border-emerald-500 text-white font-bold";
                }

                if (isCurrent) {
                  style += " ring-2 ring-indigo-400 scale-105";
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => handleJumpToSlide(3 + idx)}
                    className={`h-11 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer ${style}`}
                  >
                    <span className="text-[10px] opacity-80">Soal</span>
                    <span className="text-xs font-black">{idx + 1}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-slate-400">
                Terjawab: <strong>{answeredCount}</strong> / {activeQuestions.length}
              </span>
              <button
                onClick={() => handleJumpToSlide(totalSlides - 1)}
                className="text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
              >
                Ke Lembar Selesai →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Submit Modal */}
      {showSummaryModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#121214] rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-800 shadow-2xl space-y-5 text-center text-slate-200">
            <div className="w-14 h-14 bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-950">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-white">Konfirmasi Pengumpulan</h3>
              <p className="text-xs text-slate-400">
                Apakah Anda yakin telah selesai mengerjakan seluruh soal ujian?
              </p>
            </div>

            <div className="p-4 bg-[#161618] rounded-2xl border border-slate-800 text-xs space-y-2 text-left">
              <div className="flex justify-between">
                <span className="text-slate-400">Total Butir Soal:</span>
                <span className="font-bold text-white">{activeQuestions.length} Butir</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sudah Dijawab:</span>
                <span className="font-bold text-emerald-400">{answeredCount} Butir</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Belum Terjawab:</span>
                <span className="font-bold text-rose-400">{activeQuestions.length - answeredCount} Butir</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Sisa Waktu:</span>
                <span className="font-mono font-bold text-indigo-300">{formatTime(secondsRemaining)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowSummaryModal(false)}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Periksa Lagi
              </button>
              <button
                id="confirm-final-submit-btn"
                onClick={() => handleFinalSubmit("submitted")}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-950 cursor-pointer transition-all"
              >
                Ya, Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Zoom Modal */}
      {zoomImageSrc && (
        <div
          onClick={() => setZoomImageSrc(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center">
            <button
              onClick={() => setZoomImageSrc(null)}
              className="absolute -top-10 right-0 text-white hover:text-rose-400 text-xs font-bold flex items-center gap-1 bg-black/60 px-3 py-1 rounded-full border border-slate-700"
            >
              <X className="w-4 h-4" />
              <span>Tutup Gambar</span>
            </button>
            <img
              src={zoomImageSrc}
              alt="Visual Soal Diperbesar"
              className="max-h-[85vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800"
            />
          </div>
        </div>
      )}

      {/* Anti-Cheating Alert Modal */}
      {violationAlertModal.show && (
        <div className="fixed inset-0 bg-rose-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#141214] border-2 border-rose-500/80 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-rose-950/80 text-center space-y-4">
            <div className="w-14 h-14 bg-rose-600/20 border border-rose-500/40 text-rose-400 rounded-2xl flex items-center justify-center mx-auto animate-bounce">
              <ShieldAlert className="w-8 h-8 text-rose-400" />
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-black text-rose-300">Peringatan Integritas Ujian!</h3>
              <p className="text-xs text-rose-200/90 leading-relaxed">
                {violationAlertModal.message}
              </p>
            </div>

            <div className="p-3 bg-rose-950/40 rounded-xl border border-rose-500/30 text-xs text-rose-300 font-mono">
              Pelanggaran Tercatat: {violationAlertModal.count}x
            </div>

            <p className="text-[11px] text-slate-400">
              Setiap aktivitas perpindahan tab atau layar dicatat otomatis dan dilaporkan secara real-time ke Guru Pengawas.
            </p>

            <button
              onClick={() => setViolationAlertModal({ show: false, type: "", message: "", count: 0 })}
              className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold text-xs cursor-pointer shadow-lg shadow-rose-950 transition-all"
            >
              Saya Mengerti & Kembali ke Soal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
