import { db, firebaseConfig, terminateFirestoreInstance } from "../firebase";
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
  query,
  where,
} from "firebase/firestore";
import { ExamPackage, StudentTokenItem, StudentExamSession } from "../types";
import { broadcastLiveSessionReset } from "./liveSync";

export const FIRESTORE_PROJECT_ID = "gen-lang-client-0464440670";
export const FIRESTORE_DATABASE_ID = "ai-studio-slideexamcbtujia-337b5171-4150-47ed-a493-fc87b19bc190";
export const FIRESTORE_UPGRADE_URL = `https://console.firebase.google.com/project/${FIRESTORE_PROJECT_ID}/firestore/databases/${FIRESTORE_DATABASE_ID}/data?openUpgradeDialog=true`;

const QUOTA_STORAGE_KEY = "slideexam_firestore_quota_exceeded_v1";

// Daily quota resets on the next day (Pacific Time / 24-hr cycle).
// Persist quota block for at least 8 hours or until manual reset to prevent hammering exhausted quotas.
function getInitialQuotaState(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(QUOTA_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const elapsed = Date.now() - (parsed.timestamp || 0);
    if (elapsed < 8 * 60 * 60 * 1000) {
      return true;
    } else {
      localStorage.removeItem(QUOTA_STORAGE_KEY);
    }
  } catch {}
  return false;
}

let _isQuotaExceeded = getInitialQuotaState();

// If quota is already known to be exceeded on initial load, terminate Firestore client immediately to prevent retries
if (_isQuotaExceeded) {
  try {
    terminateFirestoreInstance().catch(() => {});
  } catch {}
}

const quotaListeners = new Set<(exceeded: boolean) => void>();

export function isQuotaExceeded(): boolean {
  return _isQuotaExceeded;
}

export function subscribeQuotaStatus(cb: (exceeded: boolean) => void): () => void {
  quotaListeners.add(cb);
  cb(_isQuotaExceeded);
  return () => quotaListeners.delete(cb);
}

export function markQuotaExceeded(reason: string): void {
  _isQuotaExceeded = true;
  try {
    terminateFirestoreInstance().catch(() => {});
  } catch {}
  try {
    localStorage.setItem(
      QUOTA_STORAGE_KEY,
      JSON.stringify({ timestamp: Date.now(), reason })
    );
  } catch {}
  console.warn(
    `[Firestore Quota Exceeded] Batas kuota gratis harian Firestore tercapai: ${reason}. Mengalihkan ke Server & LocalStorage Engine. Upgrade/pantau: ${FIRESTORE_UPGRADE_URL}`
  );
  quotaListeners.forEach((fn) => {
    try {
      fn(true);
    } catch {}
  });
}

export function resetQuotaCheck(): void {
  _isQuotaExceeded = false;
  try {
    localStorage.removeItem(QUOTA_STORAGE_KEY);
  } catch {}
  try {
    enableNetwork(db).catch(() => {});
  } catch {}
  quotaListeners.forEach((fn) => {
    try {
      fn(false);
    } catch {}
  });
}


