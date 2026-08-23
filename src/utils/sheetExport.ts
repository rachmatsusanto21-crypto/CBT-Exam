import * as XLSX from "xlsx";
import {
  ExamPackage,
  ItemAnalysisSummary,
  SchoolProfile,
  StudentExamSession,
  StudentTokenItem,
  Question,
  QuestionOption,
  QuestionType,
  MatchingPair,
} from "../types";

export const calculateItemAnalysis = (
  exam: ExamPackage,
  sessions: StudentExamSession[]
): ItemAnalysisSummary[] => {
  const completedSessions = sessions.filter((s) => s.examId === exam.id && s.status === "submitted");
  const totalResponses = completedSessions.length;

  return exam.questions.map((q, idx) => {
    let correctCount = 0;
    const distractorCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, Kosong: 0 };

    completedSessions.forEach((s) => {
      const ans = s.answers[q.id];
      const selected = ans?.selectedOption || "Kosong";
      if (distractorCounts[selected] !== undefined) {
        distractorCounts[selected] += 1;
      } else {
        distractorCounts[selected] = 1;
      }

      if (ans?.isCorrect || selected.toUpperCase() === q.correctAnswer.toUpperCase()) {
        correctCount += 1;
      }
    });

    const percentage = totalResponses > 0 ? (correctCount / totalResponses) * 100 : 0;
    const pValue = totalResponses > 0 ? correctCount / totalResponses : 0;

    let difficultyCategory: ItemAnalysisSummary["difficultyCategory"] = "Sedang";
    if (pValue > 0.8) difficultyCategory = "Sangat Mudah";
    else if (pValue > 0.6) difficultyCategory = "Mudah";
    else if (pValue > 0.3) difficultyCategory = "Sedang";
    else if (pValue > 0.15) difficultyCategory = "Sukar";
    else difficultyCategory = "Sangat Sukar";

    // Simple Discrimination Index calculation if responses >= 4 (Upper 50% vs Lower 50%)
    let discriminationIndex = 0;
    if (totalResponses >= 4) {
      const sorted = [...completedSessions].sort((a, b) => b.totalScoreEarned - a.totalScoreEarned);
      const half = Math.floor(sorted.length / 2);
      const upperGroup = sorted.slice(0, half);
      const lowerGroup = sorted.slice(half);

      const upperCorrect = upperGroup.filter((s) => s.answers[q.id]?.isCorrect).length;
      const lowerCorrect = lowerGroup.filter((s) => s.answers[q.id]?.isCorrect).length;

      discriminationIndex = (upperCorrect - lowerCorrect) / half;
    }

    return {
      questionId: q.id,
      questionNumber: idx + 1,
      topicTag: q.topicTag || "Materi Umum",
      cognitiveLevel: q.cognitiveLevel || "C2",
      questionText: q.questionText,
      correctAnswer: q.correctAnswer,
      maxScore: q.score,
      totalResponses,
      correctResponses: correctCount,
      incorrectResponses: totalResponses - correctCount,
      percentageCorrect: Math.round(percentage * 10) / 10,
      difficultyCategory,
      distractorCounts,
      discriminationIndex: Math.round(discriminationIndex * 100) / 100,
    };
  });
};

// Helper to parse cognitive level according to revised Bloom & Anderson taxonomy
export interface BloomAndersonInfo {
  code: "C1" | "C2" | "C3" | "C4" | "C5" | "C6";
  category: "LOTS" | "MOTS" | "HOTS";
  actionVerb: string;
  dimensionName: string;
  knowledgeDimension: "Faktual" | "Konseptual" | "Prosedural" | "Metakognitif";
}

export const getBloomAndersonInfo = (rawLevel?: string): BloomAndersonInfo => {
  const normalized = (rawLevel || "").toUpperCase();
  if (normalized.includes("C6") || normalized.includes("MENCIPTA") || normalized.includes("CREAT")) {
    return {
      code: "C6",
      category: "HOTS",
      actionVerb: "Mencipta / Mengkreasi (Creating)",
      dimensionName: "C6 - Mencipta (HOTS)",
      knowledgeDimension: "Metakognitif",
    };
  }
  if (normalized.includes("C5") || normalized.includes("EVALUASI") || normalized.includes("EVALUAT")) {
    return {
      code: "C5",
      category: "HOTS",
      actionVerb: "Mengevaluasi (Evaluating)",
      dimensionName: "C5 - Mengevaluasi (HOTS)",
      knowledgeDimension: "Konseptual",
    };
  }
  if (normalized.includes("C4") || normalized.includes("ANALIS") || normalized.includes("HOTS")) {
    return {
      code: "C4",
      category: "HOTS",
      actionVerb: "Menganalisis (Analyzing)",
      dimensionName: "C4 - Menganalisis (HOTS)",
      knowledgeDimension: "Konseptual",
    };
  }
  if (normalized.includes("C3") || normalized.includes("TERAP") || normalized.includes("APPLY") || normalized.includes("APLIKASI")) {
    return {
      code: "C3",
      category: "MOTS",
      actionVerb: "Menerapkan / Aplikasi (Applying)",
      dimensionName: "C3 - Menerapkan (MOTS)",
      knowledgeDimension: "Prosedural",
    };
  }
  if (normalized.includes("C1") || normalized.includes("INGAT") || normalized.includes("REMEMBER")) {
    return {
      code: "C1",
      category: "LOTS",
      actionVerb: "Mengingat (Remembering)",
      dimensionName: "C1 - Mengingat (LOTS)",
      knowledgeDimension: "Faktual",
    };
  }
  // Default to C2 - Memahami
  return {
    code: "C2",
    category: "LOTS",
    actionVerb: "Memahami (Understanding)",
    dimensionName: "C2 - Memahami (LOTS)",
    knowledgeDimension: "Konseptual",
  };
};

export const calculateBloomAndersonSummary = (questions: Question[]) => {
  const distribution = {
    C1: 0,
    C2: 0,
    C3: 0,
    C4: 0,
    C5: 0,
    C6: 0,
    LOTS: 0,
    MOTS: 0,
    HOTS: 0,
  };

  questions.forEach((q) => {
    const info = getBloomAndersonInfo(q.cognitiveLevel);
    distribution[info.code] += 1;
    distribution[info.category] += 1;
  });

  const total = questions.length || 1;
  return {
    distribution,
    lotsPercent: Math.round((distribution.LOTS / total) * 100),
    motsPercent: Math.round((distribution.MOTS / total) * 100),
    hotsPercent: Math.round((distribution.HOTS / total) * 100),
  };
};

