import * as XLSX from "xlsx";
import { ExamPackage, ItemAnalysisSummary, SchoolProfile, StudentExamSession, StudentTokenItem } from "../types";

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

// Export Gradebook / Daftar Nilai to Excel / Sheets
export const exportGradebookToExcel = (
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

// Generate HTML for Printable Exam Paper (Kop Surat Sekolah + Formatted Docs Paper)
export const printFormattedExamDocument = (
  exam: ExamPackage,
  schoolOverride?: SchoolProfile,
  options?: { includeAnswerKey?: boolean }
) => {
  const school = schoolOverride || exam.schoolProfile;
  const teacher = exam.teacherProfile;
  const showKey = !!options?.includeAnswerKey;

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
    .correct-highlight { background-color: #e6ffed; border: 1px solid #38a169; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-top: 4px; margin-left: 26px; font-size: 10pt; }
    .explanation-box { background-color: #ebf8ff; border: 1px solid #3182ce; padding: 4px 8px; font-size: 9.5pt; margin-top: 4px; margin-left: 26px; }
    
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
      <div><strong>Guru Pengampu:</strong> ${teacher.teacherName}</div>
      <div><strong>Kode Naskah:</strong> ${exam.code}</div>
    </div>
  </div>

  <div class="instructions-box">
    <div class="instructions-title">PETUNJUK UMUM:</div>
    <ol style="margin: 0; padding-left: 18px;">
      <li>Periksalah kelengkapan naskah soal sebelum mulai mengerjakan.</li>
      <li>Tuliskan identitas Anda dengan jelas dan teliti pada lembar jawaban.</li>
      <li>Pilihlah salah satu jawaban yang paling tepat dengan menghitamkan/memilih opsi A, B, C, D, atau E.</li>
      <li>Dahulukan menjawab soal-soal yang Anda anggap mudah.</li>
    </ol>
  </div>

  <div class="questions-container">
    ${exam.questions
      .map(
        (q, idx) => `
      <div class="question-item">
        <div class="question-title">
          <span class="question-num">${idx + 1}.</span>
          <div class="question-body">
            ${q.stimulus ? `<div class="stimulus-box">${q.stimulus.replace(/\n/g, "<br>")}</div>` : ""}
            <div>${q.questionText}</div>
          </div>
        </div>
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
        ${
          showKey
            ? `
          <div class="correct-highlight">Kunci Jawaban: ${q.correctAnswer} (Bobot: ${q.score} poin) | ${q.cognitiveLevel || ""}</div>
          <div class="explanation-box"><strong>Pembahasan:</strong> ${q.explanation}</div>
        `
            : ""
        }
      </div>
    `
      )
      .join("")}
  </div>

  <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
    <div style="text-align: center; width: 220px;">
      <div>Mengetahui,</div>
      <div>Kepala Sekolah</div>
      <div style="height: 60px;"></div>
      <div style="font-weight: bold; text-decoration: underline;">${school.principalName || "Kepala Sekolah"}</div>
      <div>NIP. ${school.principalNIP || "-"}</div>
    </div>
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
