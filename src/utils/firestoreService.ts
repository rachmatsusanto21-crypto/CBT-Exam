/**
 * Backend & Database Service Bridge (Redirected from legacy Firestore to Google Apps Script & Google Sheets)
 * Database utama sekarang menggunakan Google Sheets dan backend Google Apps Script.
 */

import { ExamPackage, StudentTokenItem, StudentExamSession } from "../types";
import {
  syncExamToGAS,
  fetchExamFromGAS,
  syncStudentSessionToGAS,
  fetchExamSessions as fetchSessionsGAS,
  deleteStudentSession as deleteSessionGAS,
  batchDeleteStudentSessions as batchDeleteSessionsGAS,
  reconcileAndMergeExamSessions as reconcileGAS,
} from "./gasService";

export const FIRESTORE_PROJECT_ID = "";
export const FIRESTORE_DATABASE_ID = "";
export const FIRESTORE_UPGRADE_URL = "";

// Quota always false now as we use Google Sheets and Google Apps Script
export function isQuotaExceeded(): boolean {
  return false;
}

export function subscribeQuotaStatus(cb: (exceeded: boolean) => void): () => void {
  cb(false);
  return () => {};
}

export function markQuotaExceeded(_reason: string): void {}

export function resetQuotaCheck(): void {}

/**
 * Sinkronisasi naskah ujian ke Google Apps Script (Folder 'Data Soal' & 'Data Siswa dan Kelas')
 */
export async function syncExamToFirestore(
  exam: ExamPackage,
  tokens?: StudentTokenItem[],
  _silentOrOptions?: boolean | { isStudentClient?: boolean },
  _targetFolder?: any,
  _options?: any
): Promise<boolean> {
  try {
    const res = await syncExamToGAS(exam, tokens);
    return res.success;
  } catch (err) {
    console.warn("Sinkronisasi naskah ujian gagal:", err);
    return false;
  }
}

/**
 * Mengambil naskah ujian dari Google Apps Script / server
 */
export async function fetchExamFromFirestore(
  examCodeOrId: string,
  _options?: any
): Promise<{ exam: ExamPackage; token?: string; tokens?: StudentTokenItem[] } | null> {
  try {
    const res = await fetchExamFromGAS(examCodeOrId);
    if (res.success && res.exam) {
      return {
        exam: res.exam,
        token: res.token,
        tokens: res.tokens,
      };
    }
    return null;
  } catch (err) {
    console.warn("Pengambilan naskah ujian gagal:", err);
    return null;
  }
}

export interface SessionSyncResult {
  success: boolean;
  isReset?: boolean;
  message?: string;
}

export async function syncStudentSessionToServer(
  session: StudentExamSession
): Promise<SessionSyncResult> {
  return await syncStudentSessionToFirestore(session, false);
}

/**
 * Sinkronisasi hasil sesi siswa ke Google Sheets (Folder 'Data Analisis dan Nilai')
 */
export async function syncStudentSessionToFirestore(
  session: StudentExamSession,
  _finalSubmit = false
): Promise<SessionSyncResult> {
  try {
    const res = await syncStudentSessionToGAS(session);
    return {
      success: res.success,
      isReset: res.isReset,
      message: res.message,
    };
  } catch (err: any) {
    console.warn("Gagal menyimpan sesi ujian siswa:", err);
    return { success: false, message: err?.message };
  }
}

/**
 * Mengambil seluruh sesi ujian dari Google Sheets (Folder 'Data Analisis dan Nilai')
 */
export async function fetchExamSessions(
  examCodeOrId?: string,
  _examIdOrOptions?: any,
  _optionsOrIncludeDeleted?: any
): Promise<StudentExamSession[]> {
  return await fetchSessionsGAS(examCodeOrId);
}

/**
 * Berlangganan sesi realtime (polling interval Google Sheets & server)
 */
export function subscribeToExamSessions(
  examCodeOrId: string | undefined,
  onUpdate: (sessions: StudentExamSession[]) => void,
  _onError?: (error: any) => void
): () => void {
  let active = true;

  const poll = async () => {
    if (!active) return;
    try {
      const sessions = await fetchSessionsGAS(examCodeOrId);
      if (active) onUpdate(sessions);
    } catch (e) {
      // silent retry
    }
  };

  poll();
  const interval = setInterval(poll, 4000);

  return () => {
    active = false;
    clearInterval(interval);
  };
}

/**
 * Hapus sesi siswa
 */
export async function deleteStudentSessionFromFirestore(
  sessionId: string,
  studentNameOrExamCode?: string,
  tokenOrStudentName?: string,
  examCode?: string,
  _nisn?: string
): Promise<boolean> {
  const actualExamCode = examCode || (studentNameOrExamCode && studentNameOrExamCode.length <= 10 ? studentNameOrExamCode : undefined);
  const actualStudentName = tokenOrStudentName || (studentNameOrExamCode && studentNameOrExamCode.length > 10 ? studentNameOrExamCode : undefined);
  return await deleteSessionGAS(sessionId, actualExamCode, actualStudentName);
}

export interface BatchDeleteOptions {
  sessionIds: string[];
  studentNames?: string[];
  tokens?: string[];
  nisns?: string[];
  examCode?: string;
  examId?: string;
}

export async function batchDeleteStudentSessionsFromFirestore(
  options: BatchDeleteOptions
): Promise<boolean> {
  const count = await batchDeleteSessionsGAS(options.sessionIds, options.examCode);
  return count > 0;
}

export interface ReconcileResult {
  success: boolean;
  mergedSessionsCount: number;
  sessions: StudentExamSession[];
}

export async function reconcileAndMergeExamSessions(
  examId: string,
  canonicalCode: string
): Promise<ReconcileResult> {
  try {
    const sessions = await reconcileGAS(examId, canonicalCode);
    return {
      success: true,
      mergedSessionsCount: sessions.length,
      sessions,
    };
  } catch (e) {
    console.warn("Reconcile error:", e);
    return {
      success: false,
      mergedSessionsCount: 0,
      sessions: [],
    };
  }
}
