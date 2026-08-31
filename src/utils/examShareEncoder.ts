import LZString from "lz-string";
import { ExamPackage, StudentTokenItem } from "../types";

export interface SharedExamPayload {
  exam: ExamPackage;
  token?: string;
  tokens?: StudentTokenItem[];
  v?: number;
}

/**
 * Encodes an ExamPackage (and optional token/tokens) into a compact, URL-safe string.
 */
export const encodeExamToSharePayload = (
  exam: ExamPackage,
  token?: string,
  tokens?: StudentTokenItem[]
): string => {
  try {
    const payload: SharedExamPayload = {
      exam,
      token,
      tokens: tokens && tokens.length > 0 ? tokens : undefined,
      v: 1,
    };
    const jsonStr = JSON.stringify(payload);
    const compressed = LZString.compressToEncodedURIComponent(jsonStr);
    return compressed;
  } catch (err) {
    console.error("Failed to encode exam package for share:", err);
    return "";
  }
};

/**
 * Generates a full student exam URL containing the encoded payload and fallback parameters.
 */
export const generateStudentShareUrl = (
  baseUrl: string,
  exam: ExamPackage,
  token?: string,
  tokens?: StudentTokenItem[]
): string => {
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const payload = encodeExamToSharePayload(exam, token, tokens);

  if (payload) {
    // Put payload in query parameter 'pkg' and include readable fallback query params
    const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
    return `${cleanBase}?mode=student&examId=${encodeURIComponent(exam.id)}&code=${encodeURIComponent(exam.code)}${tokenQuery}&pkg=${payload}`;
  }

  // Fallback if compression fails
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
  return `${cleanBase}?mode=student&examId=${encodeURIComponent(exam.id)}&code=${encodeURIComponent(exam.code)}${tokenQuery}`;
};

/**
 * Decodes a SharedExamPayload from the current window URL (query parameters or hash).
 */
export const decodeExamFromCurrentUrl = (): SharedExamPayload | null => {
  if (typeof window === "undefined") return null;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    let rawPayload = searchParams.get("pkg") || searchParams.get("examData");

    // Also check window.location.hash if not in query
    if (!rawPayload && window.location.hash) {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
      const hashParams = new URLSearchParams(hash);
      rawPayload = hashParams.get("pkg") || hashParams.get("data") || hash;
    }

    if (!rawPayload) return null;

    // Decompress using LZString
    let decompressed = LZString.decompressFromEncodedURIComponent(rawPayload);

    // Fallback: try direct base64 decode if not lz-compressed
    if (!decompressed) {
      try {
        decompressed = decodeURIComponent(escape(atob(rawPayload)));
      } catch {
        decompressed = null;
      }
    }

    if (!decompressed) return null;

    const parsed = JSON.parse(decompressed);

    // Validate structure: must have exam object with questions array
    if (parsed && typeof parsed === "object") {
      if (parsed.exam && Array.isArray(parsed.exam.questions)) {
        return parsed as SharedExamPayload;
      }
      // If the object itself is the ExamPackage
      if (parsed.id && Array.isArray(parsed.questions)) {
        return {
          exam: parsed as ExamPackage,
          token: searchParams.get("token") || undefined,
        };
      }
    }
  } catch (err) {
    console.error("Failed to decode shared exam from URL:", err);
  }

  return null;
};
