import React, { useState } from "react";
import {
  FileSpreadsheet,
  FileText,
  Printer,
  Download,
  CheckCircle2,
  X,
  FileDown,
  Info,
  CheckSquare,
  Square,
  Layers,
  Sparkles,
  BookOpen,
  BrainCircuit
} from "lucide-react";
import { ExamPackage, SchoolProfile } from "../types";
import {
  exportQuestionsToExcel,
  exportQuestionsToWordDoc,
  printFormattedExamDocument,
  downloadExcelQuestionTemplate,
  downloadDocQuestionTemplate,
  calculateBloomAndersonSummary
} from "../utils/sheetExport";

interface QuestionExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: ExamPackage;
  school: SchoolProfile;
}

export const QuestionExportModal: React.FC<QuestionExportModalProps> = ({
  isOpen,
  onClose,
  exam,
  school,
}) => {
  const [includeKeyInWord, setIncludeKeyInWord] = useState(true);
  const [includeMatrixInWord, setIncludeMatrixInWord] = useState(true);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const bloomSummary = calculateBloomAndersonSummary(exam.questions);

  const triggerFeedback = (msg: string) => {
    setDownloadSuccess(msg);
    setTimeout(() => setDownloadSuccess(null), 3500);
  };

  const handleExportExcel = () => {
    exportQuestionsToExcel(exam, school);
    triggerFeedback("File Excel (.xlsx) berhasil diunduh!");
  };

  const handleExportWord = () => {
    exportQuestionsToWordDoc(exam, school, includeKeyInWord, includeMatrixInWord);
    triggerFeedback("Dokumen Word (.doc) ber-kisi-kisi Bloom-Anderson berhasil diunduh!");
  };

  const handlePrint = () => {
    printFormattedExamDocument(exam, school, {
      includeAnswerKey: includeKeyInWord,
      includeMatrix: includeMatrixInWord,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#121214] border border-slate-700 rounded-3xl max-w-2xl w-full flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#161618]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl">
              <FileDown className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Ekspor & Cetak Naskah Soal</span>
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
                <span>{exam.teacherProfile?.subject || "Umum"}</span>
                <span>•</span>
                <span className="text-cyan-300 font-semibold">{exam.teacherProfile?.gradeLevel || "Kelas X"}</span>
                <span>•</span>
                <span className="text-emerald-300 font-semibold">TP: {exam.teacherProfile?.academicYear || "2025/2026"}</span>
                <span>•</span>
                <span className="text-amber-300 font-semibold">Sem: {exam.teacherProfile?.semester || "Ganjil"}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {downloadSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{downloadSuccess}</span>
            </div>
          )}

          {/* Bloom & Anderson Taxonomical Breakdown Summary */}
          <div className="p-4 bg-indigo-950/30 border border-indigo-500/20 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                <BrainCircuit className="w-4 h-4 text-indigo-400" />
                <span>Distribusi Taksonomi Kognitif Bloom & Anderson</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                {exam.questions.length} Butir Soal
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
              <div className="p-2.5 bg-[#121214] border border-red-500/20 rounded-xl">
                <div className="font-black text-red-400 text-sm">{bloomSummary.hotsPercent}%</div>
                <div className="text-[10px] text-slate-400 font-semibold">HOTS (C4-C6)</div>
                <div className="text-[10px] text-slate-500">{bloomSummary.distribution.HOTS} Butir</div>
              </div>
              <div className="p-2.5 bg-[#121214] border border-amber-500/20 rounded-xl">
                <div className="font-black text-amber-400 text-sm">{bloomSummary.motsPercent}%</div>
                <div className="text-[10px] text-slate-400 font-semibold">MOTS (C3)</div>
                <div className="text-[10px] text-slate-500">{bloomSummary.distribution.MOTS} Butir</div>
              </div>
              <div className="p-2.5 bg-[#121214] border border-blue-500/20 rounded-xl">
                <div className="font-black text-blue-400 text-sm">{bloomSummary.lotsPercent}%</div>
                <div className="text-[10px] text-slate-400 font-semibold">LOTS (C1-C2)</div>
                <div className="text-[10px] text-slate-500">{bloomSummary.distribution.LOTS} Butir</div>
              </div>
            </div>
          </div>

          {/* Option 1: Microsoft Excel / Google Sheets (.xlsx) */}
          <div className="p-5 bg-[#161618] border border-slate-800 rounded-2xl hover:border-emerald-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                  Format Excel / Spreadsheet (.xlsx)
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Lengkap dengan 3 sheet (Daftar Soal & Kunci, Kisi-kisi Analisis Butir, dan Petunjuk Format). Kompatibel dengan Excel, Google Sheets, dan LibreOffice Calc.
              </p>
            </div>
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-950 flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Download .xlsx</span>
            </button>
          </div>

          {/* Option 2: Microsoft Word / Google Docs (.doc) */}
          <div className="p-5 bg-[#161618] border border-slate-800 rounded-2xl hover:border-indigo-500/40 transition-all space-y-3 group">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                    Format Dokumen Word / Docs (.doc)
                  </h3>
                </div>
                <p className="text-xs text-slate-400">
                  Naskah resmi berstandar kurikulum dengan Kop Sekolah, tabel identitas ujian, stimulus soal, opsi A-E, serta matriks kisi-kisi Bloom & Anderson.
                </p>
              </div>
              <button
                onClick={handleExportWord}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-950 flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download .doc</span>
              </button>
            </div>

            {/* Checkbox options */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row gap-3 text-xs">
              <button
                type="button"
                onClick={() => setIncludeMatrixInWord(!includeMatrixInWord)}
                className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none"
              >
                {includeMatrixInWord ? (
                  <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span>Sertakan Matriks Kisi-Kisi Lengkap (Bloom & Anderson)</span>
              </button>

              <button
                type="button"
                onClick={() => setIncludeKeyInWord(!includeKeyInWord)}
                className="flex items-center gap-2 text-slate-300 hover:text-white cursor-pointer select-none"
              >
                {includeKeyInWord ? (
                  <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span>Sertakan Kunci & Pembahasan</span>
              </button>
            </div>
          </div>

          {/* Option 3: Print / PDF Naskah */}
          <div className="p-5 bg-[#161618] border border-slate-800 rounded-2xl hover:border-amber-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                  Cetak Naskah + Kisi-Kisi / Simpan PDF
                </h3>
              </div>
              <p className="text-xs text-slate-400">
                Membuka jendela cetak browser yang telah diformat khusus untuk kertas A4 / F4 lengkap dengan Kop Sekolah dan Lampiran Kisi-Kisi Bloom-Anderson.
              </p>
            </div>
            <button
              onClick={handlePrint}
              className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-950 flex items-center gap-2 cursor-pointer shrink-0"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF</span>
            </button>
          </div>

          {/* Templates Section */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Info className="w-4 h-4 text-indigo-400" />
              <span>Template Soal Kosong untuk Guru:</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Bagikan template berikut kepada guru lain untuk mempermudah penyusunan bank soal sebelum diimpor kembali ke sistem CBT.
            </p>
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                onClick={downloadExcelQuestionTemplate}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Unduh Template Excel (.xlsx)</span>
              </button>
              <button
                onClick={downloadDocQuestionTemplate}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Unduh Template Word (.doc)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-[#161618] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