function handleFirestoreCatch(err: any, context: string) {
  const errMsg = err?.message || String(err);
  if (
    errMsg.includes("resource-exhausted") ||
    errMsg.includes("Quota limit exceeded") ||
    errMsg.includes("Quota exceeded") ||
    errMsg.includes("Free daily write units") ||
    errMsg.includes("Free daily read units") ||
    errMsg.includes("Using maximum backoff delay")
  ) {
    if (!_isQuotaExceeded) {
      markQuotaExceeded(errMsg);
    }
  } else {
    console.warn(`Firestore ${context} notice:`, errMsg);
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

    // Extract tokens that specifically belong to this exam
    const rawTokens = tokens || (exam as any).tokens || [];
    const examTokens = Array.isArray(rawTokens)
      ? rawTokens.map((t) => ({
          ...t,
          examCode: t.examCode || cleanCode,
        }))
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

    // 5. If exam has a Google Drive File ID, also index by file ID for instant lookups
    if (exam.gdriveFileId) {
      await setDoc(
        doc(db, "examCodes", exam.gdriveFileId),
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

    // 1. Fast Server CBT Cloud Registry Lookup (<20ms)
    try {
      let res = await fetch(`/api/exams/by-code/${encodeURIComponent(upperQuery)}`);
      if (!res.ok) {
        res = await fetch(`/api/exams/share/${encodeURIComponent(upperQuery)}`);
      }
      if (!res.ok) {
        res = await fetch(`/api/exams/${encodeURIComponent(upperQuery)}`);
      }
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

    // 2. Query Firestore if available and quota not exceeded
    if (!_isQuotaExceeded) {
      try {
        let codeDocSnap = await getDoc(doc(db, "examCodes", upperQuery));
        if (!codeDocSnap.exists() && query !== upperQuery) {
          codeDocSnap = await getDoc(doc(db, "examCodes", query));
        }
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

    return { exam: null };
  } catch (err) {
    handleFirestoreCatch(err, "fetchExamFromFirestore");
    return { exam: null };
  }
}

// In-memory debounce map for Firestore writes to avoid high-frequency write explosions
const sessionLastFirestoreWriteTime = new Map<string, number>();

export interface SessionSyncResult {
  success: boolean;
  isReset?: boolean;
  message?: string;
}

/**
 * Direct fast sync to server registry. Returns server response including isReset flag.
 */
export async function syncStudentSessionToServer(
  session: StudentExamSession
): Promise<SessionSyncResult> {
  try {
    if (!session || !session.id) return { success: false };
    const sanitized = sanitizeForFirestore(session);
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sanitized),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: !!data.success, isReset: !!data.isReset, message: data.message };
    }
  } catch {}
  return { success: false };
}

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
      const serverResult = await syncStudentSessionToServer(session);
      if (serverResult.isReset) {
        return false;
      }
    } catch {
      // ignore
    }

    // 2. Check if Firestore quota is already marked as exceeded
    if (_isQuotaExceeded) {
      return true;
    }

    // 3. Throttle Firestore writes: only write at most once every 30 seconds per session unless forceImmediate (e.g. submit)
    const now = Date.now();
    const isSubmitted = session.status === "submitted" || session.status === "timed_out";

    if (!forceImmediate && !isSubmitted && now - lastLastWriteTime(session.id) < 30000) {
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
 * Fetch all sessions for a specific exam from server fallback and optional Firestore
 */
export async function fetchExamSessions(
  examId?: string,
  examCode?: string,
  includeFirestore = false
): Promise<StudentExamSession[]> {
  const sessionsMap = new Map<string, StudentExamSession>();
  const cleanId = (examId || "").trim();
  const cleanCode = (examCode || "").trim().toUpperCase();

  // 1. Fetch from Firestore ONLY when explicitly requested (e.g. initial load or manual refresh)
  // and ONLY if quota is available. Never inside frequent poll loops.
  if (includeFirestore && !_isQuotaExceeded) {
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

    // Also fetch general sessions list to catch any cross-device session updates
    const allRes = await fetch("/api/sessions");
    if (allRes.ok) {
      const json = await allRes.json();
      if (json.success && Array.isArray(json.sessions)) {
        json.sessions.forEach((s: StudentExamSession) => {
          if (!s || !s.id) return;
          const sId = (s.examId || "").trim();
          const sCode = (s.examCode || "").trim().toUpperCase();
          const matchId = cleanId && sId === cleanId;
          const matchCode = cleanCode && sCode === cleanCode;
          if (matchId || matchCode || (!cleanId && !cleanCode)) {
            sessionsMap.set(s.id, s);
          }
        });
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
 * Delete / Reset student session from Firestore, Server, and Broadcast to student devices.
 */
export async function deleteStudentSessionFromFirestore(
  sessionId?: string,
  studentName?: string,
  token?: string,
  examCode?: string,
  nisn?: string
): Promise<boolean> {
  try {
    const cleanId = (sessionId || "").trim();
    const cleanName = (studentName || "").trim();
    const cleanToken = (token || "").trim();
    const cleanNisn = (nisn || "").trim();
    const cleanCode = (examCode || "").trim().toUpperCase();

    if (!cleanId && !cleanName && !cleanToken && !cleanNisn) {
      return false;
    }

    // 1. Broadcast reset so any open student browser tab immediately exits to login
    broadcastLiveSessionReset({
      sessionId: cleanId || undefined,
      studentName: cleanName || undefined,
      token: cleanToken || undefined,
      nisn: cleanNisn || undefined,
      examCode: cleanCode || undefined,
    });

    // 2. Delete on Express server with full context (ID, studentName, examCode, NISN)
    try {
      const targetParam = cleanId || cleanName || "unknown";
      const qParams = new URLSearchParams();
      if (cleanCode) qParams.set("examCode", cleanCode);
      if (cleanName) qParams.set("studentName", cleanName);
      if (cleanNisn) qParams.set("nisn", cleanNisn);
      const url = `/api/sessions/${encodeURIComponent(targetParam)}?${qParams.toString()}`;
      fetch(url, { method: "DELETE" }).catch(() => {});
    } catch {}

    // 3. Delete in Firestore if quota allows
    if (!_isQuotaExceeded) {
      // If direct document ID known
      if (cleanId) {
        try {
          await deleteDoc(doc(db, "sessions", cleanId));
        } catch (e) {
          // May not exist as exact doc id
        }
      }

      // Also clean up by studentName if provided (NEVER by bare token, tokens can be shared!)
      try {
        const promises: Promise<any>[] = [];
        if (cleanName) {
          const qName = query(collection(db, "sessions"), where("studentName", "==", cleanName));
          const snap = await getDocs(qName);
          snap.forEach((d) => {
            const data = d.data();
            // Ensure examCode matches if both provided
            if (!cleanCode || !data.examCode || data.examCode.trim().toUpperCase() === cleanCode) {
              promises.push(deleteDoc(d.ref));
            }
          });
        }
        if (promises.length > 0) {
          await Promise.all(promises);
        }
      } catch (qErr) {
        handleFirestoreCatch(qErr, "deleteStudentSessionFromFirestore-query");
      }
    }

    // 4. REST Direct Fallback if direct ID and quota allows
    if (!_isQuotaExceeded && cleanId && firebaseConfig.projectId && firebaseConfig.apiKey) {
      try {
        const customDbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";
        const restUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${customDbId}/documents/sessions/${encodeURIComponent(cleanId)}?key=${firebaseConfig.apiKey}`;
        fetch(restUrl, { method: "DELETE" }).catch(() => {});
      } catch {}
    }

    return true;
  } catch (err) {
    handleFirestoreCatch(err, "deleteStudentSessionFromFirestore");
    return false;
  }
}

export interface BatchDeleteOptions {
  sessionIds?: string[];
  studentNames?: string[];
  tokens?: string[];
  nisns?: string[];
  examCode?: string;
  examId?: string;
}

/**
 * Batch delete multiple student sessions from Firestore and server.
 */
export async function batchDeleteStudentSessionsFromFirestore(options: BatchDeleteOptions): Promise<boolean> {
  try {
    const { sessionIds = [], studentNames = [], tokens = [], nisns = [], examCode, examId } = options;

    // 1. Broadcast reset for all targets
    studentNames.forEach((name, idx) => {
      broadcastLiveSessionReset({
        sessionId: sessionIds[idx] || undefined,
        studentName: name,
        token: tokens[idx] || undefined,
        nisn: nisns[idx] || undefined,
        examCode,
      });
    });

    // 2. Call server batch delete endpoint
    try {
      fetch("/api/sessions/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      }).catch(() => {});
    } catch {}

    // 3. Firestore doc deletions
    if (!_isQuotaExceeded) {
      const deletePromises: Promise<any>[] = [];

      // Direct doc deletions by ID
      for (const sId of sessionIds) {
        if (sId) {
          deletePromises.push(deleteDoc(doc(db, "sessions", sId)).catch(() => {}));
        }
      }

      await Promise.all(deletePromises);
    }

    return true;
  } catch (err) {
    handleFirestoreCatch(err, "batchDeleteStudentSessionsFromFirestore");
    return false;
  }
}

