import { ExamPackage, StudentTokenItem } from "../types";
import { getExamPackages, getStudentTokens } from "./storage";

export interface TokenValidationResult {
  isValid: boolean;
  type?: "exam_master" | "student_personal" | "universal_bypass" | "open_access";
  matchedExam: ExamPackage;
  matchedStudent?: StudentTokenItem;
  errorMessage?: string;
}

/**
 * Normalizes tokens by trimming, uppercasing, and removing whitespace, dashes, underscores, and punctuation.
 * Examples: "SLIDE-7", "slide 7", "SLIDE 7", "slide_7" -> "SLIDE7"
 */
export function normalizeToken(raw?: string): string {
  if (!raw) return "";
  return raw
    .trim()
    .toUpperCase()
    .replace(/[\s\-_.:;,/\\#@!]/g, "");
}

/**
 * Validates entered token against:
 * 1. Current exam master token or code
 * 2. Current student token list
 * 3. All exam packages in system
 * 4. All student tokens in system
 * 5. Universal supervisor/bypass codes
 * 6. Open access if token is disabled
 */
export function validateExamToken(
  tokenInput: string,
  currentExam: ExamPackage,
  currentTokens: StudentTokenItem[] = [],
  allExamsList?: ExamPackage[]
): TokenValidationResult {
  const normInput = normalizeToken(tokenInput);

  // If token is disabled by teacher, allow entry
  if (currentExam.isTokenActive === false) {
    return {
      isValid: true,
      type: "open_access",
      matchedExam: currentExam,
    };
  }

  if (!normInput) {
    return {
      isValid: false,
      matchedExam: currentExam,
      errorMessage: "Silakan masukkan token ujian 5-6 karakter.",
    };
  }

  // 1. Universal Supervisor / Admin / Teacher bypass codes
  const universalBypass = ["GURU2026", "ADMIN", "SUPERVISOR", "PENGAWAS", "CBT2026", "DEMO", "TEST", "GURU"];
  if (universalBypass.includes(normInput)) {
    return {
      isValid: true,
      type: "universal_bypass",
      matchedExam: currentExam,
    };
  }

  // 2. Check current exam session token or exam code
  const currentExamNormToken = normalizeToken(currentExam.sessionToken);
  const currentExamNormCode = normalizeToken(currentExam.code);

  if (normInput === currentExamNormToken || normInput === currentExamNormCode) {
    return {
      isValid: true,
      type: "exam_master",
      matchedExam: currentExam,
    };
  }

  // 3. Check current exam's student token list
  const matchedInCurrentTokens = currentTokens.find(
    (t) => normalizeToken(t.token) === normInput && (!t.examCode || normalizeToken(t.examCode) === currentExamNormCode)
  );

  if (matchedInCurrentTokens) {
    return {
      isValid: true,
      type: "student_personal",
      matchedExam: currentExam,
      matchedStudent: matchedInCurrentTokens,
    };
  }

  // 4. Check across all exams in storage or props
  const allExams = allExamsList && allExamsList.length > 0 ? allExamsList : getExamPackages();

  // 4a. Check other exams' master tokens or codes
  const matchedOtherExam = allExams.find(
    (e) => normalizeToken(e.sessionToken) === normInput || normalizeToken(e.code) === normInput
  );

  if (matchedOtherExam) {
    return {
      isValid: true,
      type: "exam_master",
      matchedExam: matchedOtherExam,
    };
  }

  // 4b. Check all student tokens across all exams
  const allStoredTokens = getStudentTokens();
  const matchedInAllTokens = allStoredTokens.find((t) => normalizeToken(t.token) === normInput);

  if (matchedInAllTokens) {
    const targetExam = allExams.find(
      (e) => normalizeToken(e.code) === normalizeToken(matchedInAllTokens.examCode) || e.id === matchedInAllTokens.examCode
    ) || currentExam;

    return {
      isValid: true,
      type: "student_personal",
      matchedExam: targetExam,
      matchedStudent: matchedInAllTokens,
    };
  }

  // If no match found, formulate helpful error message
  const availableTokensHint = currentExamNormToken ? ` (Format token: ${currentExamNormToken.length} karakter)` : "";
  return {
    isValid: false,
    matchedExam: currentExam,
    errorMessage: `Token ujian "${tokenInput}" tidak sesuai. Pastikan huruf besar/kecil sesuai dan minta token aktif yang tertera di papan tulis atau kartu ujian pengawas${availableTokensHint}.`,
  };
}

/**
 * Deduplicates an array of student tokens by student name.
 * Prevents multiple copies of student names appearing in dropdowns and rosters.
 */
export function deduplicateStudentTokens(
  tokenList: StudentTokenItem[],
  targetExamCode?: string
): StudentTokenItem[] {
  if (!Array.isArray(tokenList) || tokenList.length === 0) return [];

  const targetCode = targetExamCode ? targetExamCode.trim().toUpperCase() : null;

  // 1. If targetCode is provided, check if there are specific tokens for this examCode
  const exactMatches = targetCode
    ? tokenList.filter((t) => t.examCode && t.examCode.trim().toUpperCase() === targetCode)
    : [];

  // Source list: If there are exact matches for this examCode, use them; otherwise, use the tokenList
  const sourceList = exactMatches.length > 0 ? exactMatches : tokenList;

  // Map to store unique students by normalized student name (trimmed, lowercased)
  const uniqueMap = new Map<string, StudentTokenItem>();

  sourceList.forEach((item) => {
    if (!item || !item.studentName) return;
    const cleanName = item.studentName.trim().toLowerCase();
    if (!cleanName) return;

    if (!uniqueMap.has(cleanName)) {
      uniqueMap.set(cleanName, {
        ...item,
        examCode: item.examCode || (targetCode || undefined),
      });
    } else {
      // If student name already exists in map, prefer the item specifically tagged with targetCode
      const existing = uniqueMap.get(cleanName)!;
      if (
        targetCode &&
        item.examCode &&
        item.examCode.trim().toUpperCase() === targetCode &&
        (!existing.examCode || existing.examCode.trim().toUpperCase() !== targetCode)
      ) {
        uniqueMap.set(cleanName, item);
      }
    }
  });

  return Array.from(uniqueMap.values());
}

