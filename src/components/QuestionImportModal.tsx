import React, { useState, useRef } from "react";
import {
  FileSpreadsheet,
  FileText,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  X,
  FileUp,
  HelpCircle,
  Layers,
  ArrowRight,
  RefreshCw,
  Copy,
  Info,
  Check,
  Cloud,
  Link2
} from "lucide-react";
import { Question, QuestionType } from "../types";
import {
  parseQuestionsFromExcel,
  parseQuestionsFromFormattedText,
  downloadExcelQuestionTemplate,
  downloadDocQuestionTemplate
} from "../utils/sheetExport";
import { extractGoogleDriveFileId, loadExamFromGoogleDrive } from "../utils/googleDrive";
import { getCachedAccessToken } from "../utils/googleAuth";

interface QuestionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportQuestions: (questions: Question[], mode: "append" | "replace") => void;
  existingQuestionsCount: number;
  subject?: string;
}

export const QuestionImportModal: React.FC<QuestionImportModalProps> = ({
  isOpen,
  onClose,
  onImportQuestions,
  existingQuestionsCount,
  subject = "Mata Pelajaran",
}) => {
  const [activeTab, setActiveTab] = useState<"excel" | "docs" | "gdrive">("excel");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");

  // Excel State
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [isProcessingExcel, setIsProcessingExcel] = useState(false);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelParsedQuestions, setExcelParsedQuestions] = useState<Question[] | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Docs / Text State
  const [docsInputText, setDocsInputText] = useState("");
  const [isProcessingDocs, setIsProcessingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [docsParsedQuestions, setDocsParsedQuestions] = useState<Question[] | null>(null);
  const docsFileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive Link State
  const [gdriveLinkInput, setGdriveLinkInput] = useState("");
  const [isProcessingGDrive, setIsProcessingGDrive] = useState(false);
  const [gdriveError, setGdriveError] = useState<string | null>(null);
  const [gdriveParsedQuestions, setGdriveParsedQuestions] = useState<Question[] | null>(null);
  const [gdriveExamMetadata, setGdriveExamMetadata] = useState<{
    title?: string;
    code?: string;
    subject?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleExcelUpload = async (file: File) => {
    setExcelFile(file);
    setExcelError(null);
    setExcelParsedQuestions(null);
    setIsProcessingExcel(true);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseQuestionsFromExcel(buffer);
      if (result.questions.length === 0) {
        setExcelError(result.error || "Tidak ada butir soal valid yang ditemukan dalam file Excel.");
      } else {
        setExcelParsedQuestions(result.questions);
      }
    } catch (err: any) {
      setExcelError(err?.message || "Format file tidak dikenali. Pastikan file berformat .xlsx, .xls, atau .csv.");
    } finally {
      setIsProcessingExcel(false);
    }
  };

  const handleDocsParse = () => {
    setDocsError(null);
    setDocsParsedQuestions(null);
    if (!docsInputText.trim()) {
      setDocsError("Silakan tempelkan teks naskah soal terlebih dahulu.");
      return;
    }

    setIsProcessingDocs(true);
    try {
      const result = parseQuestionsFromFormattedText(docsInputText);
      if (result.questions.length === 0) {
        setDocsError(result.error || "Tidak ada butir soal yang terdeteksi. Pastikan penomoran soal dan opsi jawaban sesuai format panduan.");
      } else {
        setDocsParsedQuestions(result.questions);
      }
    } catch (err: any) {
      setDocsError(err?.message || "Gagal memproses teks naskah soal.");
    } finally {
      setIsProcessingDocs(false);
    }
  };

  const handleDocsFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      setDocsInputText(text);
      const result = parseQuestionsFromFormattedText(text);
      if (result.questions.length === 0) {
        setDocsError(result.error || "Tidak ada butir soal yang terdeteksi dalam file teks.");
      } else {
        setDocsParsedQuestions(result.questions);
      }
    } catch (err: any) {
      setDocsError("Gagal membaca file naskah dokumen.");
    }
  };

  const handleFetchQuestionsFromGDrive = async () => {
    const rawInput = gdriveLinkInput.trim();
    if (!rawInput) {
      setGdriveError("Silakan tempelkan link Google Drive atau ID file naskah soal.");
      return;
    }

    setGdriveError(null);
    setGdriveParsedQuestions(null);
    setGdriveExamMetadata(null);
    setIsProcessingGDrive(true);

    try {
      const extracted = extractGoogleDriveFileId(rawInput);
      if (extracted.error || !extracted.fileId) {
        setGdriveError(extracted.error || "Format tautan Google Drive tidak valid.");
        setIsProcessingGDrive(false);
        return;
      }

      const token = getCachedAccessToken();
      const examPackage = await loadExamFromGoogleDrive(token || null, extracted.fileId);

      if (!examPackage || !Array.isArray(examPackage.questions) || examPackage.questions.length === 0) {
        throw new Error("File naskah Google Drive berhasil diunduh namun tidak memuat butir soal valid.");
      }

      setGdriveParsedQuestions(examPackage.questions);
      setGdriveExamMetadata({
        title: examPackage.title,
        code: examPackage.code,
        subject: examPackage.teacherProfile?.subject,
      });
    } catch (err: any) {
      setGdriveError(
        err?.message ||
          "Gagal memuat naskah soal dari Google Drive. Pastikan link file valid dan izin disetel publik ('Siapa saja yang memiliki link')."
      );
    } finally {
      setIsProcessingGDrive(false);
    }
  };

  const sampleTemplateText = `1. Perhatikan pernyataan berikut!
Perangkat keras komputer yang berfungsi sebagai otak pemroses data utama adalah...
A. RAM
B. Harddisk
C. CPU
D. GPU
E. Monitor
Kunci: C
Pembahasan: CPU (Central Processing Unit) merupakan otak komputer yang memproses instruksi.

2. Pasangkan jenis jaringan komputer berikut dengan jangkauan geografisnya yang tepat!
Pasangan: LAN = Jangkauan area lokal gedung
Pasangan: MAN = Jangkauan antar kota
Pasangan: WAN = Jangkauan antar negara/benua
Kunci: Mencocokkan Pasangan
Pembahasan: LAN mencakup gedung, MAN mencakup wilayah metropolitan, dan WAN mencakup global.

3. Sebutkan protokol jaringan internet yang digunakan untuk transfer data web secara aman dan terenkripsi!
Kunci: HTTPS, Hypertext Transfer Protocol Secure
Pembahasan: HTTPS menggunakan enkripsi TLS/SSL.`;

  const activeQuestions =
    activeTab === "excel"
      ? excelParsedQuestions
      : activeTab === "docs"
      ? docsParsedQuestions
      : gdriveParsedQuestions;

  const handleExecuteImport = () => {
    if (!activeQuestions || activeQuestions.length === 0) return;
    onImportQuestions(activeQuestions, importMode);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#121214] border border-slate-700 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#161618]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
              <FileUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                <span>Impor Naskah Soal</span>
                <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Excel (.xlsx) & Docs/Word
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Unggah berkas spreadsheet Excel atau tempel teks dari Microsoft Word & Google Docs.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-4 border-b border-slate-800 bg-[#141416] flex items-center justify-between flex-wrap gap-3">
          <div className="flex space-x-2">
            <button
              onClick={() => setActiveTab("excel")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "excel"
                  ? "bg-[#121214] text-emerald-400 border-t-2 border-emerald-500 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Dari Spreadsheet Excel (.xlsx / .csv)</span>
            </button>
            <button
              onClick={() => setActiveTab("docs")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "docs"
                  ? "bg-[#121214] text-indigo-400 border-t-2 border-indigo-500 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>Dari Naskah Word / Google Docs (Teks Format)</span>
            </button>
            <button
              onClick={() => setActiveTab("gdrive")}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "gdrive"
                  ? "bg-[#121214] text-cyan-400 border-t-2 border-cyan-500 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
              }`}
            >
              <Cloud className="w-4 h-4 text-cyan-400" />
              <span>Link Google Drive (.json)</span>
            </button>
          </div>

          {/* Quick Template Download */}
          <div className="flex items-center gap-2 pb-2">
            {activeTab === "excel" ? (
              <button
                onClick={downloadExcelQuestionTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                title="Download file template Excel siap pakai"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Template Excel (.xlsx)</span>
              </button>
            ) : activeTab === "docs" ? (
              <button
                onClick={downloadDocQuestionTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                title="Download file panduan format penulisan Word"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh Format Word (.doc)</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* Modal Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: EXCEL / SPREADSHEET */}
          {activeTab === "excel" && (
            <div className="space-y-5">
              {/* Dropzone */}
              <div
                onClick={() => excelFileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleExcelUpload(e.dataTransfer.files[0]);
                  }
                }}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-3xl p-8 text-center bg-[#161618]/60 hover:bg-emerald-950/10 transition-all cursor-pointer group space-y-3"
              >
                <input
                  type="file"
                  ref={excelFileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleExcelUpload(e.target.files[0]);
                    }
                  }}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
                    {excelFile ? excelFile.name : "Klik atau seret file Excel ke sini"}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Mendukung format <strong>.xlsx, .xls, dan .csv</strong> (Template resmi atau kolom standar)
                  </p>
                </div>
              </div>

              {isProcessingExcel && (
                <div className="flex items-center justify-center gap-2 p-4 bg-slate-900 rounded-2xl border border-slate-800 text-slate-300 text-xs font-semibold">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Sedang membaca dan menganalisis tabel butir soal...</span>
                </div>
              )}

              {excelError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Gagal Mengimpor: </span>
                    <span>{excelError}</span>
                  </div>
                </div>
              )}

              {/* Excel Format Guide Hint */}
              <div className="p-4 bg-[#161618] border border-slate-800 rounded-2xl space-y-2 text-xs text-slate-400">
                <div className="flex items-center gap-2 font-bold text-slate-200">
                  <Info className="w-4 h-4 text-emerald-400" />
                  <span>Struktur Kolom yang Dikenali:</span>
                </div>
                <p>
                  Header kolom: <code className="text-emerald-300 font-mono font-bold">No Soal</code>, <code className="text-emerald-300 font-mono font-bold">Tipe Soal</code> (pilihan_ganda/menjodohkan/isian), <code className="text-emerald-300 font-mono font-bold">Teks Soal</code>, <code className="text-emerald-300 font-mono font-bold">Pilihan A - E</code>, <code className="text-emerald-300 font-mono font-bold">Kunci Jawaban</code>, <code className="text-emerald-300 font-mono font-bold">Skor</code>, <code className="text-emerald-300 font-mono font-bold">Pembahasan</code>.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: DOCS / WORD / FORMATTED TEXT */}
          {activeTab === "docs" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span>Tempelkan Teks Naskah Soal dari Word / Google Docs:</span>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => docsFileInputRef.current?.click()}
                    className="text-[11px] font-semibold text-slate-300 hover:text-white px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload Berkas .txt / .doc</span>
                  </button>
                  <input
                    type="file"
                    ref={docsFileInputRef}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleDocsFileUpload(e.target.files[0]);
                      }
                    }}
                    accept=".txt,.doc,.docx,.md"
                    className="hidden"
                  />
                  <button
                    onClick={() => setDocsInputText(sampleTemplateText)}
                    className="text-[11px] font-semibold text-indigo-300 hover:text-indigo-200 px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Isi Contoh Format</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={9}
                value={docsInputText}
                onChange={(e) => setDocsInputText(e.target.value)}
                placeholder="Contoh format penulisan:
1. Ibu kota negara Indonesia adalah...
A. Surabaya
B. Bandung
C. Jakarta
D. Medan
Kunci: C
Pembahasan: Berdasarkan undang-undang saat ini, Jakarta adalah ibu kota.

2. Pasangkan protokol berikut:
Pasangan: HTTP = Protokol web standar
Pasangan: SMTP = Protokol pengiriman email
Kunci: Pasangan"
                className="w-full p-4 bg-[#161618] border border-slate-800 rounded-2xl text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none placeholder-slate-600 leading-relaxed"
              />

              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">
                  Format otomatis mengenali nomor soal (1.), opsi pilihan (A.), kunci jawaban (Kunci:), dan pembahasan.
                </p>
                <button
                  onClick={handleDocsParse}
                  disabled={isProcessingDocs || !docsInputText.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-950 flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  {isProcessingDocs ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  <span>Analisis & Ekstrak Soal</span>
                </button>
              </div>

              {docsError && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Peringatan Format: </span>
                    <span>{docsError}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: GDRIVE LINK INPUT */}
          {activeTab === "gdrive" && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-5 bg-[#161618] border border-cyan-500/30 rounded-2xl space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Tempel Link File Soal dari Google Drive</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 font-bold border border-cyan-500/20">
                        Format .json
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Ambil butir-butir soal langsung dari file naskah Google Drive untuk dimasukkan ke lembar kerja editor ini.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={gdriveLinkInput}
                      onChange={(e) => {
                        setGdriveLinkInput(e.target.value);
                        if (gdriveError) setGdriveError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleFetchQuestionsFromGDrive();
                        }
                      }}
                      placeholder="https://drive.google.com/file/d/1A2b3c4d5e.../view?usp=sharing atau ID file"
                      className="w-full px-3.5 py-2.5 bg-black/40 border border-slate-700 focus:border-cyan-500 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 font-mono transition-all pr-8"
                    />
                    {gdriveLinkInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setGdriveLinkInput("");
                          setGdriveError(null);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleFetchQuestionsFromGDrive}
                    disabled={isProcessingGDrive || !gdriveLinkInput.trim()}
                    className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-cyan-950 cursor-pointer shrink-0"
                  >
                    {isProcessingGDrive ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Mengunduh...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4" />
                        <span>Ambil Soal dari Drive</span>
                      </>
                    )}
                  </button>
                </div>

                {gdriveError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{gdriveError}</span>
                  </div>
                )}

                {gdriveExamMetadata && (
                  <div className="p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Naskah Terdeteksi: </span>
                      <strong className="text-white">{gdriveExamMetadata.title}</strong>
                      {gdriveExamMetadata.code && (
                        <span className="ml-2 font-mono text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                          {gdriveExamMetadata.code}
                        </span>
                      )}
                    </div>
                    <span className="text-emerald-400 font-semibold">
                      ✓ {gdriveParsedQuestions?.length || 0} butir soal siap diimpor
                    </span>
                  </div>
                )}

                <div className="text-[11px] text-slate-400 pt-1">
                  💡 <strong>Tips:</strong> Buka file di Google Drive &rarr; klik <strong>Bagikan</strong> &rarr; pastikan setelan akses <strong>"Siapa saja yang memiliki link"</strong> &rarr; Salin Link lalu tempel di sini.
                </div>
              </div>
            </div>
          )}

          {/* PARSED PREVIEW SECTION */}
          {activeQuestions && activeQuestions.length > 0 && (
            <div className="p-5 bg-[#161618] border border-slate-800 rounded-3xl space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm font-bold text-white">
                    Terdeteksi {activeQuestions.length} Butir Soal Siap Impor
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold">
                    Total: {activeQuestions.reduce((acc, q) => acc + (q.score || 10), 0)} Poin
                  </span>
                </div>
              </div>

              {/* Questions preview items */}
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {activeQuestions.slice(0, 10).map((q, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-[#121214] border border-slate-800/80 rounded-xl flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-indigo-400">#{idx + 1}</span>
                        <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                          {q.type === "menjodohkan"
                            ? "Mencocokkan"
                            : q.type === "isian_singkat"
                            ? "Isian Singkat"
                            : q.type === "uraian"
                            ? "Uraian"
                            : "Pilihan Ganda"}
                        </span>
                        {q.topicTag && (
                          <span className="text-[10px] text-slate-500">[{q.topicTag}]</span>
                        )}
                      </div>
                      <p className="text-slate-200 line-clamp-2 font-medium">{q.questionText}</p>
                      {q.correctAnswer && (
                        <p className="text-[11px] text-emerald-400 font-mono">
                          Kunci: {q.correctAnswer}
                        </p>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded shrink-0">
                      {q.score || 10} pt
                    </span>
                  </div>
                ))}
                {activeQuestions.length > 10 && (
                  <p className="text-center text-xs text-slate-500 pt-1">
                    + {activeQuestions.length - 10} butir soal lainnya...
                  </p>
                )}
              </div>

              {/* Import Mode Options */}
              <div className="pt-3 border-t border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-300">Pilihan Penempatan:</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <label
                    onClick={() => setImportMode("append")}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === "append"
                        ? "bg-indigo-950/30 border-indigo-500/50 text-indigo-200"
                        : "bg-[#121214] border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "append"}
                      onChange={() => setImportMode("append")}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="text-white block font-semibold">
                        Tambahkan ke Soal yang Ada
                      </strong>
                      <span className="text-[11px] text-slate-400">
                        Akan ditempatkan mulai nomor #{existingQuestionsCount + 1}
                      </span>
                    </div>
                  </label>

                  <label
                    onClick={() => setImportMode("replace")}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                      importMode === "replace"
                        ? "bg-rose-950/30 border-rose-500/50 text-rose-200"
                        : "bg-[#121214] border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "replace"}
                      onChange={() => setImportMode("replace")}
                      className="mt-0.5"
                    />
                    <div>
                      <strong className="text-white block font-semibold">
                        Gantikan Seluruh Soal Lama
                      </strong>
                      <span className="text-[11px] text-slate-400">
                        Menghapus {existingQuestionsCount} butir lama & mulai dari #1
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-5 border-t border-slate-800 bg-[#161618] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
          >
            Batal
          </button>

          <button
            type="button"
            disabled={!activeQuestions || activeQuestions.length === 0}
            onClick={handleExecuteImport}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-950 flex items-center gap-2 cursor-pointer"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              Terapkan & Impor {activeQuestions?.length || 0} Butir Soal
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
