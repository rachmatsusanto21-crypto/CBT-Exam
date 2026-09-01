import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "20mb" }));

// Helper to sleep for ms
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Format friendly Gemini error message
function formatGeminiError(error: any): string {
  const msg = error?.message || (typeof error === "string" ? error : "");
  if (
    msg.includes("503") ||
    msg.includes("high demand") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("temporarily overloaded")
  ) {
    return "Server Google Gemini sedang mengalami lonjakan trafik tinggi sementara (503 Service Unavailable). Sistem telah mencoba otomatis, silakan klik 'Coba Lagi' dalam beberapa detik.";
  }
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("quota")) {
    return "Batas kuota harian/menit API Gemini telah tercapai (429 Too Many Requests). Silakan tunggu sebentar sebelum mencoba kembali.";
  }
  if (msg.includes("API_KEY_INVALID") || msg.includes("API key not valid")) {
    return "Kunci API Gemini tidak valid atau belum diaktifkan. Silakan periksa kembali Kunci API Anda di menu 'Kunci API Gemini'.";
  }
  return msg || "Terjadi kesalahan saat memproses permintaan dengan Google Gemini AI.";
}

// Resilient Gemini Generate Content caller with automatic fallback models & retry on 503 / 429
async function callGeminiWithResilience(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    preferredModel?: string;
    fallbackModels?: string[];
    maxRetries?: number;
  }
) {
  const models = [
    params.preferredModel || "gemini-3.6-flash",
    ...(params.fallbackModels || [
      "gemini-3.7-flash",
      "gemini-flash-latest",
      "gemini-3.1-flash-lite",
    ]),
  ];
  const maxRetries = params.maxRetries ?? 2;
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });
        return { response, modelUsed: model };
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || "";
        const isTransient =
          errMsg.includes("503") ||
          errMsg.includes("high demand") ||
          errMsg.includes("UNAVAILABLE") ||
          errMsg.includes("429") ||
          errMsg.includes("RESOURCE_EXHAUSTED") ||
          errMsg.includes("fetch failed");

        console.warn(`[Gemini Attempt Failed] Model: ${model}, Attempt: ${attempt + 1}/${maxRetries + 1}. Error: ${errMsg}`);

        if (isTransient && attempt < maxRetries) {
          // Wait with exponential backoff before retrying same model
          const backoffDelay = (attempt + 1) * 1200 + Math.random() * 500;
          await sleep(backoffDelay);
          continue;
        } else {
          // Break out to try next fallback model
          break;
        }
      }
    }
  }

  throw new Error(formatGeminiError(lastError));
}

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

// In-memory exam package registry for short-link resolution across devices
const sharedExamsRegistry = new Map<string, any>();

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Save or sync shared exam package to server
app.post("/api/exams/share", (req, res) => {
  try {
    const { exam, token, tokens } = req.body;
    if (!exam || !exam.id) {
      return res.status(400).json({ success: false, error: "Invalid exam package payload" });
    }
    const cleanCode = (exam.code || "").trim().toUpperCase();
    const cleanId = (exam.id || "").trim();
    
    // Ensure tokens only belong to this exam code
    const rawTokens = Array.isArray(tokens) ? tokens : [];
    const examTokens = rawTokens.filter(
      (t: any) => t && t.examCode && t.examCode.trim().toUpperCase() === cleanCode
    );
    
    // Store by ID and by Code
    const record = {
      exam,
      token,
      tokens: examTokens,
      updatedAt: new Date().toISOString(),
    };
    if (cleanId) sharedExamsRegistry.set(cleanId, record);
    if (cleanCode) sharedExamsRegistry.set(cleanCode, record);

    res.json({ success: true, examId: cleanId, code: cleanCode });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to share exam" });
  }
});

