import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));

// Server-Side Gemini API client
const getGeminiClient = (customKey?: string) => {
  const apiKey = (customKey && customKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Kunci API Gemini belum terhubung. Silakan masukkan Kunci API Gemini melalui menu 'Kunci API Gemini' atau konfigurasi GEMINI_API_KEY."
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Check Gemini API Key Status
app.get("/api/gemini/status", (req, res) => {
  const headerKey = req.headers["x-gemini-api-key"] as string | undefined;
  const envKey = process.env.GEMINI_API_KEY;
  const activeKey = (headerKey && headerKey.trim()) || (envKey && envKey.trim()) || "";

  if (!activeKey) {
    return res.json({
      configured: false,
      source: "none",
      message: "Kunci API Gemini belum terhubung.",
      model: "gemini-3.7-flash",
    });
  }

  const maskedKey =
    activeKey.length > 8
      ? `${activeKey.slice(0, 4)}••••••••${activeKey.slice(-4)}`
      : "••••••••";

  res.json({
    configured: true,
    source: headerKey ? "custom" : "env",
    maskedKey,
    model: "gemini-3.7-flash",
    message: headerKey
      ? "Kunci API Gemini kustom aktif dan terhubung."
      : "Kunci API Gemini sistem server aktif dan terhubung.",
  });
});

// Test Gemini Connection
app.post("/api/gemini/test-connection", async (req, res) => {
  const startTime = Date.now();
  try {
    const customKey = (req.headers["x-gemini-api-key"] as string) || req.body?.apiKey;
    const ai = getGeminiClient(customKey);

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: "Balas dengan tepat satu kata: Siap.",
      config: {
        systemInstruction: "Anda adalah asisten AI pemeriksa status koneksi.",
      },
    });

    const latencyMs = Date.now() - startTime;
    res.json({
      success: true,
      message: "Koneksi ke Google Gemini AI (gemini-3.7-flash) berhasil terhubung!",
      latencyMs,
      reply: response.text?.trim() || "Siap.",
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    console.error("Gemini test connection failed:", error);
    res.status(400).json({
      success: false,
      error: error.message || "Gagal menghubungkan ke Gemini API. Pastikan API key valid.",
      latencyMs,
    });
  }
});

// AI Question Generator Endpoint
app.post("/api/gemini/generate-questions", async (req, res) => {
  try {
    const customKey = (req.headers["x-gemini-api-key"] as string) || req.body?.apiKey;
    const {
      subject,
      gradeLevel,
      topic,
      count = 5,
      difficulty = "sedang",
      questionType = "pilihan_ganda",
      additionalInstructions = "",
      defaultScorePerQuestion = 10,
    } = req.body;

    const ai = getGeminiClient(customKey);

    const prompt = `Anda adalah seorang ahli pembuat soal ujian kurikulum merdeka / nasional Indonesia yang sangat berpengalaman.
Buatlah ${count} butir soal ujian dengan ketentuan:
- Mata Pelajaran: ${subject || "Umum"}
- Jenjang / Kelas: ${gradeLevel || "SMP / SMA"}
- Topik / Materi: ${topic || "Umum"}
- Tingkat Kesukaran: ${difficulty} (mudah, sedang, sukar, atau variatif HOTS)
- Tipe Soal Utama: ${questionType} (pilihan_ganda dengan 4-5 opsi A, B, C, D, E)
- Bobot Nilai per Soal: ${defaultScorePerQuestion} poin
- Instruksi Tambahan: ${additionalInstructions || "Sajikan soal berbasis stimulus kontekstual, studi kasus, atau data penalaran"}

Kembalikan format JSON yang valid persis sesuai skema yang diminta.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        systemInstruction:
          "Anda adalah pembuat soal ujian profesional. Berikan soal berkualitas tinggi, tanpa bias, opsi pengecoh yang masuk akal, stimulus bacaan/kasus relevan, kunci jawaban yang tepat, dan pembahasan yang lengkap dan mendidik.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            examTitle: { type: Type.STRING, description: "Judul paket ujian yang sesuai materi" },
            subject: { type: Type.STRING, description: "Nama mata pelajaran" },
            gradeLevel: { type: Type.STRING, description: "Jenjang atau kelas" },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: "Unique ID e.g. q1, q2" },
                  questionNumber: { type: Type.INTEGER, description: "Nomor urut soal" },
                  stimulus: { type: Type.STRING, description: "Teks stimulus, cerita kasus, data, atau narasi soal (boleh kosong jika soal langsung)" },
                  questionText: { type: Type.STRING, description: "Pertanyaan inti yang jelas" },
                  type: { type: Type.STRING, description: "pilihan_ganda | pilihan_ganda_kompleks | benar_salah | isian_singkat" },
                  options: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        key: { type: Type.STRING, description: "A, B, C, D, atau E" },
                        text: { type: Type.STRING, description: "Teks isi pilihan jawaban" }
                      },
                      required: ["key", "text"]
                    },
                    description: "Daftar opsi jawaban untuk pilihan ganda"
                  },
                  correctAnswer: { type: Type.STRING, description: "Kunci jawaban benar, misal 'A' atau 'B' (atau jika kompleks dipisah koma 'A,C')" },
                  score: { type: Type.NUMBER, description: "Bobot skor nilai butir soal ini" },
                  explanation: { type: Type.STRING, description: "Pembahasan lengkap dan alasan jawaban benar" },
                  cognitiveLevel: { type: Type.STRING, description: "Level kognitif: C1-Mengingat, C2-Memahami, C3-Menerapkan, C4-Menganalisis, C5-Mengevaluasi, C6-Mencipta (HOTS)" },
                  topicTag: { type: Type.STRING, description: "Subtopik materi spesifik" }
                },
                required: ["questionText", "correctAnswer", "score", "explanation"]
              }
            }
          },
          required: ["examTitle", "questions"]
        }
      }
    });

    const outputText = response.text || "{}";
    const parsedData = JSON.parse(outputText);

    res.json({ success: true, data: parsedData });
  } catch (error: any) {
    console.error("Error generating questions with Gemini:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Gagal membuat soal dengan Gemini AI."
    });
  }
});

// AI Diagnostic & Remediation feedback for student results
app.post("/api/gemini/analyze-student-remediation", async (req, res) => {
  try {
    const customKey = (req.headers["x-gemini-api-key"] as string) || req.body?.apiKey;
    const { studentName, subject, score, maxScore, wrongQuestions = [], totalQuestions } = req.body;
    const ai = getGeminiClient(customKey);

    const prompt = `Berikan analisis pembelajaran dan rekomendasi remedial personal untuk siswa:
- Nama: ${studentName}
- Mata Pelajaran: ${subject}
- Nilai: ${score} dari ${maxScore} (${Math.round((score / (maxScore || 100)) * 100)}%)
- Soal yang dijawab salah (${wrongQuestions.length} dari ${totalQuestions}):
${wrongQuestions.map((q: any, idx: number) => `${idx + 1}. Topik: ${q.topicTag || "Umum"} | Soal: ${q.questionText} | Jawaban Siswa: ${q.studentAnswer} | Kunci: ${q.correctAnswer} | Pembahasan: ${q.explanation}`).join("\n")}

Berikan:
1. Evaluasi kelebihan dan kelemahan pemahaman konsep siswa
2. Rekomendasi 3 materi spesifik yang perlu dipelajari kembali
3. Kalimat motivasi apresiatif dan membangkitkan semangat belajar siswa.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        systemInstruction: "Anda adalah guru konselor dan evaluator pedagogik yang hangat, memotivasi, dan memberikan saran praktis bagi kemajuan belajar siswa.",
      }
    });

    res.json({ success: true, analysis: response.text });
  } catch (error: any) {
    console.error("Error analyzing student:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Vite middleware for development & static serving for production
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SlideExam CBT Server running on http://0.0.0.0:${PORT}`);
  });
}

setupVite();