export const exportExamGradesToExcel = (
  exam: ExamPackage,
  sessions: StudentExamSession[],
  school: SchoolProfile
) => {
  const filtered = sessions.filter((s) => s.examId === exam.id);

  const headerRows = [
    [school.agencyName],
    [school.schoolName],
    [`DAFTAR REKAPITULASI NILAI UJIAN BERBASIS CBT`],
    [`Mata Pelajaran: ${exam.teacherProfile.subject} (${exam.teacherProfile.subjectCode})`],
    [`Kelas / Semester: ${exam.teacherProfile.gradeLevel} / ${exam.teacherProfile.semester}`],
    [`Guru Pengampu: ${exam.teacherProfile.teacherName} (NIP: ${exam.teacherProfile.teacherNIP})`],
    [`KKM / Kriteria Ketuntasan: ${exam.teacherProfile.passingGrade} | Tanggal Export: ${new Date().toLocaleDateString("id-ID")}`],
    [],
    [
      "No",
      "NISN",
      "Nama Siswa",
      "Kelas",
      "Nilai Skor",
      "Skor Maksimal",
      "Nilai Akhir (0-100)",
      "Status Ketuntasan",
      "Jumlah Benar",
      "Jumlah Salah",
      "Waktu Mulai",
      "Waktu Selesai",
      "Durasi (Menit)",
    ],
  ];

  const dataRows = filtered.map((s, idx) => {
    const correctCount = Object.values(s.answers).filter((a) => (a as any).isCorrect).length;
    const totalQ = exam.questions.length;
    const durationMin = Math.round((s.timeSpentSeconds || 0) / 60);

    return [
      idx + 1,
      s.nisn || "-",
      s.studentName,
      s.className,
      s.totalScoreEarned,
      s.maxScore,
      s.percentage,
      s.passed ? "TUNTAS" : "REMEDIAL",
      correctCount,
      totalQ - correctCount,
      s.startTime ? new Date(s.startTime).toLocaleTimeString("id-ID") : "-",
      s.submitTime ? new Date(s.submitTime).toLocaleTimeString("id-ID") : "-",
      durationMin,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rekap Nilai Siswa");

  const fileName = `Rekap_Nilai_${exam.code}_${exam.teacherProfile.subject.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// Bulk Export Full Item Analysis (Analisis Butir Soal Lengkap)
export const exportItemAnalysisToExcel = (
  exam: ExamPackage,
  sessions: StudentExamSession[],
  school: SchoolProfile
) => {
  const filtered = sessions.filter((s) => s.examId === exam.id && s.status === "submitted");
  const analyses = calculateItemAnalysis(exam, sessions);

  // Sheet 1: Analisis Butir Soal (Tingkat Kesukaran & Daya Pembeda)
  const analysisHeaders = [
    [school.agencyName],
    [school.schoolName],
    [`ANALISIS BUTIR SOAL & DAYA PEMBEDA (CBT ITEM ANALYSIS)`],
    [`Judul Ujian: ${exam.title}`],
    [`Mata Pelajaran: ${exam.teacherProfile.subject} | KKM: ${exam.teacherProfile.passingGrade}`],
    [`Total Peserta Ujian Selesai: ${filtered.length} Siswa`],
    [],
    [
      "No Soal",
      "Topik / Materi",
      "Level Kognitif",
      "Kunci",
      "Bobot Skor",
      "Jml Menjawab",
      "Jml Benar",
      "Jml Salah",
      "% Ketuntasan Butir",
      "Tingkat Kesukaran",
      "Daya Pembeda",
      "Pilihan A",
      "Pilihan B",
      "Pilihan C",
      "Pilihan D",
      "Pilihan E",
      "Kosong",
    ],
  ];

  const analysisRows = analyses.map((a) => [
    a.questionNumber,
    a.topicTag,
    a.cognitiveLevel,
    a.correctAnswer,
    a.maxScore,
    a.totalResponses,
    a.correctResponses,
    a.incorrectResponses,
    `${a.percentageCorrect}%`,
    a.difficultyCategory,
    a.discriminationIndex,
    a.distractorCounts["A"] || 0,
    a.distractorCounts["B"] || 0,
    a.distractorCounts["C"] || 0,
    a.distractorCounts["D"] || 0,
    a.distractorCounts["E"] || 0,
    a.distractorCounts["Kosong"] || 0,
  ]);

  // Sheet 2: Matriks Jawaban Siswa (Student Response Matrix)
  const matrixHeadersRow1 = [
    "No",
    "NISN",
    "Nama Siswa",
    "Kelas",
    ...exam.questions.map((q, idx) => `Q${idx + 1} (Kunci: ${q.correctAnswer})`),
    "Total Skor",
    "Nilai (0-100)",
    "Status",
  ];

  const matrixRows = filtered.map((s, sIdx) => {
    const qAnswers = exam.questions.map((q) => {
      const a = s.answers[q.id];
      const opt = a?.selectedOption || "-";
      const isRight = a?.isCorrect ? "✓" : "✗";
      return `${opt} [${isRight}]`;
    });

    return [
      sIdx + 1,
      s.nisn,
      s.studentName,
      s.className,
      ...qAnswers,
      s.totalScoreEarned,
      s.percentage,
      s.passed ? "TUNTAS" : "REMEDIAL",
    ];
  });

  const wb = XLSX.utils.book_new();

  const wsAnalysis = XLSX.utils.aoa_to_sheet([...analysisHeaders, ...analysisRows]);
  XLSX.utils.book_append_sheet(wb, wsAnalysis, "Ringkasan Butir Soal");

  const wsMatrix = XLSX.utils.aoa_to_sheet([
    [`MATRIKS JAWABAN SISWA PER BUTIR SOAL`],
    [`Kode Ujian: ${exam.code} - ${exam.title}`],
    [],
    matrixHeadersRow1,
    ...matrixRows,
  ]);
  XLSX.utils.book_append_sheet(wb, wsMatrix, "Matriks Jawaban Siswa");

  const fileName = `Analisis_Butir_Soal_${exam.code}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

export const exportGradebookToExcel = exportExamGradesToExcel;

// Export Student Tokens to Excel
export const exportTokensToExcel = (
  exam: ExamPackage,
  tokens: StudentTokenItem[],
  school: SchoolProfile
) => {
  const filtered = tokens.filter((t) => t.examCode === exam.code);

  const headerRows = [
    [school.agencyName],
    [school.schoolName],
    [`DAFTAR KARTU LOGIN & TOKEN UJIAN SISWA`],
    [`Mata Pelajaran: ${exam.teacherProfile.subject} | Kode Soal: ${exam.code}`],
    [`Token Sesi Aktif: ${exam.sessionToken} | Durasi: ${exam.durationMinutes} Menit`],
    [],
    ["No", "NISN", "Nama Siswa", "Kelas", "Nomor Kursi", "Kode Soal", "Token Masuk", "Status Pengerjaan"],
  ];

  const dataRows = filtered.map((t, idx) => [
    idx + 1,
    t.nisn,
    t.studentName,
    t.className,
    t.seatNumber || `Meja-${idx + 1}`,
    t.examCode,
    t.token,
    t.status === "selesai" ? "Selesai" : t.status === "sedang_mengerjakan" ? "Sedang Mengerjakan" : "Belum Mulai",
  ]);

  const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataRows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Daftar Token Siswa");

  const fileName = `Daftar_Token_Siswa_${exam.code}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

// Generate HTML for Printable Exam Paper (Kop Surat Sekolah + Formatted Docs Paper + Bloom Anderson Matrix)
export const printFormattedExamDocument = (
  exam: ExamPackage,
  schoolOverride?: SchoolProfile,
  options?: { includeAnswerKey?: boolean; includeMatrix?: boolean }
) => {
  const school = schoolOverride || exam.schoolProfile;
  const teacher = exam.teacherProfile;
  const showKey = options?.includeAnswerKey !== false;
  const showMatrix = options?.includeMatrix !== false;
  const bloomSummary = calculateBloomAndersonSummary(exam.questions);

  const kopSection = school.kopSuratUrl
    ? `<div style="text-align: center; margin-bottom: 12px; border-bottom: 3px double #000; padding-bottom: 8px;">
        <img src="${school.kopSuratUrl}" style="max-width: 100%; max-height: 125px; object-fit: contain;" alt="Kop Surat Resmi Sekolah" />
      </div>`
    : `<div class="kop-wrapper">
        ${school.logoLeftUrl ? `<img src="${school.logoLeftUrl}" class="kop-logo" alt="Logo Kiri" />` : '<div style="width:75px"></div>'}
        <div class="kop-text">
          <div class="kop-agency">${school.agencyName || "PEMERINTAH DAERAH"}</div>
          <div class="kop-school">${school.schoolName || "SEKOLAH"}</div>
          <div class="kop-address">${school.address || ""} ${school.postalCode ? `Kodepos ${school.postalCode}` : ""}</div>
          <div class="kop-contact">Telp: ${school.phone || "-"} | Email: ${school.email || "-"} | Web: ${school.website || "-"}</div>
        </div>
        ${school.logoRightUrl ? `<img src="${school.logoRightUrl}" class="kop-logo" alt="Logo Kanan" />` : '<div style="width:75px"></div>'}
      </div>`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Naskah Soal - ${exam.title}</title>
  <style>
    @page { size: A4; margin: 15mm 20mm; }
    body { font-family: 'Times New Roman', Times, serif; color: #000; line-height: 1.4; margin: 0; padding: 10px; font-size: 12pt; }
    .kop-wrapper { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 12px; }
    .kop-logo { width: 75px; height: 75px; object-fit: contain; }
    .kop-text { text-align: center; flex: 1; padding: 0 10px; }
    .kop-agency { font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 0; }
    .kop-school { font-size: 15pt; font-weight: bold; text-transform: uppercase; margin: 2px 0; }
    .kop-address { font-size: 9pt; margin: 2px 0; }
    .kop-contact { font-size: 9pt; margin: 2px 0; font-style: italic; }
    
    .exam-header-box { border: 1px solid #000; padding: 8px 12px; margin-bottom: 15px; font-size: 10pt; }
    .exam-header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; }
    
    .instructions-box { background-color: #f9f9f9; border: 1px dashed #666; padding: 8px 12px; font-size: 9.5pt; margin-bottom: 16px; }
    .instructions-title { font-weight: bold; margin-bottom: 4px; }
    
    .question-item { margin-bottom: 16px; page-break-inside: avoid; }
    .question-title { display: flex; font-weight: 600; margin-bottom: 4px; }
    .question-num { width: 26px; flex-shrink: 0; }
    .question-body { flex: 1; }
    .stimulus-box { font-style: italic; background-color: #f5f5f5; border-left: 3px solid #333; padding: 4px 8px; margin-bottom: 6px; font-size: 10.5pt; }
    .option-list { list-style: none; padding-left: 26px; margin: 4px 0; }
    .option-item { margin-bottom: 3px; display: flex; align-items: flex-start; }
    .option-key { font-weight: bold; width: 22px; flex-shrink: 0; }
    .option-text { flex: 1; }
    .matching-table-print { width: 90%; border-collapse: collapse; margin: 6px 0 6px 26px; font-size: 10pt; }
    .matching-table-print th, .matching-table-print td { border: 1px solid #333; padding: 4px 8px; text-align: left; }
    .matching-table-print th { background-color: #f0f0f0; font-weight: bold; }
    .correct-highlight { background-color: #e6ffed; border: 1px solid #38a169; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-top: 4px; margin-left: 26px; font-size: 10pt; }
    .explanation-box { background-color: #ebf8ff; border: 1px solid #3182ce; padding: 4px 8px; font-size: 9.5pt; margin-top: 4px; margin-left: 26px; }
    
    /* Kisi-Kisi Bloom Anderson Matrix Table */
    .page-break { page-break-before: always; }
    .matrix-title { text-align: center; font-size: 13pt; font-weight: bold; text-transform: uppercase; margin-bottom: 12px; text-decoration: underline; }
    .matrix-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 9.5pt; }
    .matrix-table th, .matrix-table td { border: 1px solid #000; padding: 4px 6px; text-align: left; vertical-align: middle; }
    .matrix-table th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
    .text-center { text-align: center; }
    .badge-hots { background-color: #fee2e2; color: #991b1b; padding: 1px 4px; font-weight: bold; border-radius: 3px; font-size: 8.5pt; }
    .badge-mots { background-color: #fef3c7; color: #92400e; padding: 1px 4px; font-weight: bold; border-radius: 3px; font-size: 8.5pt; }
    .badge-lots { background-color: #e0e7ff; color: #3730a3; padding: 1px 4px; font-weight: bold; border-radius: 3px; font-size: 8.5pt; }

    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  ${kopSection}

  <div class="exam-header-box">
    <div style="text-align: center; font-weight: bold; font-size: 12pt; text-transform: uppercase; margin-bottom: 6px;">
      ${exam.title}
    </div>
    <div class="exam-header-grid">
      <div><strong>Mata Pelajaran:</strong> ${teacher.subject} (${teacher.subjectCode || "-"})</div>
      <div><strong>Hari / Tanggal:</strong> ${new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      <div><strong>Kelas / Jenjang:</strong> ${teacher.gradeLevel} (Semester ${teacher.semester})</div>
      <div><strong>Waktu / Durasi:</strong> ${exam.durationMinutes} Menit</div>
      <div><strong>Guru Pengampu:</strong> ${teacher.teacherName} (NIP: ${teacher.teacherNIP || "-"})</div>
      <div><strong>Kode Naskah:</strong> ${exam.code}</div>
    </div>
  </div>

  <div class="instructions-box">
    <div class="instructions-title">PETUNJUK UMUM PENGERJAAN SOAL:</div>
    <ol style="margin: 0; padding-left: 18px;">
      <li>Periksalah kelengkapan butir soal (${exam.questions.length} butir) sebelum mulai mengerjakan.</li>
      <li>Tuliskan identitas Anda dengan jelas dan teliti pada lembar jawaban.</li>
      <li>Pilihlah salah satu jawaban yang paling tepat atau kerjakan sesuai instruksi pada setiap butir soal.</li>
      <li>Dahulukan menjawab soal-soal yang Anda anggap mudah.</li>
    </ol>
  </div>

  <div class="questions-container">
    ${exam.questions
      .map(
        (q, idx) => {
          const bloom = getBloomAndersonInfo(q.cognitiveLevel);
          let optionsHtml = "";

          if (q.type === "pilihan_ganda" || q.type === "benar_salah") {
            optionsHtml = `
              <div class="option-list">
                ${q.options
                  .map(
                    (opt) => `
                  <div class="option-item">
                    <span class="option-key">${opt.key}.</span>
                    <span class="option-text">${opt.text}</span>
                  </div>
                `
                  )
                  .join("")}
              </div>
            `;
          } else if (q.type === "menjodohkan" && q.matchingPairs && q.matchingPairs.length > 0) {
            optionsHtml = `
              <table class="matching-table-print">
                <thead>
                  <tr>
                    <th style="width:50%;">Pernyataan / Item Kiri</th>
                    <th style="width:50%;">Pasangan Cocok / Item Kanan</th>
                  </tr>
                </thead>
                <tbody>
                  ${q.matchingPairs.map(p => `<tr><td>${p.left}</td><td>${p.right}</td></tr>`).join("")}
                </tbody>
              </table>
            `;
          } else if (q.type === "isian_singkat") {
            optionsHtml = `<div style="margin-left:26px; color:#666; font-style:italic;">[ Lembar Jawaban Isian: ........................................................................................ ]</div>`;
          } else if (q.type === "uraian") {
            optionsHtml = `<div style="margin-left:26px; color:#666; font-style:italic;">[ Lembar Jawaban Uraian: ................................................................................................................................. ]</div>`;
          }

          return `
            <div class="question-item">
              <div class="question-title">
                <span class="question-num">${idx + 1}.</span>
                <div class="question-body">
                  ${q.stimulus ? `<div class="stimulus-box">${q.stimulus.replace(/\n/g, "<br>")}</div>` : ""}
                  <div>${q.questionText}</div>
                </div>
              </div>
              ${optionsHtml}
              ${
                showKey
                  ? `
                <div class="correct-highlight">
                  Kunci Jawaban: <strong>${q.correctAnswer}</strong> | Bobot: ${q.score} poin | Level: ${bloom.dimensionName} (${bloom.knowledgeDimension})
                </div>
                ${q.explanation ? `<div class="explanation-box"><strong>Pembahasan:</strong> ${q.explanation}</div>` : ""}
                ${q.sampleAnswer ? `<div class="explanation-box"><strong>Rubrik Penilaian:</strong> ${q.sampleAnswer}</div>` : ""}
              `
                  : ""
              }
            </div>
          `;
        }
      )
      .join("")}
  </div>

  <div style="margin-top: 30px; display: flex; justify-content: flex-end;">
    <div style="text-align: center; width: 220px;">
      <div>Mengetahui,</div>
      <div>Kepala Sekolah</div>
      <div style="height: 50px;"></div>
      <div style="font-weight: bold; text-decoration: underline;">${school.principalName || "Kepala Sekolah"}</div>
      <div>NIP. ${school.principalNIP || "-"}</div>
    </div>
  </div>

  ${
    showMatrix
      ? `
    <!-- HALAMAN KISI-KISI MATRIKS TAKSONOMI BLOOM & ANDERSON -->
    <div class="page-break"></div>
    ${kopSection}

    <div class="matrix-title">KISI-KISI BUTIR SOAL & MATRIKS LEVEL KOGNITIF (BLOOM & ANDERSON)</div>
    
    <div style="font-size: 10pt; margin-bottom: 10px; display: flex; justify-content: space-between; border: 1px solid #ccc; padding: 6px 10px; background: #fafafa;">
      <div><strong>Mata Pelajaran:</strong> ${teacher.subject} | <strong>Kelas:</strong> ${teacher.gradeLevel}</div>
      <div><strong>Distribusi:</strong> HOTS (${bloomSummary.hotsPercent}%) | MOTS (${bloomSummary.motsPercent}%) | LOTS (${bloomSummary.lotsPercent}%)</div>
    </div>

    <table class="matrix-table">
      <thead>
        <tr>
          <th style="width: 5%;">No</th>
          <th style="width: 25%;">Materi / Indikator Pokok</th>
          <th style="width: 14%;">Bentuk Soal</th>
          <th style="width: 20%;">Dimensi Proses Kognitif (Bloom & Anderson)</th>
          <th style="width: 16%;">Dimensi Pengetahuan</th>
          <th style="width: 10%;">Kunci</th>
          <th style="width: 10%;">Skor</th>
        </tr>
      </thead>
      <tbody>
        ${exam.questions
          .map((q, idx) => {
            const bloom = getBloomAndersonInfo(q.cognitiveLevel);
            let badgeClass = "badge-lots";
            if (bloom.category === "HOTS") badgeClass = "badge-hots";
            else if (bloom.category === "MOTS") badgeClass = "badge-mots";

            let formName = "Pilihan Ganda";
            if (q.type === "isian_singkat") formName = "Isian Singkat";
            else if (q.type === "uraian") formName = "Uraian / Essay";
            else if (q.type === "menjodohkan") formName = "Menjodohkan";
            else if (q.type === "benar_salah") formName = "Benar / Salah";

            return `
              <tr>
                <td class="text-center font-bold">${idx + 1}</td>
                <td>${q.topicTag || "Materi Umum"}</td>
                <td>${formName}</td>
                <td>
                  <span class="${badgeClass}">${bloom.code}</span>
                  <strong>${bloom.actionVerb}</strong>
                </td>
                <td>${bloom.knowledgeDimension}</td>
                <td class="text-center font-bold">${q.correctAnswer}</td>
                <td class="text-center font-bold">${q.score}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>

    <div style="margin-top: 30px; display: flex; justify-content: space-between; font-size: 10pt;">
      <div style="text-align: center; width: 220px;">
        <div>Mengetahui,</div>
        <div>Kepala Sekolah</div>
        <div style="height: 50px;"></div>
        <div style="font-weight: bold; text-decoration: underline;">${school.principalName || "Kepala Sekolah"}</div>
        <div>NIP. ${school.principalNIP || "-"}</div>
      </div>
      <div style="text-align: center; width: 220px;">
        <div>Dibuat oleh,</div>
        <div>Guru Mata Pelajaran</div>
        <div style="height: 50px;"></div>
        <div style="font-weight: bold; text-decoration: underline;">${teacher.teacherName || "Guru Pengampu"}</div>
        <div>NIP. ${teacher.teacherNIP || "-"}</div>
      </div>
    </div>
  `
      : ""
  }
</body>
</html>
`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
};

export const printExamToDocsFormat = printFormattedExamDocument;

// Print Student Token Cards for Exam Distribution
export const printTokenCards = (
  exam: ExamPackage,
  tokens: StudentTokenItem[],
  school: SchoolProfile
) => {
  const filtered = tokens.filter((t) => t.examCode === exam.code);

  const htmlContent = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Kartu Login Ujian - ${exam.title}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    body { font-family: Arial, sans-serif; margin: 0; padding: 10px; color: #111; font-size: 10pt; }
    .grid-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .card { border: 2px solid #222; border-radius: 8px; padding: 12px; page-break-inside: avoid; background-color: #fafafa; }
    .card-header { display: flex; align-items: center; border-bottom: 1.5px solid #222; padding-bottom: 6px; margin-bottom: 8px; gap: 8px; }
    .logo { width: 35px; height: 35px; object-fit: contain; }
    .header-text { flex: 1; text-align: center; }
    .school-name { font-size: 10pt; font-weight: bold; text-transform: uppercase; }
    .card-title { font-size: 8pt; color: #444; }
    .row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 9pt; }
    .label { color: #555; }
    .val { font-weight: bold; }
    .token-box { margin-top: 8px; border: 1.5px dashed #4338ca; background-color: #eef2ff; padding: 6px; text-align: center; border-radius: 6px; }
    .token-label { font-size: 8pt; color: #4338ca; font-weight: bold; text-transform: uppercase; }
    .token-val { font-size: 14pt; font-weight: 900; font-family: monospace; letter-spacing: 2px; color: #312e81; }
  </style>
</head>
<body>
  <div class="grid-container">
    ${filtered
      .map(
        (t, idx) => `
      <div class="card">
        <div class="card-header">
          ${school.logoLeftUrl ? `<img src="${school.logoLeftUrl}" class="logo" alt="Logo" />` : ""}
          <div class="header-text">
            <div class="school-name">${school.schoolName}</div>
            <div class="card-title">KARTU PESERTA UJIAN CBT</div>
          </div>
          ${school.logoRightUrl ? `<img src="${school.logoRightUrl}" class="logo" alt="Logo" />` : ""}
        </div>
        <div class="row"><span class="label">Nama Siswa:</span><span class="val">${t.studentName}</span></div>
        <div class="row"><span class="label">NISN / No. Induk:</span><span class="val">${t.nisn}</span></div>
        <div class="row"><span class="label">Kelas:</span><span class="val">${t.className}</span></div>
        <div class="row"><span class="label">Mata Pelajaran:</span><span class="val">${exam.teacherProfile.subject}</span></div>
        <div class="row"><span class="label">Kode Soal:</span><span class="val font-mono">${t.examCode}</span></div>
        <div class="token-box">
          <div class="token-label">TOKEN LOGIN SISWA</div>
          <div class="token-val">${t.token}</div>
        </div>
      </div>
    `
      )
      .join("")}
  </div>
</body>
</html>
`;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
};

// ==========================================
// EXAM QUESTIONS IMPORT & EXPORT (SHEETS & DOCS)
// ==========================================

/**
 * Export Exam Questions to Excel / Spreadsheet (.xlsx)
 */
export const exportQuestionsToExcel = (
  exam: ExamPackage,
  school: SchoolProfile
) => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Daftar Soal Lengkap
  const headers = [
    "No",
    "Tipe Soal",
    "Teks Soal / Pertanyaan",
    "Stimulus / Bacaan",
    "Pilihan A",
    "Pilihan B",
    "Pilihan C",
    "Pilihan D",
    "Pilihan E",
    "Pasangan Menjodohkan (Kiri -> Kanan)",
    "Kunci Jawaban",
    "Bobot Skor",
    "Level Kognitif",
    "Topik / Materi",
    "Pembahasan / Rubrik",
  ];

  const rows = exam.questions.map((q, idx) => {
    const optA = q.options.find((o) => o.key.toUpperCase() === "A")?.text || "";
    const optB = q.options.find((o) => o.key.toUpperCase() === "B")?.text || "";
    const optC = q.options.find((o) => o.key.toUpperCase() === "C")?.text || "";
    const optD = q.options.find((o) => o.key.toUpperCase() === "D")?.text || "";
    const optE = q.options.find((o) => o.key.toUpperCase() === "E")?.text || "";

    const matchingStr = q.matchingPairs && q.matchingPairs.length > 0
      ? q.matchingPairs.map((p) => `${p.left} -> ${p.right}`).join(" | ")
      : "";

    let tipeIndo = "Pilihan Ganda";
    if (q.type === "isian_singkat") tipeIndo = "Isian Singkat";
    else if (q.type === "uraian") tipeIndo = "Uraian / Essay";
    else if (q.type === "menjodohkan") tipeIndo = "Menjodohkan";
    else if (q.type === "benar_salah") tipeIndo = "Benar / Salah";

    return [
      idx + 1,
      tipeIndo,
      q.questionText,
      q.stimulus || "",
      optA,
      optB,
      optC,
      optD,
      optE,
      matchingStr,
      q.correctAnswer,
      q.score || 10,
      q.cognitiveLevel || "C3",
      q.topicTag || "Materi Umum",
      q.explanation || q.sampleAnswer || "",
    ];
  });

  const wsQuestions = XLSX.utils.aoa_to_sheet([
    [school.agencyName || "PEMERINTAH DAERAH / DINAS PENDIDIKAN"],
    [school.schoolName || "SMART CBT ASSESSMENT"],
    [`BANK SOAL UJIAN: ${exam.title} (${exam.code})`],
    [`Mata Pelajaran: ${exam.teacherProfile.subject} | Kelas: ${exam.teacherProfile.gradeLevel} | Total: ${exam.questions.length} Butir Soal`],
    [],
    headers,
    ...rows,
  ]);

  // Set column widths
  wsQuestions["!cols"] = [
    { wch: 6 },  // No
    { wch: 16 }, // Tipe
    { wch: 45 }, // Teks Soal
    { wch: 25 }, // Stimulus
    { wch: 22 }, // Opt A
    { wch: 22 }, // Opt B
    { wch: 22 }, // Opt C
    { wch: 22 }, // Opt D
    { wch: 22 }, // Opt E
    { wch: 30 }, // Matching
    { wch: 14 }, // Kunci
    { wch: 10 }, // Skor
    { wch: 14 }, // Level
    { wch: 20 }, // Topik
    { wch: 35 }, // Pembahasan
  ];

  XLSX.utils.book_append_sheet(wb, wsQuestions, "Daftar Soal");

  // Sheet 2: Kisi-Kisi & Distribusi
  const kisiKisiHeaders = [
    "No Soal",
    "Materi / Topik",
    "Bentuk Soal",
    "Level Kognitif",
    "Kunci Jawaban",
    "Bobot Skor",
  ];
  const kisiKisiRows = exam.questions.map((q, idx) => [
    idx + 1,
    q.topicTag || "Umum",
    q.type === "pilihan_ganda" ? "Pilihan Ganda" : q.type === "isian_singkat" ? "Isian Singkat" : q.type === "uraian" ? "Uraian" : "Menjodohkan",
    q.cognitiveLevel || "C3",
    q.correctAnswer,
    q.score,
  ]);

  const wsKisi = XLSX.utils.aoa_to_sheet([
    [`KISI-KISI BUTIR SOAL & KUNCI JAWABAN`],
    [`Mata Pelajaran: ${exam.teacherProfile.subject} | Guru: ${exam.teacherProfile.teacherName}`],
    [],
    kisiKisiHeaders,
    ...kisiKisiRows,
  ]);
  wsKisi["!cols"] = [{ wch: 10 }, { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 15 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsKisi, "Kisi-Kisi & Kunci");

  // Sheet 3: Petunjuk & Template Pengisian
  const petunjukRows = [
    ["PETUNJUK FORMAT PENGISIAN SOAL UNTUK IMPORT EXCEL / SPREADSHEET"],
    [],
    ["1. Tipe Soal yang Didukung:", "Pilihan Ganda, Isian Singkat, Uraian, Menjodohkan"],
    ["2. Pilihan Ganda:", "Isi kolom Pilihan A s/d E, dan masukkan huruf kunci pada kolom Kunci Jawaban (misal: A / B / C / D / E)"],
    ["3. Isian Singkat:", "Isi kolom Teks Soal dan Kunci Jawaban (kata/frasa jawaban singkat)"],
    ["4. Uraian / Essay:", "Isi kolom Teks Soal, Kunci Jawaban/Rubrik, dan Pembahasan/Pedoman Penilaian"],
    ["5. Menjodohkan:", "Isi kolom 'Pasangan Menjodohkan' dengan format: Item Kiri 1 -> Item Kanan 1 | Item Kiri 2 -> Item Kanan 2"],
    ["6. Bobot Skor:", "Masukkan angka bobot nilai (contoh: 10, 20, 25)"],
    ["7. Level Kognitif:", "Contoh: C1, C2, C3, C4 (HOTS), C5, C6"],
    [],
    ["Gunakan file ini sebagai arsip naskah ujian atau edit lalu impor kembali ke sistem Smart CBT."],
  ];
  const wsPetunjuk = XLSX.utils.aoa_to_sheet(petunjukRows);
  XLSX.utils.book_append_sheet(wb, wsPetunjuk, "Petunjuk Format");

  const cleanSubject = exam.teacherProfile.subject.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Naskah_Soal_${cleanSubject}_${exam.code}.xlsx`;
  XLSX.writeFile(wb, fileName);
};

/**
 * Export Exam Questions to Microsoft Word / Google Docs formatted document (.doc)
 */
export const exportQuestionsToWordDoc = (
  exam: ExamPackage,
  school: SchoolProfile,
  showAnswerKey: boolean = true,
  includeMatrix: boolean = true
) => {
  const cleanSubject = exam.teacherProfile.subject.replace(/[^a-zA-Z0-9]/g, "_");
  const fileName = `Naskah_Soal_${cleanSubject}_${exam.code}.doc`;
  const bloomSummary = calculateBloomAndersonSummary(exam.questions);

  const kopHtml = school.kopSuratUrl
    ? `<div style="text-align:center; margin-bottom:15px;"><img src="${school.kopSuratUrl}" style="max-width:100%; height:auto; max-height:120px;" alt="Kop Surat" /></div>`
    : `
      <table style="width:100%; border-bottom:3px double #000; padding-bottom:10px; margin-bottom:15px; font-family:'Times New Roman', serif;">
        <tr>
          ${school.logoLeftUrl ? `<td style="width:75px; text-align:center; vertical-align:middle;"><img src="${school.logoLeftUrl}" style="width:65px; height:65px; object-fit:contain;" alt="Logo" /></td>` : ""}
          <td style="text-align:center; vertical-align:middle;">
            <div style="font-size:12pt; font-weight:bold; text-transform:uppercase;">${school.agencyName || "PEMERINTAH DAERAH"}</div>
            <div style="font-size:14pt; font-weight:bold; text-transform:uppercase;">${school.schoolName || "SMART CBT ASSESSMENT"}</div>
            <div style="font-size:9pt; color:#333;">${school.address || "Alamat Sekolah"} | Telp: ${school.phone || "-"} | Email: ${school.email || "-"}</div>
          </td>
          ${school.logoRightUrl ? `<td style="width:75px; text-align:center; vertical-align:middle;"><img src="${school.logoRightUrl}" style="width:65px; height:65px; object-fit:contain;" alt="Logo" /></td>` : ""}
        </tr>
      </table>
    `;

  const contentHtml = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>${exam.title}</title>
      <style>
        @page { size: A4; margin: 2cm 2cm 2cm 2cm; mso-page-orientation: portrait; }
        body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.3; color: #000; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11pt; }
        .meta-table td { padding: 3px 6px; }
        .meta-label { font-weight: bold; width: 22%; }
        .meta-val { width: 28%; }
        .section-title { text-align: center; font-size: 13pt; font-weight: bold; text-decoration: underline; margin-bottom: 15px; text-transform: uppercase; }
        .question-item { margin-bottom: 18px; page-break-inside: avoid; }
        .question-header { font-weight: bold; margin-bottom: 4px; }
        .stimulus-box { background-color: #f4f4f4; border-left: 3px solid #666; padding: 6px 10px; margin-bottom: 8px; font-size: 11pt; font-style: italic; }
        .options-table { width: 100%; border-collapse: collapse; margin-left: 15px; margin-top: 4px; }
        .options-table td { padding: 2px 4px; font-size: 11pt; vertical-align: top; }
        .opt-key { width: 25px; font-weight: bold; }
        .matching-table { width: 90%; border-collapse: collapse; margin: 8px auto; }
        .matching-table th, .matching-table td { border: 1px solid #444; padding: 6px 10px; font-size: 10.5pt; text-align: left; }
        .matching-table th { background-color: #eee; }
        .key-box { background-color: #eef2ff; border: 1px solid #818cf8; padding: 6px 10px; margin-top: 6px; font-size: 10.5pt; color: #1e1b4b; border-radius: 4px; }
        .explanation-box { background-color: #f8fafc; border: 1px dashed #94a3b8; padding: 6px 10px; margin-top: 4px; font-size: 10pt; color: #334155; }
        .matrix-table-doc { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 20px; font-size: 10pt; }
        .matrix-table-doc th, .matrix-table-doc td { border: 1px solid #333; padding: 5px 8px; }
        .matrix-table-doc th { background-color: #f0f0f0; text-align: center; font-weight: bold; }
        .sign-table { width: 100%; margin-top: 40px; border-collapse: collapse; }
        .sign-table td { text-align: center; vertical-align: top; width: 50%; font-size: 11pt; }
        .badge-tag { font-weight: bold; padding: 1px 4px; }
      </style>
    </head>
    <body>
      ${kopHtml}

      <div class="section-title">NASKAH SOAL UJIAN BERBASIS KOMPUTER (CBT)</div>

      <table class="meta-table">
        <tr>
          <td class="meta-label">Mata Pelajaran</td>
          <td class="meta-val">: ${exam.teacherProfile.subject}</td>
          <td class="meta-label">Kelas / Semester</td>
          <td class="meta-val">: ${exam.teacherProfile.gradeLevel} / ${exam.teacherProfile.semester}</td>
        </tr>
        <tr>
          <td class="meta-label">Kode Naskah Soal</td>
          <td class="meta-val">: <strong>${exam.code}</strong></td>
          <td class="meta-label">Alokasi Waktu</td>
          <td class="meta-val">: ${exam.teacherProfile.durationMinutes} Menit</td>
        </tr>
        <tr>
          <td class="meta-label">Guru Pengampu</td>
          <td class="meta-val">: ${exam.teacherProfile.teacherName}</td>
          <td class="meta-label">KKM / Kriteria</td>
          <td class="meta-val">: ${exam.teacherProfile.passingGrade}</td>
        </tr>
      </table>

      <hr style="border: 0; border-top: 1px solid #000; margin-bottom: 20px;" />

      <div style="font-weight: bold; margin-bottom: 12px; font-size: 11pt;">
        PETUNJUK: Pilihlah satu jawaban yang paling tepat atau kerjakan sesuai instruksi pada setiap butir soal berikut!
      </div>

      <!-- QUESTIONS LIST -->
      ${exam.questions
        .map((q, idx) => {
          const bloom = getBloomAndersonInfo(q.cognitiveLevel);
          let optionsContent = "";

          if (q.type === "pilihan_ganda" || q.type === "benar_salah") {
            optionsContent = `
              <table class="options-table">
                ${q.options
                  .map(
                    (opt) => `
                  <tr>
                    <td class="opt-key">${opt.key}.</td>
                    <td>${opt.text}</td>
                  </tr>
                `
                  )
                  .join("")}
              </table>
            `;
          } else if (q.type === "menjodohkan" && q.matchingPairs && q.matchingPairs.length > 0) {
            optionsContent = `
              <table class="matching-table">
                <thead>
                  <tr>
                    <th style="width: 50%;">Pernyataan / Item Kiri</th>
                    <th style="width: 50%;">Pasangan Cocok / Item Kanan</th>
                  </tr>
                </thead>
                <tbody>
                  ${q.matchingPairs
                    .map(
                      (p) => `
                    <tr>
                      <td>${p.left}</td>
                      <td>${p.right}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </tbody>
              </table>
            `;
          } else if (q.type === "isian_singkat") {
            optionsContent = `<div style="margin-left: 20px; color: #555; font-style: italic;">[ Lembar Jawaban Isian Singkat: .......................................................................... ]</div>`;
          } else if (q.type === "uraian") {
            optionsContent = `<div style="margin-left: 20px; color: #555; font-style: italic;">[ Lembar Jawaban Uraian / Essay: ................................................................................................................. ]</div>`;
          }

          return `
            <div class="question-item">
              <div class="question-header">
                ${idx + 1}. ${q.questionText}
                <span style="font-weight: normal; font-size: 10pt; color: #444;">(Bobot: ${q.score} Poin | Level: ${bloom.dimensionName})</span>
              </div>

              ${q.stimulus ? `<div class="stimulus-box">${q.stimulus.replace(/\n/g, "<br>")}</div>` : ""}

              ${optionsContent}

              ${
                showAnswerKey
                  ? `
                <div class="key-box">
                  <strong>Kunci Jawaban:</strong> ${q.correctAnswer} 
                  ${q.topicTag ? ` | <em>Materi: ${q.topicTag}</em>` : ""}
                  | <em>Dimensi: ${bloom.knowledgeDimension}</em>
                </div>
                ${q.explanation ? `<div class="explanation-box"><strong>Pembahasan:</strong> ${q.explanation}</div>` : ""}
                ${q.sampleAnswer ? `<div class="explanation-box"><strong>Rubrik Jawaban:</strong> ${q.sampleAnswer}</div>` : ""}
              `
                  : ""
              }
            </div>
          `;
        })
        .join("")}

      <!-- SIGNATURE SECTION -->
      <table class="sign-table">
        <tr>
          <td>
            Mengetahui,<br>
            Kepala Sekolah<br><br><br><br>
            <strong>${school.principalName || "Kepala Sekolah"}</strong><br>
            NIP. ${school.principalNIP || "-"}
          </td>
          <td>
            Guru Mata Pelajaran,<br><br><br><br>
            <strong>${exam.teacherProfile.teacherName || "Guru Pengampu"}</strong><br>
            NIP. ${exam.teacherProfile.teacherNIP || "-"}
          </td>
        </tr>
      </table>

      ${
        includeMatrix
          ? `
        <!-- HALAMAN KISI-KISI BLOOM & ANDERSON -->
        <br style="page-break-before:always;" />
        ${kopHtml}

        <div class="section-title">KISI-KISI NASKAH SOAL & MATRIKS LEVEL KOGNITIF REVISI BLOOM & ANDERSON</div>

        <table class="meta-table">
          <tr>
            <td class="meta-label">Mata Pelajaran</td>
            <td class="meta-val">: ${exam.teacherProfile.subject}</td>
            <td class="meta-label">Distribusi Kognitif</td>
            <td class="meta-val">: HOTS ${bloomSummary.hotsPercent}% | MOTS ${bloomSummary.motsPercent}% | LOTS ${bloomSummary.lotsPercent}%</td>
          </tr>
          <tr>
            <td class="meta-label">Total Butir Soal</td>
            <td class="meta-val">: ${exam.questions.length} Butir</td>
            <td class="meta-label">Total Skor Maksimum</td>
            <td class="meta-val">: ${exam.totalScore} Poin</td>
          </tr>
        </table>

        <table class="matrix-table-doc">
          <thead>
            <tr>
              <th style="width: 5%;">No</th>
              <th style="width: 25%;">Materi Pokok / Indikator</th>
              <th style="width: 15%;">Bentuk Soal</th>
              <th style="width: 25%;">Level Kognitif (Bloom-Anderson)</th>
              <th style="width: 15%;">Dimensi Pengetahuan</th>
              <th style="width: 8%;">Kunci</th>
              <th style="width: 7%;">Skor</th>
            </tr>
          </thead>
          <tbody>
            ${exam.questions
              .map((q, idx) => {
                const bloom = getBloomAndersonInfo(q.cognitiveLevel);
                let formName = "Pilihan Ganda";
                if (q.type === "isian_singkat") formName = "Isian Singkat";
                else if (q.type === "uraian") formName = "Uraian";
                else if (q.type === "menjodohkan") formName = "Menjodohkan";
                else if (q.type === "benar_salah") formName = "Benar/Salah";

                return `
                  <tr>
                    <td style="text-align:center; font-weight:bold;">${idx + 1}</td>
                    <td>${q.topicTag || "Materi Pokok"}</td>
                    <td>${formName}</td>
                    <td><strong>${bloom.code}</strong> - ${bloom.actionVerb} (${bloom.category})</td>
                    <td>${bloom.knowledgeDimension}</td>
                    <td style="text-align:center; font-weight:bold;">${q.correctAnswer}</td>
                    <td style="text-align:center;">${q.score}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>

        <table class="sign-table">
          <tr>
            <td>
              Mengetahui,<br>
              Kepala Sekolah<br><br><br><br>
              <strong>${school.principalName || "Kepala Sekolah"}</strong><br>
              NIP. ${school.principalNIP || "-"}
            </td>
            <td>
              Guru Mata Pelajaran,<br><br><br><br>
              <strong>${exam.teacherProfile.teacherName || "Guru Pengampu"}</strong><br>
              NIP. ${exam.teacherProfile.teacherNIP || "-"}
            </td>
          </tr>
        </table>
      `
          : ""
      }
    </body>
    </html>
  `;

  // Create downloadable .doc Blob
  const blob = new Blob(["\ufeff", contentHtml], {
    type: "application/msword;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = fileName;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(url);
};

/**
 * Download standard Excel Template for question importing
 */
export const downloadExcelQuestionTemplate = () => {
  const wb = XLSX.utils.book_new();

  const headers = [
    "No",
    "Tipe Soal",
    "Teks Soal / Pertanyaan",
    "Stimulus / Bacaan",
    "Pilihan A",
    "Pilihan B",
    "Pilihan C",
    "Pilihan D",
    "Pilihan E",
    "Pasangan Menjodohkan (Kiri -> Kanan)",
    "Kunci Jawaban",
    "Bobot Skor",
    "Level Kognitif",
    "Topik / Materi",
    "Pembahasan / Rubrik",
  ];

  const sampleRows = [
    [
      1,
      "Pilihan Ganda",
      "Manakah dari berikut ini yang merupakan komponen utama dalam arsitektur komputer Von Neumann?",
      "Arsitektur komputer modern dirancang dengan pemisahan unit pemrosesan dan memori penyimpanan data.",
      "CPU, Memori Utama, dan Unit I/O",
      "Keyboard, Mouse, dan Monitor",
      "Browser, Compiler, dan Database",
      "Power Supply dan Heat Sink saja",
      "Kabel LAN dan Router",
      "",
      "A",
      20,
      "C2",
      "Arsitektur Komputer",
      "Arsitektur Von Neumann terdiri dari CPU (ALU & Control Unit), Memori Utama, dan Piranti I/O.",
    ],
    [
      2,
      "Pilihan Ganda",
      "Dalam konsep Berpikir Komputasional, proses memecah masalah kompleks menjadi bagian-bagian yang lebih kecil dan mudah dikelola disebut...",
      "",
      "Abstraksi",
      "Dekomposisi",
      "Pengenalan Pola",
      "Algoritma",
      "Evaluasi",
      "",
      "B",
      20,
      "C3",
      "Berpikir Komputasional",
      "Dekomposisi adalah teknik memecah masalah besar menjadi sub-masalah yang lebih sederhana.",
    ],
    [
      3,
      "Isian Singkat",
      "Protokol jaringan internet yang berfungsi mengamankan transmisi data melalui enkripsi SSL/TLS pada web browser adalah...",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "HTTPS",
      20,
      "C2",
      "Jaringan & Internet",
      "HTTPS (Hypertext Transfer Protocol Secure) mengenkripsi lalu lintas web menggunakan sertifikat TLS/SSL.",
    ],
    [
      4,
      "Menjodohkan",
      "Jodohkan istilah komputasi awan berikut dengan definisi fungsi yang paling tepat!",
      "",
      "",
      "",
      "",
      "",
      "",
      "IaaS -> Penyediaan infrastruktur server virtual dan penyimpanan | PaaS -> Lingkungan siap pakai untuk deploy aplikasi developer | SaaS -> Layanan perangkat lunak siap pakai langsung oleh pengguna",
      "IaaS -> Infrastruktur | PaaS -> Platform | SaaS -> Software",
      20,
      "C4 (HOTS)",
      "Cloud Computing",
      "IaaS = Infrastructure as a Service, PaaS = Platform as a Service, SaaS = Software as a Service.",
    ],
    [
      5,
      "Uraian",
      "Jelaskan perbedaan mendasar antara enkripsi simetris dan enkripsi asimetris dalam keamanan sistem informasi!",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Rubrik: Skor 20 jika menjelaskan perbedaan kunci (1 kunci vs sepasang kunci privat/publik) dan contoh penggunaannya.",
      20,
      "C4 (HOTS)",
      "Keamanan Informasi",
      "Enkripsi simetris menggunakan 1 kunci yang sama untuk enkripsi & dekripsi, sedangkan asimetris menggunakan sepasang kunci (public key & private key).",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([
    ["TEMPLATE IMPORT SOAL - SMART CBT EXAM"],
    ["Petunjuk: Isi baris soal di bawah ini. Anda dapat menambahkan baris baru sesuai jumlah soal."],
    [],
    headers,
    ...sampleRows,
  ]);

  ws["!cols"] = [
    { wch: 6 },
    { wch: 16 },
    { wch: 45 },
    { wch: 25 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 30 },
    { wch: 15 },
    { wch: 10 },
    { wch: 14 },
    { wch: 20 },
    { wch: 35 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Template Soal");
  XLSX.writeFile(wb, "Template_Format_Soal_CBT.xlsx");
};

/**
 * Download standard Word / Google Docs Template for question importing
 */
export const downloadDocQuestionTemplate = () => {
  const content = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset="utf-8">
      <title>Template Format Soal Word / Google Docs</title>
      <style>
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.4; }
        .box { background: #f4f4f4; border: 1px solid #ccc; padding: 12px; margin: 10px 0; font-family: monospace; font-size: 10pt; }
      </style>
    </head>
    <body>
      <h2>PANDUAN FORMAT SOAL DARI WORD / GOOGLE DOCS</h2>
      <p>Anda dapat mengetik naskah soal di Word atau Google Docs dengan format terstruktur baku berikut, lalu copy-paste ke menu <strong>"Impor Soal"</strong> di aplikasi CBT:</p>
      
      <div class="box">
        1. Manakah dari berikut ini yang merupakan komponen utama CPU?<br>
        A. ALU dan Control Unit<br>
        B. Keyboard dan Mouse<br>
        C. Harddisk dan Monitor<br>
        D. Flashdisk dan Power Supply<br>
        Kunci: A<br>
        Skor: 20<br>
        Level: C2<br>
        Topik: Perangkat Keras<br>
        Pembahasan: CPU terdiri dari Unit Kontrol (CU), Arithmetic Logic Unit (ALU), dan Register.<br>
        <br>
        2. Dalam pemrograman, struktur perulangan yang memeriksa kondisi di awal adalah...<br>
        A. While loop<br>
        B. Do-While loop<br>
        C. Switch-Case<br>
        D. If-Else<br>
        Kunci: A<br>
        Skor: 20<br>
        Pembahasan: While loop mengevaluasi kondisi sebelum blok kode dijalankan.<br>
        <br>
        3. Protokol yang digunakan untuk pengiriman surat elektronik (email) antar server adalah...<br>
        Kunci: SMTP<br>
        Skor: 20<br>
        Topik: Jaringan Komputer<br>
        Pembahasan: SMTP (Simple Mail Transfer Protocol) digunakan untuk transfer email.<br>
      </div>

      <p><strong>Aturan Penulisan:</strong></p>
      <ul>
        <li>Awali nomor soal dengan angka dan titik (misal: <code>1.</code> atau <code>2.</code>).</li>
        <li>Awali opsi pilihan ganda dengan <code>A.</code>, <code>B.</code>, <code>C.</code>, <code>D.</code>, <code>E.</code></li>
        <li>Tuliskan <code>Kunci: A</code> atau kata jawaban isian singkat.</li>
        <li>Opsional sertakan <code>Skor: 10</code>, <code>Level: C4</code>, <code>Topik: Materi</code>, dan <code>Pembahasan: Penjelasan</code>.</li>
      </ul>
    </body>
    </html>
  `;

  const blob = new Blob(["\ufeff", content], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Template_Format_Soal_Word_Docs.doc";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Parse Questions from Excel File (.xlsx, .xls, .csv)
 */
export const parseQuestionsFromExcel = (
  dataBuffer: ArrayBuffer
): { questions: Question[]; message: string; error?: string } => {
  const wb = XLSX.read(dataBuffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("File Excel tidak memiliki lembar kerja (worksheet).");
  }

  const ws = wb.Sheets[sheetName];
  const rawRows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("Lembar kerja Excel kosong.");
  }

  // Find header row
  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(10, rawRows.length); r++) {
    const rowStr = (rawRows[r] || []).join(" ").toLowerCase();
    if (
      rowStr.includes("soal") ||
      rowStr.includes("pertanyaan") ||
      rowStr.includes("pilihan") ||
      rowStr.includes("kunci")
    ) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) {
    headerRowIdx = 0; // Fallback to first row
  }

  const headerRow = (rawRows[headerRowIdx] || []).map((h) => String(h || "").trim().toLowerCase());

  // Helper to find column index by keywords
  const findCol = (keywords: string[]): number => {
    return headerRow.findIndex((col) =>
      keywords.some((k) => col.includes(k.toLowerCase()))
    );
  };

  const colType = findCol(["tipe", "bentuk", "type"]);
  const colText = findCol(["teks soal", "pertanyaan", "soal", "question"]);
  const colStimulus = findCol(["stimulus", "bacaan", "wacana"]);
  const colOptA = findCol(["pilihan a", "opsi a", "opt a", "a."]);
  const colOptB = findCol(["pilihan b", "opsi b", "opt b", "b."]);
  const colOptC = findCol(["pilihan c", "opsi c", "opt c", "c."]);
  const colOptD = findCol(["pilihan d", "opsi d", "opt d", "d."]);
  const colOptE = findCol(["pilihan e", "opsi e", "opt e", "e."]);
  const colMatching = findCol(["menjodohkan", "pasangan", "matching"]);
  const colKey = findCol(["kunci", "jawaban benar", "correct", "key", "jawaban"]);
  const colScore = findCol(["skor", "bobot", "poin", "score", "nilai"]);
  const colLevel = findCol(["level", "kognitif", "bloom", "c1", "c4", "hots"]);
  const colTopic = findCol(["topik", "materi", "kd", "kompetensi"]);
  const colExplanation = findCol(["pembahasan", "rubrik", "penjelasan", "explanation"]);

  const questions: Question[] = [];

  for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || row.length === 0) continue;

    // Get question text
    let qText = "";
    if (colText !== -1 && row[colText]) {
      qText = String(row[colText]).trim();
    } else {
      // Find longest text string in row
      const candidate = row.find((cell) => typeof cell === "string" && cell.trim().length > 10);
      if (candidate) qText = String(candidate).trim();
    }

    if (!qText) continue;

    // Determine Question Type
    let rawTypeStr = colType !== -1 && row[colType] ? String(row[colType]).toLowerCase() : "";
    let qType: QuestionType = "pilihan_ganda";

    if (rawTypeStr.includes("isian") || rawTypeStr.includes("singkat") || rawTypeStr.includes("short")) {
      qType = "isian_singkat";
    } else if (rawTypeStr.includes("uraian") || rawTypeStr.includes("essay") || rawTypeStr.includes("esai")) {
      qType = "uraian";
    } else if (rawTypeStr.includes("jodoh") || rawTypeStr.includes("match")) {
      qType = "menjodohkan";
    } else if (rawTypeStr.includes("benar") || rawTypeStr.includes("salah") || rawTypeStr.includes("true")) {
      qType = "benar_salah";
    }

    // Parse options
    const options: QuestionOption[] = [];
    const valA = colOptA !== -1 && row[colOptA] ? String(row[colOptA]).trim() : "";
    const valB = colOptB !== -1 && row[colOptB] ? String(row[colOptB]).trim() : "";
    const valC = colOptC !== -1 && row[colOptC] ? String(row[colOptC]).trim() : "";
    const valD = colOptD !== -1 && row[colOptD] ? String(row[colOptD]).trim() : "";
    const valE = colOptE !== -1 && row[colOptE] ? String(row[colOptE]).trim() : "";

    if (valA) options.push({ key: "A", text: valA });
    if (valB) options.push({ key: "B", text: valB });
    if (valC) options.push({ key: "C", text: valC });
    if (valD) options.push({ key: "D", text: valD });
    if (valE) options.push({ key: "E", text: valE });

    // Fallback: If no options found in columns but type is multiple choice, check adjacent cells
    if (options.length === 0 && qType === "pilihan_ganda") {
      const remainingTexts = row.filter((c, idx) => idx !== colText && typeof c === "string" && c.trim().length > 0);
      if (remainingTexts.length >= 2) {
        const keys = ["A", "B", "C", "D", "E"];
        remainingTexts.slice(0, 5).forEach((txt, i) => {
          options.push({ key: keys[i], text: String(txt).trim() });
        });
      }
    }

    // Matching pairs
    let matchingPairs: MatchingPair[] | undefined;
    const matchingStr = colMatching !== -1 && row[colMatching] ? String(row[colMatching]).trim() : "";
    if (matchingStr) {
      qType = "menjodohkan";
      const parts = matchingStr.split(/\||\n/);
      matchingPairs = parts.map((p, idx) => {
        const splitPair = p.split(/->|::|=|:/);
        return {
          id: `mp-${Date.now()}-${idx}`,
          left: splitPair[0]?.trim() || `Item ${idx + 1}`,
          right: splitPair[1]?.trim() || `Pasangan ${idx + 1}`,
        };
      });
    }

    // Key
    let keyVal = colKey !== -1 && row[colKey] !== undefined ? String(row[colKey]).trim() : "A";
    if (!keyVal && options.length > 0) keyVal = "A";

    // Score
    let scoreVal = 10;
    if (colScore !== -1 && row[colScore] !== undefined) {
      const parsedScore = parseFloat(String(row[colScore]).replace(/[^0-9.]/g, ""));
      if (!isNaN(parsedScore) && parsedScore > 0) scoreVal = parsedScore;
    }

    // Level
    const levelVal = colLevel !== -1 && row[colLevel] ? String(row[colLevel]).trim() : "C3";

    // Topic
    const topicVal = colTopic !== -1 && row[colTopic] ? String(row[colTopic]).trim() : "Materi Umum";

    // Stimulus
    const stimulusVal = colStimulus !== -1 && row[colStimulus] ? String(row[colStimulus]).trim() : undefined;

    // Explanation
    const explanationVal = colExplanation !== -1 && row[colExplanation]
      ? String(row[colExplanation]).trim()
      : `Kunci jawaban butir soal ini adalah ${keyVal}.`;

    questions.push({
      id: `q-excel-${Date.now()}-${questions.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
      questionNumber: questions.length + 1,
      questionText: qText,
      stimulus: stimulusVal,
      type: qType,
      options: options.length > 0 ? options : [
        { key: "A", text: "Pilihan A" },
        { key: "B", text: "Pilihan B" },
        { key: "C", text: "Pilihan C" },
        { key: "D", text: "Pilihan D" },
      ],
      matchingPairs,
      correctAnswer: keyVal,
      score: scoreVal,
      cognitiveLevel: levelVal,
      topicTag: topicVal,
      explanation: explanationVal,
      sampleAnswer: qType === "uraian" ? explanationVal : undefined,
    });
  }

  if (questions.length === 0) {
    throw new Error("Tidak ditemukan butir soal yang valid dalam file Excel. Pastikan file menggunakan kolom 'Teks Soal' dan 'Pilihan A - D'.");
  }

  return {
    questions,
    message: `Berhasil mengekstrak ${questions.length} butir soal dari file Excel.`,
  };
};

/**
 * Parse Questions from Formatted Text (e.g. copied from Word or Google Docs)
 */
export const parseQuestionsFromFormattedText = (
  rawText: string
): { questions: Question[]; message: string; error?: string } => {
  if (!rawText || rawText.trim().length < 15) {
    throw new Error("Teks dokumen yang dimasukkan terlalu pendek untuk dianalisis.");
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const questions: Question[] = [];
  let currentQ: Partial<Question> | null = null;
  let currentOptions: QuestionOption[] = [];
  let currentMatchingPairs: MatchingPair[] = [];

  const flushCurrentQuestion = () => {
    if (currentQ && currentQ.questionText) {
      const qType: QuestionType = currentMatchingPairs.length > 0
        ? "menjodohkan"
        : currentOptions.length > 0
        ? "pilihan_ganda"
        : currentQ.type || "pilihan_ganda";

      const finalOptions = currentOptions.length > 0
        ? currentOptions
        : qType === "pilihan_ganda"
        ? [
            { key: "A", text: "Opsi A" },
            { key: "B", text: "Opsi B" },
            { key: "C", text: "Opsi C" },
            { key: "D", text: "Opsi D" },
          ]
        : [];

      questions.push({
        id: `q-doc-${Date.now()}-${questions.length + 1}-${Math.random().toString(36).substring(2, 6)}`,
        questionNumber: questions.length + 1,
        questionText: currentQ.questionText,
        stimulus: currentQ.stimulus,
        type: qType,
        options: finalOptions,
        matchingPairs: currentMatchingPairs.length > 0 ? currentMatchingPairs : undefined,
        correctAnswer: currentQ.correctAnswer || (finalOptions[0]?.key || "A"),
        score: currentQ.score || 10,
        cognitiveLevel: currentQ.cognitiveLevel || "C3",
        topicTag: currentQ.topicTag || "Materi Umum",
        explanation: currentQ.explanation || `Kunci jawaban adalah ${currentQ.correctAnswer || "A"}.`,
        sampleAnswer: currentQ.sampleAnswer,
      });
    }
    currentQ = null;
    currentOptions = [];
    currentMatchingPairs = [];
  };

  const qNumberRegex = /^(?:Soal\s*)?(\d+)[\.\)\:\-]\s+(.+)/i;
  const optionRegex = /^([A-Ea-e])[\.\)\:\-]\s+(.+)/;
  const keyRegex = /^(?:Kunci|Jawaban|Kunci\s*Jawaban|Key|Answer)\s*[\:\=]\s*(.+)/i;
  const scoreRegex = /^(?:Skor|Bobot|Poin|Score)\s*[\:\=]\s*(\d+)/i;
  const levelRegex = /^(?:Level|Kognitif|Cognitive)\s*[\:\=]\s*(.+)/i;
  const topicRegex = /^(?:Topik|Materi|Topic)\s*[\:\=]\s*(.+)/i;
  const explanationRegex = /^(?:Pembahasan|Penjelasan|Explanation|Rubrik)\s*[\:\=]\s*(.+)/i;
  const matchingPairRegex = /^([^\-\>\:\=]+)\s*(?:\-\>|\:\:|\=)\s*(.+)/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if line starts a new question
    const qMatch = line.match(qNumberRegex);
    if (qMatch) {
      flushCurrentQuestion();
      currentQ = {
        questionText: qMatch[2].trim(),
        score: 10,
        type: "pilihan_ganda",
      };
      continue;
    }

    if (!currentQ) {
      // First line might be question text without number
      if (line.length > 10 && !line.match(optionRegex) && !line.match(keyRegex)) {
        currentQ = {
          questionText: line,
          score: 10,
          type: "pilihan_ganda",
        };
      }
      continue;
    }

    // Check Option A-E
    const optMatch = line.match(optionRegex);
    if (optMatch) {
      const key = optMatch[1].toUpperCase();
      const text = optMatch[2].trim();
      currentOptions.push({ key, text });
      continue;
    }

    // Check Key
    const keyMatch = line.match(keyRegex);
    if (keyMatch) {
      currentQ.correctAnswer = keyMatch[1].trim();
      continue;
    }

    // Check Score
    const scoreMatch = line.match(scoreRegex);
    if (scoreMatch) {
      const val = parseInt(scoreMatch[1], 10);
      if (!isNaN(val)) currentQ.score = val;
      continue;
    }

    // Check Level
    const levelMatch = line.match(levelRegex);
    if (levelMatch) {
      currentQ.cognitiveLevel = levelMatch[1].trim();
      continue;
    }

    // Check Topic
    const topicMatch = line.match(topicRegex);
    if (topicMatch) {
      currentQ.topicTag = topicMatch[1].trim();
      continue;
    }

    // Check Explanation
    const expMatch = line.match(explanationRegex);
    if (expMatch) {
      currentQ.explanation = expMatch[1].trim();
      continue;
    }

    // Check matching pair
    const matchPairMatch = line.match(matchingPairRegex);
    if (matchPairMatch && currentOptions.length === 0) {
      currentMatchingPairs.push({
        id: `mp-${Date.now()}-${currentMatchingPairs.length}`,
        left: matchPairMatch[1].trim(),
        right: matchPairMatch[2].trim(),
      });
      continue;
    }

    // Append multiline question text or stimulus if before options
    if (currentOptions.length === 0) {
      currentQ.questionText = `${currentQ.questionText} ${line}`;
    }
  }

  // Flush last question
  flushCurrentQuestion();

  if (questions.length === 0) {
    throw new Error("Gagal membaca struktur butir soal. Pastikan teks menggunakan nomor (contoh: '1. Teks Soal') dan opsi jawaban (contoh: 'A. Pilihan 1').");
  }

  return {
    questions,
    message: `Berhasil mengimpor ${questions.length} butir soal dari dokumen teks / Word.`,
  };
};
