import { GoogleGenAI, Type } from "@google/genai";
import { getCustomGeminiApiKey, getGeminiRequestHeaders } from "./storage";
import { Question, QuestionType } from "../types";

/**
 * Safely parse response as JSON, handling HTML error pages or non-JSON responses
 */
async function safeParseResponse(res: Response): Promise<{ isJson: boolean; data: any; rawText: string }> {
  const rawText = await res.text();
  try {
    const data = JSON.parse(rawText);
    return { isJson: true, data, rawText };
  } catch {
    return { isJson: false, data: null, rawText };
  }
}

export interface GeminiStatusResult {
  configured: boolean;
  source: "env" | "custom" | "none";
  maskedKey?: string;
  model: string;
  message: string;
}

export interface GeminiTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  error?: string;
}

export interface GenerateQuestionsParams {
  subject: string;
  gradeLevel: string;
  topic: string;
  count: number;
  difficulty: string;
  questionType: QuestionType;
  additionalInstructions?: string;
  defaultScorePerQuestion?: number;
}

export interface GenerateQuestionsResult {
  examTitle: string;
  questions: Question[];
}

/**
 * Check Gemini API key status
 */
export async function checkGeminiStatus(): Promise<GeminiStatusResult> {
  const customKey = getCustomGeminiApiKey();

  try {
    const headers = getGeminiRequestHeaders();
    const res = await fetch("/api/gemini/status", { headers });
    const parsed = await safeParseResponse(res);

    if (parsed.isJson && parsed.data) {
      return parsed.data;
    }
  } catch (err) {
    console.warn("Server status check error, falling back to local state:", err);
  }

  // Fallback to client-side detection if server endpoint is unavailable
  if (customKey) {
    const maskedKey =
      customKey.length > 8
        ? `${customKey.slice(0, 4)}••••••••${customKey.slice(-4)}`
        : "••••••••";
    return {
      configured: true,
      source: "custom",
      maskedKey,
      model: "gemini-3.7-flash",
      message: "Kunci API Gemini kustom aktif di peramban.",
    };
  }

  return {
    configured: false,
    source: "none",
    model: "gemini-3.7-flash",
    message: "Kunci API Gemini belum terhubung.",
  };
}

/**
 * Test connection to Gemini AI
 */
export async function testGeminiConnection(keyToTest?: string): Promise<GeminiTestResult> {
  const key = keyToTest !== undefined ? keyToTest.trim() : getCustomGeminiApiKey();
  const startTime = Date.now();

  // Try server endpoint first
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (key) {
      headers["x-gemini-api-key"] = key;
    }

    const res = await fetch("/api/gemini/test-connection", {
      method: "POST",
      headers,
      body: JSON.stringify({ apiKey: key || undefined }),
    });

    const parsed = await safeParseResponse(res);
    if (parsed.isJson && parsed.data) {
      const latencyMs = parsed.data.latencyMs ?? (Date.now() - startTime);
      if (parsed.data.success) {
        return {
          success: true,
          message: parsed.data.message || "Koneksi ke Google Gemini AI (gemini-3.7-flash) berhasil!",
          latencyMs,
        };
      } else {
        return {
          success: false,
          message: parsed.data.error || "Gagal menghubungkan ke Gemini API. Pastikan kunci API valid.",
          latencyMs,
        };
      }
    }
  } catch (serverErr) {
    console.warn("Server test-connection endpoint unreachable, attempting client-side test:", serverErr);
  }

  // Client-side direct fallback if key is available
  if (key) {
    try {
      const ai = new GoogleGenAI({ apiKey: key });
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: "Balas dengan tepat satu kata: Siap.",
        config: {
          systemInstruction: "Anda adalah asisten AI penguji koneksi.",
        },
      });

      const latencyMs = Date.now() - startTime;
      return {
        success: true,
        message: `Koneksi langsung ke Google Gemini AI (gemini-3.7-flash) berhasil! (${response.text?.trim() || "Siap"})`,
        latencyMs,
      };
    } catch (clientErr: any) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = clientErr?.message || "Gagal menghubungi Google Gemini API.";
      return {
        success: false,
        message: `Koneksi gagal: ${errorMsg}`,
        latencyMs,
      };
    }
  }

  return {
    success: false,
    message: "Kunci API Gemini belum diatur. Masukkan Kunci API Gemini Anda untuk menguji koneksi.",
  };
}

