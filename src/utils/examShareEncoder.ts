import LZString from "lz-string";
import { ExamPackage, StudentTokenItem, Question, QuestionType, QuestionOption, MatchingPair, SchoolProfile, TeacherProfile } from "../types";

export interface SharedExamPayload {
  exam: ExamPackage;
  token?: string;
  tokens?: StudentTokenItem[];
  v?: number;
}

// Compact types for high compression ratio
type CompactType = "pg" | "pgk" | "mj" | "is" | "ur" | "bs";

const typeToCompact: Record<QuestionType, CompactType> = {
  pilihan_ganda: "pg",
  pilihan_ganda_kompleks: "pgk",
  menjodohkan: "mj",
  isian_singkat: "is",
  uraian: "ur",
  benar_salah: "bs",
};

const compactToType: Record<string, QuestionType> = {
  pg: "pilihan_ganda",
  pgk: "pilihan_ganda_kompleks",
  mj: "menjodohkan",
  is: "isian_singkat",
  ur: "uraian",
  bs: "benar_salah",
};

/**
 * Minify an ExamPackage into a compact JSON-compatible object to minimize URL size
 */
export const minifyExamPackage = (exam: ExamPackage): Record<string, any> => {
  return {
    i: exam.id,
    t: exam.title,
    d: exam.description || undefined,
    c: exam.code,
    m: exam.durationMinutes,
    s: exam.totalScore,
    sq: exam.shuffleQuestions ? 1 : 0,
    so: exam.shuffleOptions ? 1 : 0,
    ar: exam.allowReviewExplanation ? 1 : 0,
    st: exam.sessionToken || undefined,
    sp: exam.schoolProfile
      ? {
          sn: exam.schoolProfile.schoolName || "",
          np: exam.schoolProfile.npsn || "",
          ag: exam.schoolProfile.agencyName || "",
          ad: exam.schoolProfile.address || "",
          pc: exam.schoolProfile.postalCode || "",
          ph: exam.schoolProfile.phone || "",
          em: exam.schoolProfile.email || "",
          ws: exam.schoolProfile.website || "",
          pn: exam.schoolProfile.principalName || "",
          pi: exam.schoolProfile.principalNIP || "",
        }
      : undefined,
    tp: exam.teacherProfile
      ? {
          tn: exam.teacherProfile.teacherName || "",
          ti: exam.teacherProfile.teacherNIP || "",
          sb: exam.teacherProfile.subject || "",
          sc: exam.teacherProfile.subjectCode || "",
          gl: exam.teacherProfile.gradeLevel || "",
          ay: exam.teacherProfile.academicYear || "",
          sm: exam.teacherProfile.semester || "Ganjil",
          pg: exam.teacherProfile.passingGrade || 75,
          dm: exam.teacherProfile.durationMinutes || exam.durationMinutes || 60,
        }
      : undefined,
    q: (exam.questions || []).map((q: Question, idx: number) => {
      const compactQ: Record<string, any> = {
        i: q.id,
        qn: q.questionNumber || idx + 1,
        y: typeToCompact[q.type] || "pg",
        qt: q.questionText,
      };

      if (q.stimulus) compactQ.st = q.stimulus;
      // Keep imageUrl if not gigantic base64 to avoid URL length issues
      if (q.imageUrl && (!q.imageUrl.startsWith("data:image/") || q.imageUrl.length < 35000)) {
        compactQ.iu = q.imageUrl;
      }
      if (q.imageCaption) compactQ.ic = q.imageCaption;
      if (q.score !== undefined) compactQ.sc = q.score;
      if (q.correctAnswer) compactQ.ca = q.correctAnswer;
      if (q.explanation) compactQ.ex = q.explanation;
      if (q.sampleAnswer) compactQ.sa = q.sampleAnswer;
      if (q.topicTag) compactQ.tt = q.topicTag;
      if (q.cognitiveLevel) compactQ.cl = q.cognitiveLevel;

      if (q.options && q.options.length > 0) {
        compactQ.o = q.options.map((opt) => [opt.key, opt.text]);
      }

      if (q.matchingPairs && q.matchingPairs.length > 0) {
        compactQ.mp = q.matchingPairs.map((p) => [p.id, p.left, p.right]);
      }

      return compactQ;
    }),
  };
};

/**
 * Expand a minified compact object back into a full ExamPackage
 */
