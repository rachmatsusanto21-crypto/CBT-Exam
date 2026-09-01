import { db } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  onSnapshot,
  getDocs,
  deleteDoc,
  disableNetwork,
  enableNetwork,
} from "firebase/firestore";
import { ExamPackage, StudentTokenItem, StudentExamSession } from "../types";

export const FIRESTORE_PROJECT_ID = "gen-lang-client-0464440670";
export const FIRESTORE_DATABASE_ID = "ai-studio-slideexamcbtujia-337b5171-4150-47ed-a493-fc87b19bc190";
export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${FIRESTORE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

const QUOTA_STORAGE_KEY = "slideexam_firestore_quota_exceeded_v1";

// Check if quota was marked exceeded in the last 4 hours
function getInitialQuotaState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const elapsed = Date.now() - (parsed.timestamp || 0);
    // Persist quota block for 4 hours before auto-retrying
    if (elapsed < 4 * 60 * 60 * 1000) {
      return true;
    }
  } catch {}
  return false;
}

let _isQuotaExceeded = getInitialQuotaState();
const quotaListeners = new Set<(exceeded: boolean) => void>();

if (_isQuotaExceeded) {
  try {
    disableNetwork(db).catch(() => {});
  } catch {}
}

export function isQuotaExceeded(): boolean {
  return _isQuotaExceeded;
}

export function subscribeQuotaStatus(cb: (exceeded: boolean) => void): () => void {
  quotaListeners.add(cb);
  cb(_isQuotaExceeded);
  return () => quotaListeners.delete(cb);
}

export function resetQuotaCheck(): void {
  _isQuotaExceeded = false;
  try {
    localStorage.removeItem(QUOTA_STORAGE_KEY);
  } catch {}
  try {
    enableNetwork(db).catch(() => {});
  } catch {}
  quotaListeners.forEach((fn) => fn(false));
}

function handleFirestoreCatch(err: any, context: string) {
  const errMsg = err?.message || String(err);
  if (
    errMsg.includes("resource-exhausted") ||
    errMsg.includes("Quota limit exceeded") ||
    errMsg.includes("Quota exceeded") ||
    errMsg.includes("Free daily write units")
  ) {
    if (!_isQuotaExceeded) {
      _isQuotaExceeded = true;
      try {
        disableNetwork(db).catch(() => {});
      } catch {}
      try {
        localStorage.setItem(
          QUOTA_STORAGE_KEY,
          JSON.stringify({ timestamp: Date.now(), reason: errMsg })
        );
      } catch {}
      console.warn(
        `[Firestore Quota Exceeded] Batas kuota gratis harian Firestore tercapai. Mengalihkan ke Server & LocalStorage Engine. Upgrade/pantau: ${FIRESTORE_UPGRADE_URL}`
      );
      quotaListeners.forEach((fn) => fn(true));
    }
  } else {
    console.warn(`Firestore ${context} warning:`, errMsg);
  }
}

/**
 * Cloud Firestore Service for CBT Exams
 * Synchronizes exams, codes, and live student progress across devices and domains (e.g. Vercel, AIS, Mobile).
 */

// Helper to remove any undefined properties for clean Firestore storage
const sanitizeForFirestore = (obj: any): any => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Save an exam package to Firestore and index its short code
 */
