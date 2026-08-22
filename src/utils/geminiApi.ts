import { GoogleGenAI, Type } from "@google/genai";
import { getCustomGeminiApiKey, getGeminiRequestHeaders } from "./storage";
import { Question, QuestionType } from "../types";

/**
 * Format friendly Gemini error message
 */
export function formatGeminiClientError(error: any): string {
  const msg = error?.message || (typeof error === "string" ? error : "");
  if (
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("temporarily overloaded")
  ) {
    return "Server Google Gemini sedang mengalami lonjakan beban tinggi sementara (503 Service Unavailable). Silakan klik 'Coba Lagi' dalam beberapa saat.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
    return "Batas kuota harian/menit API Gemini telah tercapai (429 Too Many Requests). Silakan tunggu sebentar sebelum mencoba kembali.";
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
    return "Kunci API Gemini tidak valid atau belum diaktifkan. Silakan periksa kembali Kunci API Anda di menu 'Kunci API Gemini'.";
  }
  return msg || "Terjadi kendala saat memproses permintaan dengan Google Gemini AI.";
}

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

export interface GenerateImageParams {
  prompt: string;
  subject?: string;
  questionContext?: string;
}

export interface GenerateImageResult {
  imageUrl: string;
  caption?: string;
  source: string;
}

/**
 * Generate educational question image/diagram with AI (Imagen or SVG vector)
 */
export async function generateImageWithAi(params: GenerateImageParams): Promise<GenerateImageResult> {
  const customKey = getCustomGeminiApiKey();

  // Try server endpoint first
  try {
    const headers = getGeminiRequestHeaders();
    const res = await fetch("/api/gemini/generate-image", {
      method: "POST",
      headers,
      body: JSON.stringify(params),
    });

    const parsed = await safeParseResponse(res);
    if (parsed.isJson && parsed.data?.success && parsed.data?.imageUrl) {
      return {
        imageUrl: parsed.data.imageUrl,
        caption: parsed.data.caption || params.prompt,
        source: parsed.data.source || "server-ai",
      };
    }
  } catch (err) {
    console.warn("Server generate-image endpoint failed, attempting client fallback:", err);
  }

  // Client-side fallback with @google/genai
  if (customKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: customKey });

      // Try generating SVG illustration via Gemini Flash
      const svgPrompt = `Anda adalah desainer diagram ilmiah dan materi pembelajaran sekolah.
Buatlah gambar/diagram vektor SVG yang bersih, kontras tinggi, proporsional, dan sangat rapi berdasarkan deskripsi berikut:
"${params.prompt}"
Mata Pelajaran: ${params.subject || "Pendidikan Umum"}. ${params.questionContext ? `Konteks: ${params.questionContext}` : ""}

Ketentuan SVG:
- Output HANYA tag XML <svg>...</svg> murni tanpa pembuka/penutup markdown (\`\`\`).
- viewBox="0 0 600 400" dengan aspect ratio 3:2 atau 4:3.
- Background rect warna gelap elegan (#1e293b atau gradien modern) dan elemen diagram berwarna cerah kontras (#38bdf8, #818cf8, #34d399, #f43f5e, #fbbf24).
- Lengkapi dengan label teks penjelas yang jelas dan panah jika perlu.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: svgPrompt,
        config: {
          systemInstruction:
            "Anda hanya menghasilkan kode SVG XML murni valid tanpa teks pengantar atau penutup apapun.",
        },
      });

      let rawSvg = response.text?.trim() || "";
      if (rawSvg.startsWith("```")) {
        rawSvg = rawSvg.replace(/^```(svg|xml)?\s*/i, "").replace(/```\s*$/i, "").trim();
      }

      if (rawSvg.includes("<svg") && rawSvg.includes("</svg>")) {
        const startIdx = rawSvg.indexOf("<svg");
        const endIdx = rawSvg.lastIndexOf("</svg>") + 6;
        const cleanSvg = rawSvg.substring(startIdx, endIdx);
        const encodedSvg = encodeURIComponent(cleanSvg);
        const dataUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

        return {
          imageUrl: dataUrl,
          caption: params.prompt,
          source: "client_svg_ai",
        };
      }
    } catch (clientErr: any) {
      throw new Error(clientErr?.message || "Gagal membuat visual gambar dari Gemini AI.");
    }
  }

  throw new Error("Kunci API Gemini belum terhubung untuk membuat gambar AI.");
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
          matchingPairs: q.matchingPairs || (q.type === "menjodohkan" ? [
            { id: "m1", left: "Pernyataan 1", right: "Pasangan A" },
            { id: "m2", left: "Pernyataan 2", right: "Pasangan B" },
            { id: "m3", left: "Pernyataan 3", right: "Pasangan C" },
          ] : undefined),
          correctAnswer: q.correctAnswer || "A",
          score: q.score || params.defaultScorePerQuestion || 20,
          explanation: q.explanation || "Pembahasan otomatis AI",
          sampleAnswer: q.sampleAnswer || "",
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
- Tipe Soal Utama: ${params.questionType} (pilihan_ganda, menjodohkan, isian_singkat, atau uraian)
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
                  type: { type: Type.STRING, description: "pilihan_ganda | menjodohkan | isian_singkat | uraian" },
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
                  matchingPairs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        left: { type: Type.STRING },
                        right: { type: Type.STRING },
                      },
                      required: ["left", "right"],
                    },
                  },
                  correctAnswer: { type: Type.STRING, description: "Kunci jawaban benar" },
                  score: { type: Type.NUMBER, description: "Bobot nilai" },
                  explanation: { type: Type.STRING, description: "Pembahasan" },
                  sampleAnswer: { type: Type.STRING, description: "Contoh / rubrik jawaban uraian" },
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
      matchingPairs: q.matchingPairs,
      correctAnswer: q.correctAnswer || "A",
      score: q.score || params.defaultScorePerQuestion || 20,
      explanation: q.explanation || "Pembahasan otomatis AI",
      sampleAnswer: q.sampleAnswer || "",
      cognitiveLevel: q.cognitiveLevel || "C4 - HOTS",
      topicTag: q.topicTag || params.topic,
    }));

    return {
      examTitle: parsedJson.examTitle || `Ujian ${params.subject} - ${params.topic}`,
      questions,
    };
  } catch (clientErr: any) {
    throw new Error(formatGeminiClientError(clientErr));
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
    } else if (parsed.isJson && parsed.data?.error) {
      throw new Error(formatGeminiClientError(parsed.data.error));
    }
  } catch (err: any) {
    console.warn("Server remediation endpoint failed, falling back to client:", err);
    if (!customKey) {
      throw new Error(formatGeminiClientError(err));
    }
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
      throw new Error(formatGeminiClientError(err));
    }
  }

  throw new Error("Kunci API Gemini belum terhubung. Silakan masukkan Kunci API Anda.");
}
