import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ExamPackage, StudentTokenItem, StudentExamSession } from "../types";

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

    // 1. Save in 'exams' collection
    await setDoc(doc(db, "exams", cleanId), payload, { merge: true });

    // 2. Save in 'examCodes' collection for fast short-code lookups (e.g. "PP-01")
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
    console.error("Failed to sync exam to Firestore:", err);
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

    // 1. Try to find by code in 'examCodes' collection
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
      if (data?.examId) {
        // Fallback to fetching the full exam doc
        const examDocSnap = await getDoc(doc(db, "exams", data.examId));
        if (examDocSnap.exists()) {
          const examData = examDocSnap.data();
          return {
            exam: examData as ExamPackage,
            token: examData.sessionToken,
            tokens: examData.tokens || [],
          };
        }
      }
    }

    // 2. Try to find by exact ID in 'exams' collection
    const examDocSnap = await getDoc(doc(db, "exams", query));
    if (examDocSnap.exists()) {
      const examData = examDocSnap.data();
      return {
        exam: examData as ExamPackage,
        token: examData.sessionToken,
        tokens: examData.tokens || [],
      };
    }

    return { exam: null };
  } catch (err) {
    console.error("Failed to fetch exam from Firestore:", err);
    return { exam: null };
  }
}

/**
 * Sync student exam session progress/completion to Firestore
 */
export async function syncStudentSessionToFirestore(session: StudentExamSession): Promise<boolean> {
  try {
    if (!session || !session.id) return false;
    const sanitized = sanitizeForFirestore(session);
    await setDoc(doc(db, "sessions", session.id), sanitized, { merge: true });
    return true;
  } catch (err) {
    console.warn("Failed to sync student session to Firestore:", err);
    return false;
  }
}