// Retrieve shared exam package by code or ID
app.get("/api/exams/by-code/:code", (req, res) => {
  const code = (req.params.code || "").trim();
  const upperCode = code.toUpperCase();
  const record = sharedExamsRegistry.get(code) || sharedExamsRegistry.get(upperCode);

  if (!record) {
    return res.status(404).json({ success: false, message: `Exam with code '${code}' not found on server.` });
  }

  res.json({ success: true, ...record });
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

    const { response, modelUsed } = await callGeminiWithResilience(ai, {
      preferredModel: "gemini-3.6-flash",
      fallbackModels: ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"],
      contents: "Balas dengan tepat satu kata: Siap.",
      config: {
        systemInstruction: "Anda adalah asisten AI pemeriksa status koneksi.",
      },
      maxRetries: 2,
    });

    const latencyMs = Date.now() - startTime;
    res.json({
      success: true,
      message: `Koneksi ke Google Gemini AI (${modelUsed}) berhasil terhubung!`,
      latencyMs,
      reply: response.text?.trim() || "Siap.",
      modelUsed,
    });
  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    console.error("Gemini test connection failed:", error);
    res.status(400).json({
      success: false,
      error: formatGeminiError(error),
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

    const typeGuide =
      questionType === "menjodohkan"
        ? "Tipe Soal: menjodohkan (berikan minimal 3-4 pasang pernyataan kiri 'left' dan pasangan cocok 'right' pada matchingPairs, serta kunci jawaban). "
        : questionType === "isian_singkat"
        ? "Tipe Soal: isian_singkat (pertanyaan langsung dengan jawaban singkat 1-3 kata pada correctAnswer). "
        : questionType === "uraian"
        ? "Tipe Soal: uraian (pertanyaan esai/analisis mendalam dengan rubrik atau contoh jawaban ideal pada sampleAnswer). "
        : "Tipe Soal: pilihan_ganda (4-5 opsi A, B, C, D, E dengan kunci correctAnswer huruf kapital). ";

    const prompt = `Anda adalah seorang ahli pembuat soal ujian kurikulum merdeka / nasional Indonesia yang sangat berpengalaman.
Buatlah ${count} butir soal ujian dengan ketentuan:
- Mata Pelajaran: ${subject || "Umum"}
- Jenjang / Kelas: ${gradeLevel || "SMP / SMA"}
- Topik / Materi: ${topic || "Umum"}
- Tingkat Kesukaran: ${difficulty} (mudah, sedang, sukar, atau variatif HOTS)
- Tipe Soal Utama: ${questionType}. ${typeGuide}
- Bobot Nilai per Soal: ${defaultScorePerQuestion} poin
- Instruksi Tambahan: ${additionalInstructions || "Sajikan soal berbasis stimulus kontekstual, studi kasus nyata, atau data penalaran"}

Kembalikan format JSON yang valid persis sesuai skema yang diminta.`;

    const { response, modelUsed } = await callGeminiWithResilience(ai, {
      preferredModel: "gemini-3.6-flash",
      fallbackModels: ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"],
      contents: prompt,
      config: {
        systemInstruction:
          "Anda adalah pembuat soal ujian profesional. Berikan soal berkualitas tinggi, stimulus bacaan/kasus relevan, kunci jawaban tepat, dan pembahasan lengkap.",
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
                  stimulus: { type: Type.STRING, description: "Teks stimulus, narasi kasus, atau tabel pendukung" },
                  questionText: { type: Type.STRING, description: "Pertanyaan inti yang jelas dan tegas" },
                  type: { type: Type.STRING, description: "pilihan_ganda | menjodohkan | isian_singkat | uraian" },
                  options: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        key: { type: Type.STRING, description: "A, B, C, D, atau E" },
                        text: { type: Type.STRING, description: "Teks isi pilihan jawaban" },
                      },
                      required: ["key", "text"],
                    },
                    description: "Daftar opsi untuk pilihan ganda",
                  },
                  matchingPairs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        left: { type: Type.STRING, description: "Pernyataan / Item Kiri" },
                        right: { type: Type.STRING, description: "Pasangan Cocok / Item Kanan" },
                      },
                      required: ["left", "right"],
                    },
                    description: "Daftar pasangan untuk tipe soal menjodohkan",
                  },
                  correctAnswer: { type: Type.STRING, description: "Kunci jawaban benar (huruf A-E, kata isian singkat, atau format matching)" },
                  score: { type: Type.NUMBER, description: "Bobot skor nilai butir soal ini" },
                  explanation: { type: Type.STRING, description: "Pembahasan lengkap dan alasan rasional jawaban benar" },
                  sampleAnswer: { type: Type.STRING, description: "Rubrik / contoh jawaban ideal untuk soal uraian" },
                  cognitiveLevel: { type: Type.STRING, description: "Level kognitif: C1, C2, C3, C4, C5, C6 (HOTS)" },
                  topicTag: { type: Type.STRING, description: "Subtopik materi spesifik" },
                },
                required: ["questionText", "correctAnswer", "score", "explanation"],
              },
            },
          },
          required: ["examTitle", "questions"],
        },
      },
    });

    const outputText = response.text || "{}";
    const parsedData = JSON.parse(outputText);

    res.json({ success: true, data: parsedData, modelUsed });
  } catch (error: any) {
    console.error("Error generating questions with Gemini:", error);
    res.status(500).json({
      success: false,
      error: formatGeminiError(error),
    });
  }
});

