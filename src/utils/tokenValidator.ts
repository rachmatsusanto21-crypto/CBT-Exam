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

  // 4. Check across other exams in storage or props (excluding currentExam to prevent stale cache matching)
  const allExams = allExamsList && allExamsList.length > 0 ? allExamsList : getExamPackages();
  const otherExams = allExams.filter((e) => e.id !== currentExam.id);

  // 4a. Check other exams' master tokens or codes
  const matchedOtherExam = otherExams.find(
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
    const isCurrentExamCode =
      normalizeToken(matchedInAllTokens.examCode) === currentExamNormCode ||
      matchedInAllTokens.examCode === currentExam.id;

    const targetExam = isCurrentExamCode
      ? currentExam
      : allExams.find(
          (e) =>
            normalizeToken(e.code) === normalizeToken(matchedInAllTokens.examCode) ||
            e.id === matchedInAllTokens.examCode
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
 * Deduplicates and isolates student tokens strictly by exam code and/or class name.
 * Prevents student rosters from other classes or different exams from leaking or mixing.
 */
export function deduplicateStudentTokens(
  tokenList: StudentTokenItem[],
  targetExamCode?: string,
  targetClassName?: string
): StudentTokenItem[] {
  if (!Array.isArray(tokenList) || tokenList.length === 0) return [];

  const targetCode = targetExamCode ? targetExamCode.trim().toUpperCase() : null;
  const targetClass = targetClassName ? targetClassName.trim().toLowerCase() : null;

  let sourceList: StudentTokenItem[] = [];

  if (targetCode || targetClass) {
    // 1. First priority: match by exact examCode
    if (targetCode) {
      const codeMatches = tokenList.filter((t) => {
        if (!t) return false;
        const c = (t.examCode || "").trim().toUpperCase();
        return c === targetCode || (t.id && t.id.toUpperCase() === targetCode);
      });
      if (codeMatches.length > 0) {
        sourceList = codeMatches;
      }
    }

    // 2. Second priority: if no exact examCode match found, try matching by class name
    if (sourceList.length === 0 && targetClass) {
      const classMatches = tokenList.filter((t) => {
        if (!t) return false;
        const cl = (t.className || "").trim().toLowerCase();
        return cl === targetClass;
      });
      if (classMatches.length > 0) {
        sourceList = classMatches;
      }
    }

    // Strict boundary: If neither exam code nor class matched, return empty so other classes NEVER mix!
  } else {
    // Global list (e.g. general token repository view)
    sourceList = tokenList;
  }

  if (sourceList.length === 0) return [];

  // Deduplicate unique students
  const uniqueMap = new Map<string, StudentTokenItem>();

  sourceList.forEach((item, idx) => {
    if (!item || !item.studentName) return;
    const cleanName = item.studentName.trim().toLowerCase();
    if (!cleanName) return;

    // When global list (no targetCode), include className and examCode in key so different classes are never merged
    const key = targetCode
      ? cleanName
      : `${cleanName}__${(item.className || "").trim().toLowerCase()}__${(item.examCode || "").trim().toUpperCase()}`;

    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, {
        ...item,
        id: item.id || `tok-${idx + 1}-${cleanName.replace(/\s+/g, "")}`,
        examCode: item.examCode || targetCode || undefined,
        className: item.className || targetClassName || undefined,
      });
    }
  });

  return Array.from(uniqueMap.values());
}