export const unminifyExamPackage = (min: Record<string, any>): ExamPackage => {
  // If already standard format
  if (min.id && Array.isArray(min.questions)) {
    return min as ExamPackage;
  }

  const questions: Question[] = (min.q || []).map((mq: Record<string, any>, idx: number) => {
    const rawType = mq.y ? compactToType[mq.y] || "pilihan_ganda" : "pilihan_ganda";
    const options: QuestionOption[] = Array.isArray(mq.o)
      ? mq.o.map((oItem: any) =>
          Array.isArray(oItem) ? { key: oItem[0], text: oItem[1] } : oItem
        )
      : [];

    const matchingPairs: MatchingPair[] | undefined = Array.isArray(mq.mp)
      ? mq.mp.map((pItem: any, pIdx: number) =>
          Array.isArray(pItem)
            ? { id: pItem[0] || `p-${pIdx}`, left: pItem[1] || "", right: pItem[2] || "" }
            : pItem
        )
      : undefined;

    return {
      id: mq.i || `q-${idx + 1}`,
      questionNumber: mq.qn || idx + 1,
      type: rawType,
      stimulus: mq.st || undefined,
      questionText: mq.qt || "",
      imageUrl: mq.iu || undefined,
      imageCaption: mq.ic || undefined,
      options,
      correctAnswer: mq.ca || "",
      matchingPairs,
      explanation: mq.ex || "",
      sampleAnswer: mq.sa || undefined,
      score: mq.sc !== undefined ? mq.sc : 10,
      topicTag: mq.tt || undefined,
      cognitiveLevel: mq.cl || undefined,
    };
  });

  const schoolProfile: SchoolProfile = {
    schoolName: min.sp?.sn || "SD Negeri Contoh",
    npsn: min.sp?.np || "12345678",
    agencyName: min.sp?.ag || "DINAS PENDIDIKAN DAN KEBUDAYAAN",
    address: min.sp?.ad || "Jl. Pendidikan No. 1",
    postalCode: min.sp?.pc || "12345",
    phone: min.sp?.ph || "021-1234567",
    email: min.sp?.em || "sekolah@example.sch.id",
    website: min.sp?.ws || "www.sekolah.sch.id",
    principalName: min.sp?.pn || "Kepala Sekolah, M.Pd.",
    principalNIP: min.sp?.pi || "197501012000031001",
  };

  const teacherProfile: TeacherProfile = {
    teacherName: min.tp?.tn || "Guru Pengampu",
    teacherNIP: min.tp?.ti || "198001012005011002",
    subject: min.tp?.sb || "Umum",
    subjectCode: min.tp?.sc || "MAPEL",
    gradeLevel: min.tp?.gl || "Kelas VI",
    academicYear: min.tp?.ay || "2025/2026",
    semester: (min.tp?.sm === "Genap" ? "Genap" : "Ganjil") as "Ganjil" | "Genap",
    passingGrade: min.tp?.pg || 75,
    durationMinutes: min.tp?.dm || min.m || 60,
  };

  return {
    id: min.i || `exam-${Date.now()}`,
    code: min.c || "CBT-01",
    title: min.t || "Paket Ujian CBT",
    description: min.d || "",
    schoolProfile,
    teacherProfile,
    questions,
    totalScore: min.s || questions.reduce((acc, q) => acc + (q.score || 0), 0),
    durationMinutes: min.m || 60,
    sessionToken: min.st || "TOKEN1",
    tokenCreatedAt: new Date().toISOString(),
    isTokenActive: true,
    allowReviewExplanation: min.ar !== undefined ? !!min.ar : true,
    shuffleQuestions: min.sq !== undefined ? !!min.sq : true,
    shuffleOptions: min.so !== undefined ? !!min.so : true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

/**
 * Encodes an ExamPackage (and optional token/tokens) into a compact, URL-safe string.
 */
export const encodeExamToSharePayload = (
  exam: ExamPackage,
  token?: string,
  tokens?: StudentTokenItem[]
): string => {
  try {
    const compactExam = minifyExamPackage(exam);
    const compactTokens =
      tokens && tokens.length > 0
        ? tokens.map((t) => [
            t.id,
            t.token,
            t.studentName || "",
            t.nisn || "",
            t.className || "",
            t.seatNumber || "",
            t.status || "belum_mulai",
          ])
        : undefined;

    const payload = {
      e: compactExam,
      k: token || undefined,
      ks: compactTokens,
      v: 2,
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
  tokens?: StudentTokenItem[],
  includePackageData: boolean = true
): string => {
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";

  if (includePackageData) {
    const payload = encodeExamToSharePayload(exam, token, tokens);
    if (payload) {
      return `${cleanBase}?mode=student&code=${encodeURIComponent(exam.code)}${tokenQuery}&pkg=${payload}`;
    }
  }

  // Short URL (Ideal for QR Code & projector display)
  return `${cleanBase}?mode=student&code=${encodeURIComponent(exam.code)}&examId=${encodeURIComponent(exam.id)}${tokenQuery}`;
};

/**
 * Generates an ultra-short URL for QR Codes and quick mobile typing
 */
export const generateShortStudentUrl = (
  baseUrl: string,
  exam: ExamPackage,
  token?: string
): string => {
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
  return `${cleanBase}?mode=student&code=${encodeURIComponent(exam.code)}${tokenQuery}`;
};

/**
 * Generates short Google Drive link that forces loading exam directly from Google Drive
 * Without long pkg URL parameter!
 * Format: ?mode=student&code=PP-01&driveId=...
 */
export const generateDriveStudentUrl = (
  baseUrl: string,
  exam: ExamPackage,
  token?: string
): string => {
  const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : "";
  const driveParam = exam.gdriveFileId ? `&driveId=${encodeURIComponent(exam.gdriveFileId)}` : "";
  return `${cleanBase}?mode=student&code=${encodeURIComponent(exam.code)}${driveParam}${tokenQuery}`;
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

    // Format v2 (Compact)
    if (parsed && parsed.e) {
      const restoredExam = unminifyExamPackage(parsed.e);
      let restoredTokens: StudentTokenItem[] | undefined;
      if (Array.isArray(parsed.ks)) {
        restoredTokens = parsed.ks.map((kItem: any, kIdx: number) =>
          Array.isArray(kItem)
            ? {
                id: kItem[0] || `tok-${kIdx}`,
                token: kItem[1],
                studentName: kItem[2] || "",
                nisn: kItem[3] || "",
                className: kItem[4] || "",
                seatNumber: kItem[5] || undefined,
                status: kItem[6] || "belum_mulai",
                examCode: restoredExam.code,
                generatedAt: new Date().toISOString(),
              }
            : kItem
        );
      }

      return {
        exam: restoredExam,
        token: parsed.k || searchParams.get("token") || undefined,
        tokens: restoredTokens,
        v: 2,
      };
    }

    // Format v1 (Standard full JSON)
    if (parsed && typeof parsed === "object") {
      if (parsed.exam && Array.isArray(parsed.exam.questions)) {
        return parsed as SharedExamPayload;
      }
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
