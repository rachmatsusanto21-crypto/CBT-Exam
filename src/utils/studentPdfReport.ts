import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ExamPackage, SchoolProfile, StudentExamSession } from "../types";

/**
 * Generates and triggers download of an individual student's comprehensive PDF exam report.
 */
export async function generateStudentExamPdfReport(
  studentSession: StudentExamSession,
  exam: ExamPackage,
  school: SchoolProfile
) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // ~210mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  let currentY = 12;

  // -------------------------------------------------------------
  // 1. KOP SURAT RESMI (OFFICIAL HEADER)
  // -------------------------------------------------------------
  const agency = (school.agencyName || "PEMERINTAH DAERAH / DINAS PENDIDIKAN").toUpperCase();
  const schoolName = (school.schoolName || "SEKOLAH MENENGAH ATAS NEGERI").toUpperCase();
  const npsn = school.npsn ? `NPSN: ${school.npsn}` : "";
  const address = `${school.address || "Jl. Pendidikan Nasional No. 1"} ${school.postalCode ? `Kode Pos ${school.postalCode}` : ""}`;
  const contact = [
    school.phone ? `Telp: ${school.phone}` : "",
    school.email ? `Email: ${school.email}` : "",
    school.website ? `Web: ${school.website}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  // Draw decorative school crest emblem on the left
  doc.setFillColor(30, 41, 59); // dark slate
  doc.roundedRect(margin, currentY, 16, 16, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("CBT", margin + 8, currentY + 7, { align: "center" });
  doc.setFontSize(5.5);
  doc.text("EXAM", margin + 8, currentY + 11, { align: "center" });

  // Header Texts
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(agency, pageWidth / 2, currentY + 2, { align: "center" });

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(schoolName, pageWidth / 2, currentY + 7, { align: "center" });

  doc.setTextColor(71, 85, 105);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text(`${address} ${npsn ? `• ${npsn}` : ""}`, pageWidth / 2, currentY + 11.5, { align: "center" });
  if (contact) {
    doc.text(contact, pageWidth / 2, currentY + 15, { align: "center" });
  }

  currentY += 19;

  // Double Separator Line
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.8);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  doc.setLineWidth(0.2);
  doc.line(margin, currentY + 0.9, pageWidth - margin, currentY + 0.9);

  currentY += 6;

  // -------------------------------------------------------------
  // 2. DOCUMENT TITLE
  // -------------------------------------------------------------
  doc.setTextColor(30, 41, 59);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("LAPORAN HASIL EVALUASI UJIAN COMPUTER BASED TEST (CBT)", pageWidth / 2, currentY, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Tahun Ajaran ${exam.teacherProfile.academicYear || "2025/2026"} • Semester ${exam.teacherProfile.semester || "Ganjil"}`,
    pageWidth / 2,
    currentY + 4,
    { align: "center" }
  );

  currentY += 8;

  // -------------------------------------------------------------
  // 3. STUDENT & EXAM IDENTITY BOX (TWO COLUMNS)
  // -------------------------------------------------------------
  const boxHeight = 27;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2, 2, "FD");

  const leftColX = margin + 4;
  const rightColX = margin + contentWidth / 2 + 3;
  let identityY = currentY + 5;

  doc.setFontSize(7.5);
  // Left Column (Student Info)
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Nama Siswa", leftColX, identityY);
  doc.text(":", leftColX + 24, identityY);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text(studentSession.studentName || "-", leftColX + 26, identityY);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("NISN / Kelas", leftColX, identityY + 5);
  doc.text(":", leftColX + 24, identityY + 5);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.text(`${studentSession.nisn || "-"} / Kelas ${studentSession.className || "-"}`, leftColX + 26, identityY + 5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Token Sesi", leftColX, identityY + 10);
  doc.text(":", leftColX + 24, identityY + 10);
  doc.setTextColor(79, 70, 229);
  doc.setFont("helvetica", "bold");
  doc.text(studentSession.token || exam.sessionToken, leftColX + 26, identityY + 10);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Waktu Ujian", leftColX, identityY + 15);
  doc.text(":", leftColX + 24, identityY + 15);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.text(
    studentSession.startTime ? new Date(studentSession.startTime).toLocaleString("id-ID") : "-",
    leftColX + 26,
    identityY + 15
  );

  // Right Column (Subject & Exam Info)
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Mata Pelajaran", rightColX, identityY);
  doc.text(":", rightColX + 24, identityY);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.text(exam.teacherProfile.subject || exam.title, rightColX + 26, identityY);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Guru Pengampu", rightColX, identityY + 5);
  doc.text(":", rightColX + 24, identityY + 5);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.text(exam.teacherProfile.teacherName || "-", rightColX + 26, identityY + 5);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("Kode Ujian", rightColX, identityY + 10);
  doc.text(":", rightColX + 24, identityY + 10);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.text(`${exam.code} (${exam.title})`, rightColX + 26, identityY + 10);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  doc.text("KKM / Standar", rightColX, identityY + 15);
  doc.text(":", rightColX + 24, identityY + 15);
  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "normal");
  doc.text(`${exam.teacherProfile.passingGrade} Poin (Skala 100)`, rightColX + 26, identityY + 15);

  currentY += boxHeight + 4;

  // -------------------------------------------------------------
  // 4. PERFORMANCE SUMMARY KPI CARDS & GRAPHIC BARS
  // -------------------------------------------------------------
  const questionsList = studentSession.shuffledQuestions && studentSession.shuffledQuestions.length > 0
    ? studentSession.shuffledQuestions
    : exam.questions;

  let correctCount = 0;
  let incorrectCount = 0;
  let unAnsweredCount = 0;

  questionsList.forEach((q) => {
    const studentAns = studentSession.answers[q.id];
    if (!studentAns || !studentAns.selectedOption) {
      unAnsweredCount++;
    } else if (studentAns.isCorrect || studentAns.selectedOption.toUpperCase() === q.correctAnswer.toUpperCase()) {
      correctCount++;
    } else {
      incorrectCount++;
    }
  });

  const totalQuestions = questionsList.length;
  const timeSpentMins = Math.round(studentSession.timeSpentSeconds / 60);
  const violationCount = studentSession.violationCount || studentSession.cheatViolations?.length || 0;

  // KPI Row
  const cardW = (contentWidth - 6) / 3;
  const cardH = 18;

  // Card 1: Score & Status
  doc.setFillColor(studentSession.passed ? 240 : 254, studentSession.passed ? 253 : 242, studentSession.passed ? 244 : 242);
  doc.setDrawColor(studentSession.passed ? 187 : 254, studentSession.passed ? 247 : 202, studentSession.passed ? 208 : 202);
  doc.roundedRect(margin, currentY, cardW, cardH, 2, 2, "FD");

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("NILAI AKHIR / HASIL", margin + 4, currentY + 5);

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(studentSession.passed ? 16 : 225, studentSession.passed ? 149 : 29, studentSession.passed ? 74 : 72);
  doc.text(String(studentSession.percentage), margin + 4, currentY + 12);

  doc.setFontSize(7.5);
  doc.text(studentSession.passed ? "TUNTAS (KKM)" : "REMEDIAL", margin + 22, currentY + 11.5);
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Skor: ${studentSession.totalScoreEarned} / ${studentSession.maxScore || exam.totalScore}`, margin + 22, currentY + 15);

  // Card 2: Question Breakdown
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin + cardW + 3, currentY, cardW, cardH, 2, 2, "FD");

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("AKURASI BUTIR SOAL", margin + cardW + 7, currentY + 5);

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(16, 185, 129);
  doc.text(`${correctCount}`, margin + cardW + 7, currentY + 12);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Benar`, margin + cardW + 14, currentY + 11.5);

  doc.setFontSize(11);
  doc.setTextColor(239, 68, 68);
  doc.text(`${incorrectCount}`, margin + cardW + 28, currentY + 12);
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Salah`, margin + cardW + 35, currentY + 11.5);

  doc.setFontSize(6.5);
  doc.text(`Total: ${totalQuestions} Butir • ${unAnsweredCount} Kosong`, margin + cardW + 7, currentY + 15.5);

  // Card 3: Integrity & Time
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin + (cardW + 3) * 2, currentY, cardW, cardH, 2, 2, "FD");

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text("INTEGRITAS & DURASI", margin + (cardW + 3) * 2 + 4, currentY + 5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(violationCount === 0 ? 16 : 217, violationCount === 0 ? 185 : 119, violationCount === 0 ? 129 : 6);
  doc.text(
    violationCount === 0 ? "Tertib (0 Pelanggaran)" : `${violationCount}x Tab Switch / Blur`,
    margin + (cardW + 3) * 2 + 4,
    currentY + 11
  );

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Waktu Pengerjaan: ${timeSpentMins} Menit (Maks. ${exam.durationMinutes}m)`,
    margin + (cardW + 3) * 2 + 4,
    currentY + 15.5
  );

  currentY += cardH + 4;

  // -------------------------------------------------------------
  // 5. GRAPHIC PERFORMANCE VISUALIZATION BAR
  // -------------------------------------------------------------
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, currentY, contentWidth, 8, 1.5, 1.5, "F");

  const correctWidth = totalQuestions > 0 ? (correctCount / totalQuestions) * contentWidth : 0;
  const incorrectWidth = totalQuestions > 0 ? (incorrectCount / totalQuestions) * contentWidth : 0;

  if (correctWidth > 0) {
    doc.setFillColor(16, 185, 129); // Emerald
    doc.roundedRect(margin, currentY, correctWidth, 8, 1.5, 1.5, "F");
  }
  if (incorrectWidth > 0) {
    doc.setFillColor(244, 63, 94); // Rose
    doc.rect(margin + correctWidth, currentY, incorrectWidth, 8, "F");
  }

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  if (correctWidth > 20) {
    doc.text(`Benar (${Math.round((correctCount / totalQuestions) * 100)}%)`, margin + 3, currentY + 5);
  }
  if (incorrectWidth > 20) {
    doc.text(`Salah (${Math.round((incorrectCount / totalQuestions) * 100)}%)`, margin + correctWidth + 3, currentY + 5);
  }

  currentY += 11;

  // -------------------------------------------------------------
  // 6. QUESTION BREAKDOWN TABLE (autoTable)
  // -------------------------------------------------------------
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 41, 59);
  doc.text("RINCIAN JAWABAN & PEMBAHASAN PER BUTIR SOAL", margin, currentY);
  currentY += 2.5;

  const tableBody = questionsList.map((q, idx) => {
    const studentAns = studentSession.answers[q.id];
    const chosen = studentAns?.selectedOption || "-";
    const isCorrect = studentAns?.isCorrect || chosen.toUpperCase() === q.correctAnswer.toUpperCase();
    const statusText = chosen === "-" ? "Kosong" : isCorrect ? "BENAR" : "SALAH";
    const scoreVal = isCorrect ? `+${q.score}` : "0";
    const topic = q.topicTag || q.cognitiveLevel || "Umum";

    // Truncate question text for neat table presentation
    const cleanQuestion = q.questionText.replace(/<[^>]*>?/gm, "").trim();
    const shortQuestion = cleanQuestion.length > 70 ? `${cleanQuestion.slice(0, 68)}...` : cleanQuestion;

    return [
      String(idx + 1),
      shortQuestion,
      topic,
      chosen,
      q.correctAnswer,
      statusText,
      scoreVal,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["No", "Butir Soal", "Topik / Dimensi", "Jwb", "Kunci", "Status", "Skor"]],
    body: tableBody,
    theme: "grid",
    margin: { left: margin, right: margin },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 85 },
      2: { cellWidth: 32 },
      3: { cellWidth: 10, halign: "center", fontStyle: "bold" },
      4: { cellWidth: 12, halign: "center", fontStyle: "bold" },
      5: { cellWidth: 16, halign: "center", fontStyle: "bold" },
      6: { cellWidth: 15, halign: "center" },
    },
    styles: {
      fontSize: 6.5,
      cellPadding: 1.6,
      textColor: [51, 65, 85],
    },
    didParseCell: (data) => {
      if (data.section === "body") {
        if (data.column.index === 5) {
          const val = String(data.cell.raw);
          if (val === "BENAR") {
            data.cell.styles.textColor = [16, 149, 74];
            data.cell.styles.fillColor = [240, 253, 244];
          } else if (val === "SALAH") {
            data.cell.styles.textColor = [225, 29, 72];
            data.cell.styles.fillColor = [254, 242, 242];
          } else {
            data.cell.styles.textColor = [100, 116, 139];
          }
        }
      }
    },
  });

  // Get table end position
  const finalY = (doc as any).lastAutoTable?.finalY || currentY + 60;
  let signatureY = finalY + 8;

  // If table went too close to bottom of page, add new page for signatures
  if (signatureY > 250) {
    doc.addPage();
    signatureY = 25;
  }

  // -------------------------------------------------------------
  // 7. SIGNATURES & VALIDATION FOOTER
  // -------------------------------------------------------------
  const printDateStr = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const place = school.address ? school.address.split(",")[0] : "Kota";

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(51, 65, 85);
  doc.text(`${place}, ${printDateStr}`, pageWidth - margin - 50, signatureY, { align: "center" });

  doc.text("Mengetahui,", margin + 30, signatureY + 4, { align: "center" });
  doc.text("Kepala Sekolah,", margin + 30, signatureY + 8, { align: "center" });

  doc.text("Guru Mata Pelajaran,", pageWidth - margin - 50, signatureY + 8, { align: "center" });

  // Signature lines & names
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(school.principalName || "Kepala Sekolah", margin + 30, signatureY + 28, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(`NIP. ${school.principalNIP || "__________________"}`, margin + 30, signatureY + 31.5, { align: "center" });

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(exam.teacherProfile.teacherName || "Guru Pengampu", pageWidth - margin - 50, signatureY + 28, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text(`NIP. ${exam.teacherProfile.teacherNIP || "__________________"}`, pageWidth - margin - 50, signatureY + 31.5, { align: "center" });

  // Document verification stamp footer
  doc.setFontSize(6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `* Dokumen ini dibuat otomatis oleh Sistem CBT Edukasi terverifikasi. ID Sesi: ${studentSession.id}`,
    margin,
    signatureY + 37
  );

  // Trigger download
  const cleanName = (studentSession.studentName || "Siswa").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `Rapor_CBT_${cleanName}_${studentSession.nisn || "NISN"}.pdf`;
  doc.save(filename);
}