/**
 * Generate Questions with Gemini AI
 */
export async function generateQuestionsWithGemini(
  params: GenerateQuestionsParams,
  existingQuestionsCount: number = 0
): Promise<GenerateQuestionsResult> {
  const customKey = getCustomGeminiApiKey();

  // Try server endpoint first
  try {
    const headers = getGeminiRequestHeaders();
    const res = await fetch("/api/gemini/generate-questions", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    const parsed = await safeParseResponse(res);
    if (parsed.isJson && parsed.data) {
      if (parsed.data.success && parsed.data.data) {
        const d = parsed.data.data;
        const questions: Question[] = (d.questions || []).map((q: any, idx: number) => ({
          id: `q-ai-${Date.now()}-${idx + 1}`,
          questionNumber: existingQuestionsCount + idx + 1,
          stimulus: q.stimulus || "",
          questionText: q.questionText || "Pertanyaan",
          type: (q.type as QuestionType) || params.questionType || "pilihan_ganda",
          options: q.options || [
            { key: "A", text: "Opsi A" },
            { key: "B", text: "Opsi B" },
            { key: "C", text: "Opsi C" },
            { key: "D", text: "Opsi D" },
          ],
          correctAnswer: q.correctAnswer || "A",
          score: q.score || params.defaultScorePerQuestion || 20,
          explanation: q.explanation || "Pembahasan otomatis AI",
          cognitiveLevel: q.cognitiveLevel || "C4 - HOTS",
          topicTag: q.topicTag || params.topic,
        }));

        return {
          examTitle: d.examTitle || `Ujian ${params.subject} - ${params.topic}`,
          questions,
        };
      } else {
        throw new Error(parsed.data.error || "Server mengembalikan galat saat pembuatan soal.");
      }
    }
  } catch (err: any) {
    console.warn("Server generation failed, trying direct client fallback if key is available:", err);
    // If not a standard server JSON error with clear message, continue to client fallback
    if (!customKey) {
      throw new Error(
        err.message || "Gagal menghubungkan ke server pembuat soal. Pastikan Kunci API Gemini telah dimasukkan."
      );
    }
  }

  // Client-side fallback using @google/genai
  if (!customKey) {
    throw new Error(
      "Kunci API Gemini belum dimasukkan. Silakan buka menu 'Kunci API Gemini' untuk memasukkan kunci Anda."
    );
  }

  try {
    const ai = new GoogleGenAI({ apiKey: customKey });
    const prompt = `Anda adalah seorang ahli pembuat soal ujian kurikulum merdeka / nasional Indonesia yang sangat berpengalaman.
Buatlah ${params.count} butir soal ujian dengan ketentuan:
- Mata Pelajaran: ${params.subject || "Umum"}
- Jenjang / Kelas: ${params.gradeLevel || "SMP / SMA"}
- Topik / Materi: ${params.topic || "Umum"}
- Tingkat Kesukaran: ${params.difficulty} (mudah, sedang, sukar, atau variatif HOTS)
- Tipe Soal Utama: ${params.questionType} (pilihan_ganda dengan opsi A, B, C, D, E)
- Bobot Nilai per Soal: ${params.defaultScorePerQuestion || 20} poin
- Instruksi Tambahan: ${params.additionalInstructions || "Sajikan soal berbasis stimulus kontekstual dan penalaran HOTS"}

Kembalikan format JSON yang valid persis sesuai skema yang diminta.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "Anda adalah pembuat soal ujian profesional. Berikan soal berkualitas tinggi, stimulus bacaan/kasus relevan, kunci jawaban tepat, dan pembahasan lengkap.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            examTitle: { type: Type.STRING, description: "Judul paket ujian" },
            subject: { type: Type.STRING, description: "Nama mata pelajaran" },
            gradeLevel: { type: Type.STRING, description: "Jenjang atau kelas" },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Unique ID" },
                  questionNumber: { type: Type.INTEGER, description: "Nomor soal" },
                  stimulus: { type: Type.STRING, description: "Stimulus atau narasi kasus" },
                  questionText: { type: Type.STRING, description: "Pertanyaan inti" },
                  type: { type: Type.STRING, description: "Tipe soal" },
                  options: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        key: { type: Type.STRING, description: "A, B, C, D, atau E" },
                        text: { type: Type.STRING, description: "Teks opsi" },
                      },
                      required: ["key", "text"],
                    },
                  },
                  correctAnswer: { type: Type.STRING, description: "Kunci jawaban benar" },
                  score: { type: Type.NUMBER, description: "Bobot nilai" },
                  explanation: { type: Type.STRING, description: "Pembahasan" },
                  cognitiveLevel: { type: Type.STRING, description: "Level kognitif" },
                  topicTag: { type: Type.STRING, description: "Subtopik materi" },
                },
                required: ["questionText", "correctAnswer", "score", "explanation"],
              },
            },
          },
          required: ["examTitle", "questions"],
        },
      },
    });

    const parsedJson = JSON.parse(response.text || "{}");
    const questions: Question[] = (parsedJson.questions || []).map((q: any, idx: number) => ({
      id: `q-ai-${Date.now()}-${idx + 1}`,
      questionNumber: existingQuestionsCount + idx + 1,
      stimulus: q.stimulus || "",
      questionText: q.questionText || "Pertanyaan",
      type: (q.type as QuestionType) || params.questionType || "pilihan_ganda",
      options: q.options || [
        { key: "A", text: "Opsi A" },
        { key: "B", text: "Opsi B" },
        { key: "C", text: "Opsi C" },
        { key: "D", text: "Opsi D" },
      ],
      correctAnswer: q.correctAnswer || "A",
      score: q.score || params.defaultScorePerQuestion || 20,
      explanation: q.explanation || "Pembahasan otomatis AI",
      cognitiveLevel: q.cognitiveLevel || "C4 - HOTS",
      topicTag: q.topicTag || params.topic,
    }));

    return {
      examTitle: parsedJson.examTitle || `Ujian ${params.subject} - ${params.topic}`,
      questions,
    };
  } catch (clientErr: any) {
    throw new Error(clientErr?.message || "Gagal membuat butir soal melalui Google Gemini AI.");
  }
}

/**
 * Generate Student Remediation & Diagnostic Feedback
 */
export async function generateStudentRemediation(params: {
  studentName: string;
  subject: string;
  score: number;
  maxScore: number;
  wrongQuestions: any[];
  totalQuestions: number;
}): Promise<string> {
  const customKey = getCustomGeminiApiKey();

  // Try server endpoint first
  try {
    const headers = getGeminiRequestHeaders();
    const res = await fetch("/api/gemini/analyze-student-remediation", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    const parsed = await safeParseResponse(res);
    if (parsed.isJson && parsed.data?.success && parsed.data?.analysis) {
      return parsed.data.analysis;
    }
  } catch (err) {
    console.warn("Server remediation endpoint failed, falling back to client:", err);
  }

  // Client-side fallback
  if (customKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: customKey });
      const prompt = `Berikan analisis pembelajaran dan rekomendasi remedial personal untuk siswa:
- Nama: ${params.studentName}
- Mata Pelajaran: ${params.subject}
- Nilai: ${params.score} dari ${params.maxScore} (${Math.round((params.score / (params.maxScore || 100)) * 100)}%)
- Soal yang dijawab salah (${params.wrongQuestions.length} dari ${params.totalQuestions}):
${params.wrongQuestions.map((q: any, idx: number) => `${idx + 1}. Topik: ${q.topicTag || "Umum"} | Soal: ${q.questionText} | Jawaban Siswa: ${q.studentAnswer} | Kunci: ${q.correctAnswer} | Pembahasan: ${q.explanation}`).join("\n")}

Berikan:
1. Evaluasi kelebihan dan kelemahan pemahaman konsep siswa
2. Rekomendasi 3 materi spesifik yang perlu dipelajari kembali
3. Kalimat motivasi apresiatif dan membangkitkan semangat belajar siswa.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: prompt,
        config: {
          systemInstruction:
            "Anda adalah guru konselor dan evaluator pedagogik yang hangat, memotivasi, dan memberikan saran praktis bagi kemajuan belajar siswa.",
        },
      });

      return response.text || "Analisis remedial telah berhasil dibuat.";
    } catch (err: any) {
      throw new Error(err.message || "Gagal memproses analisis remedial dengan Gemini AI.");
    }
  }

  throw new Error("Kunci API Gemini belum terhubung. Silakan masukkan Kunci API Anda.");
}