export async function syncExamToFirestore(
  exam: ExamPackage,
  tokens?: StudentTokenItem[]
): Promise<boolean> {
  try {
    if (!exam || !exam.id) return false;
    const cleanId = exam.id.trim();
    const cleanCode = (exam.code || "").trim().toUpperCase();

    // Extract tokens that specifically belong to this exam code
    const rawTokens = tokens || (exam as any).tokens || [];
    const examTokens = Array.isArray(rawTokens)
      ? rawTokens.filter((t) => t && t.examCode && t.examCode.trim().toUpperCase() === cleanCode)
      : [];

    const payload = sanitizeForFirestore({
      ...exam,
      tokens: examTokens,
      updatedAt: new Date().toISOString(),
    });

    // 1. Sync to server in-memory share registry first (always works even if Firestore quota exhausted)
    try {
      fetch("/api/exams/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exam: payload, tokens: examTokens }),
      }).catch(() => {});
    } catch {}

    // 2. Skip Firestore write if quota is already known to be exceeded
    if (_isQuotaExceeded) {
      return true;
    }

    // 3. Save in 'exams' collection
    await setDoc(doc(db, "exams", cleanId), payload, { merge: true });

    // 4. Save in 'examCodes' collection for fast short-code lookups (e.g. "PP-01")
    if (cleanCode) {
      await setDoc(
        doc(db, "examCodes", cleanCode),
        {
          examId: cleanId,
          code: cleanCode,
          title: exam.title,
          sessionToken: exam.sessionToken,
          exam: payload,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return true;
  } catch (err) {
    handleFirestoreCatch(err, "syncExamToFirestore");
    return false;
  }
}

/**
 * Fetch an exam package by its ID or by its Short Code (e.g., "PP-01")
 */
export async function fetchExamFromFirestore(
  codeOrId: string
): Promise<{ exam: ExamPackage | null; token?: string; tokens?: StudentTokenItem[] }> {
  try {
    if (!codeOrId) return { exam: null };
    const query = codeOrId.trim();
    const upperQuery = query.toUpperCase();

    // 1. Try fetching from Firestore if quota is available
    if (!_isQuotaExceeded) {
      try {
        const codeDocSnap = await getDoc(doc(db, "examCodes", upperQuery));
        if (codeDocSnap.exists()) {
          const data = codeDocSnap.data();
          if (data?.exam) {
            return {
              exam: data.exam as ExamPackage,
              token: data.sessionToken || data.exam.sessionToken,
              tokens: data.exam.tokens || [],
            };
          }
        }

        const examDocSnap = await getDoc(doc(db, "exams", query));
        if (examDocSnap.exists()) {
          const examData = examDocSnap.data();
          return {
            exam: examData as ExamPackage,
            token: examData.sessionToken,
            tokens: examData.tokens || [],
          };
        }
      } catch (fsErr) {
        handleFirestoreCatch(fsErr, "fetchExamFromFirestore");
      }
    }

    // 2. Fallback to server registry
    try {
      const res = await fetch(`/api/exams/share/${encodeURIComponent(upperQuery)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.exam) {
          return {
            exam: data.exam,
            token: data.token || data.exam.sessionToken,
            tokens: data.tokens || data.exam.tokens || [],
          };
        }
      }
    } catch {}

    return { exam: null };
  } catch (err) {
    handleFirestoreCatch(err, "fetchExamFromFirestore");
    return { exam: null };
  }
}

// In-memory debounce map for Firestore writes to avoid high-frequency write explosions
const sessionLastFirestoreWriteTime = new Map<string, number>();

/**
 * Sync student exam session progress/completion to Firestore & server
 * Throttled to prevent free-tier Firestore quota exhaustion
 */
export async function syncStudentSessionToFirestore(
  session: StudentExamSession,
  forceImmediate = false
): Promise<boolean> {
  try {
    if (!session || !session.id) return false;
    const sanitized = sanitizeForFirestore(session);

    // 1. Always write to server sessions registry immediately (Fast, lightweight, no quota cost)
    try {
      fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sanitized),
      }).catch(() => {});
    } catch {
      // ignore
    }

    // 2. Check if Firestore quota is already marked as exceeded
    if (_isQuotaExceeded) {
      return true;
    }

    // 3. Throttle Firestore writes: only write at most once every 15 seconds per session unless forceImmediate (e.g. submit)
    const now = Date.now();
    const lastWrite = sessionLastFirestoreWriteTime.get(session.id) || 0;
    const isSubmitted = session.status === "submitted" || session.status === "timed_out";

    if (!forceImmediate && !isSubmitted && now - lastLastWriteTime(session.id) < 15000) {
      return true;
    }

    sessionLastFirestoreWriteTime.set(session.id, now);

    // 4. Write to Firestore 'sessions' collection
    try {
      await setDoc(doc(db, "sessions", session.id), sanitized, { merge: true });
    } catch (fsErr) {
      handleFirestoreCatch(fsErr, "setDoc session");
    }

    return true;
  } catch (err) {
    handleFirestoreCatch(err, "syncStudentSessionToFirestore");
    return false;
  }
}

function lastLastWriteTime(sessionId: string): number {
  return sessionLastFirestoreWriteTime.get(sessionId) || 0;
}

/**
 * Fetch all sessions for a specific exam from Firestore and server fallback
 */
export async function fetchExamSessions(
  examId?: string,
  examCode?: string
): Promise<StudentExamSession[]> {
  const sessionsMap = new Map<string, StudentExamSession>();
  const cleanId = (examId || "").trim();
  const cleanCode = (examCode || "").trim().toUpperCase();

  // 1. Fetch from Firestore if quota is available
  if (!_isQuotaExceeded) {
    try {
      const querySnapshot = await getDocs(collection(db, "sessions"));
      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data() as StudentExamSession;
        if (data && data.id) {
          const sId = (data.examId || "").trim();
          const sCode = (data.examCode || "").trim().toUpperCase();
          const matchId = cleanId && sId === cleanId;
          const matchCode = cleanCode && sCode === cleanCode;
          if (matchId || matchCode || (!cleanId && !cleanCode)) {
            sessionsMap.set(data.id, data);
          }
        }
      });
    } catch (err) {
      handleFirestoreCatch(err, "getDocs sessions");
    }
  }

  // 2. Fetch from Server endpoint as primary/fallback
  try {
    const target = cleanCode || cleanId;
    if (target) {
      const res = await fetch(`/api/sessions/by-exam/${encodeURIComponent(target)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.sessions)) {
          json.sessions.forEach((s: StudentExamSession) => {
            if (s && s.id) {
              sessionsMap.set(s.id, s);
            }
          });
        }
      }
    }
  } catch {
    // server fallback optional
  }

  return Array.from(sessionsMap.values());
}

/**
 * Real-time subscription to exam sessions from Firestore
 */
export function subscribeToExamSessions(
  examId: string,
  examCode: string,
  onUpdate: (sessions: StudentExamSession[]) => void
): () => void {
  const cleanId = (examId || "").trim();
  const cleanCode = (examCode || "").trim().toUpperCase();

  if (_isQuotaExceeded) {
    return () => {};
  }

  let unsubscribe: (() => void) | null = null;
  try {
    const sessionsCol = collection(db, "sessions");
    unsubscribe = onSnapshot(
      sessionsCol,
      (snapshot) => {
        const matched: StudentExamSession[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StudentExamSession;
          if (data && data.id) {
            const sId = (data.examId || "").trim();
            const sCode = (data.examCode || "").trim().toUpperCase();
            const matchId = cleanId && sId === cleanId;
            const matchCode = cleanCode && sCode === cleanCode;
            if (matchId || matchCode) {
              matched.push(data);
            }
          }
        });
        onUpdate(matched);
      },
      (error) => {
        handleFirestoreCatch(error, "sessions onSnapshot");
        if (unsubscribe) {
          try {
            unsubscribe();
          } catch {}
        }
      }
    );
    return () => {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {}
      }
    };
  } catch (err) {
    handleFirestoreCatch(err, "subscribeToExamSessions");
    return () => {};
  }
}

/**
 * Delete / Reset student session from Firestore & server
 */
export async function deleteStudentSessionFromFirestore(sessionId: string): Promise<boolean> {
  try {
    if (!sessionId) return false;

    // Delete on server
    try {
      fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => {});
    } catch {}

    // Delete in Firestore if quota allows
    if (!_isQuotaExceeded) {
      await deleteDoc(doc(db, "sessions", sessionId));
    }

    return true;
  } catch (err) {
    handleFirestoreCatch(err, "deleteStudentSessionFromFirestore");
    return false;
  }
}