// AI Question Image Generator Endpoint
app.post("/api/gemini/generate-image", async (req, res) => {
  try {
    const customKey = (req.headers["x-gemini-api-key"] as string) || req.body?.apiKey;
    const { prompt, subject = "Pendidikan", questionContext = "" } = req.body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ success: false, error: "Prompt gambar tidak boleh kosong." });
    }

    const ai = getGeminiClient(customKey);

    // Strategy 1: Try Imagen 3 first if supported
    try {
      const imagenRes = await ai.models.generateImages({
        model: "imagen-3.0-generate-002",
        prompt: `Educational illustration for high school exam question: ${prompt.trim()}. Clear, accurate, educational diagram, vector style, white or dark background, no blurry text, high contrast.`,
        config: {
          numberOfImages: 1,
          outputMimeType: "image/jpeg",
          aspectRatio: "4:3",
        },
      });

      if (imagenRes.generatedImages && imagenRes.generatedImages[0]?.image?.imageBytes) {
        const base64Data = imagenRes.generatedImages[0].image.imageBytes;
        const dataUrl = `data:image/jpeg;base64,${base64Data}`;
        return res.json({
          success: true,
          imageUrl: dataUrl,
          caption: prompt.trim(),
          source: "imagen-3",
        });
      }
    } catch (imagenErr) {
      console.log("Imagen 3 generation unavailable, falling back to SVG diagram generation:", imagenErr);
    }

    // Strategy 2: Generate crisp, clean pedagogical SVG illustration with Gemini Flash
    const svgPrompt = `Anda adalah desainer grafis materi edukasi dan diagram ilmiah profesional.
Buatlah ilustrasi grafis/diagram vektor SVG yang mendidik, jelas, presisi, dan indah berdasarkan prompt berikut:
"${prompt.trim()}"
Konteks Soal / Pelajaran: ${subject}. ${questionContext ? `Konteks: ${questionContext}` : ""}

Ketentuan SVG:
- Output HANYA kode XML <svg>...</svg> murni tanpa markdown, tanpa backtick \`\`\`, tanpa teks lain di luar tag <svg>.
- Gunakan viewBox="0 0 600 400" dengan aspect ratio 3:2 atau 4:3.
- Gunakan skema warna modern, kontras tinggi, elegan (cocok pada background gelap/terang).
- Sertakan label teks yang jelas, panah penunjuk, bentuk geometri / diagram / anatomi yang rapi jika diperlukan.
- Tambahkan background rect bergradasi halus di dalam SVG.`;

    const { response: svgResponse, modelUsed } = await callGeminiWithResilience(ai, {
      preferredModel: "gemini-3.7-flash",
      fallbackModels: ["gemini-flash-latest", "gemini-3.1-flash-lite"],
      contents: svgPrompt,
      config: {
        systemInstruction:
          "Anda hanya menghasilkan kode SVG murni valid yang siap dirender di browser sebagai gambar vektor edukasi.",
      },
    });

    let rawSvg = svgResponse.text?.trim() || "";
    // Clean markdown code fence if model included it
    if (rawSvg.startsWith("```")) {
      rawSvg = rawSvg.replace(/^```(svg|xml)?\s*/i, "").replace(/```\s*$/i, "").trim();
    }

    if (rawSvg.includes("<svg") && rawSvg.includes("</svg>")) {
      const startIdx = rawSvg.indexOf("<svg");
      const endIdx = rawSvg.lastIndexOf("</svg>") + 6;
      const cleanSvg = rawSvg.substring(startIdx, endIdx);
      const encodedSvg = encodeURIComponent(cleanSvg);
      const dataUrl = `data:image/svg+xml;charset=utf-8,${encodedSvg}`;

      return res.json({
        success: true,
        imageUrl: dataUrl,
        caption: prompt.trim(),
        source: `svg_vector_${modelUsed}`,
      });
    }

    throw new Error("Gagal menyusun visual gambar dari prompt yang diberikan.");
  } catch (error: any) {
    console.error("Error generating image:", error);
    res.status(500).json({
      success: false,
      error: formatGeminiError(error),
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

    const { response, modelUsed } = await callGeminiWithResilience(ai, {
      preferredModel: "gemini-3.6-flash",
      fallbackModels: ["gemini-3.7-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"],
      contents: prompt,
      config: {
        systemInstruction: "Anda adalah guru konselor dan evaluator pedagogik yang hangat, memotivasi, dan memberikan saran praktis bagi kemajuan belajar siswa.",
      },
    });

    res.json({ success: true, analysis: response.text, modelUsed });
  } catch (error: any) {
    console.error("Error analyzing student:", error);
    res.status(500).json({ success: false, error: formatGeminiError(error) });
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
