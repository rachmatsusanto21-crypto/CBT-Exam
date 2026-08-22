import React, { useState } from "react";
import {
  Key,
  Users,
  RefreshCw,
  FileSpreadsheet,
  Printer,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  Copy,
  Check
} from "lucide-react";
import { ExamPackage, SchoolProfile, StudentTokenItem } from "../types";
import { exportTokensToExcel, printTokenCards } from "../utils/sheetExport";

interface TokenManagerProps {
  exam: ExamPackage;
  school: SchoolProfile;
  tokens: StudentTokenItem[];
  onUpdateExamToken: (newToken: string) => void;
  onUpdateTokens: (tokens: StudentTokenItem[]) => void;
}

export const TokenManager: React.FC<TokenManagerProps> = ({
  exam,
  school,
  tokens,
  onUpdateExamToken,
  onUpdateTokens,
}) => {
  const [copiedToken, setCopiedToken] = useState(false);
  const [batchClass, setBatchClass] = useState("X MIPA 1");
  const [studentNamesInput, setStudentNamesInput] = useState(
    "Ahmad Rizki Maulana\nAnisa Rahmawati\nBagas Surya Putra\nCitra Dewi Lestari\nDimas Arya Pratama\nEka Putri Handayani\nFajar Hidayat\nGita Permata Sari"
  );

  const examTokens = tokens.filter((t) => t.examCode === exam.code);

  const generateRandomTokenString = (length = 6) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let res = "";
    for (let i = 0; i < length; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  const handleGenerateNewMasterToken = () => {
    const newToken = generateRandomTokenString(6);
    onUpdateExamToken(newToken);
  };

  const handleCopyMasterToken = () => {
    navigator.clipboard.writeText(exam.sessionToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleGenerateBulkTokens = () => {
    const lines = studentNamesInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      alert("Masukkan minimal 1 nama siswa.");
      return;
    }

    const newTokens: StudentTokenItem[] = lines.map((name, idx) => {
      const nisn = "0078" + Math.floor(100000 + Math.random() * 900000);
      const studentToken = generateRandomTokenString(5);
      return {
        id: `token-${Date.now()}-${idx + 1}`,
        examCode: exam.code,
        token: studentToken,
        studentName: name,
        nisn,
        className: batchClass,
        status: "belum_mulai",
        generatedAt: new Date().toISOString(),
      };
    });

    const combined = [...tokens.filter((t) => t.examCode !== exam.code), ...examTokens, ...newTokens];
    onUpdateTokens(combined);
    alert(`Berhasil membuat ${newTokens.length} token siswa untuk kelas ${batchClass}!`);
  };

  const handleDeleteToken = (id: string) => {
    onUpdateTokens(tokens.filter((t) => t.id !== id));
  };

  const handleClearAllExamTokens = () => {
    if (confirm("Hapus seluruh daftar token siswa untuk naskah ujian ini?")) {
      onUpdateTokens(tokens.filter((t) => t.examCode !== exam.code));
    }
  };

  return (
    <div id="token-manager-view" className="space-y-6">
      {/* Top Banner: Master Exam Code & Session Token */}
      <div className="bg-[#121214] border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-lg space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-300 text-xs font-semibold">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Sistem Akses & Autentikasi CBT</span>
            </div>
            <h2 className="text-xl sm:text-3xl font-extrabold text-white">{exam.title}</h2>
            <p className="text-slate-400 text-xs">
              Mata Pelajaran: <span className="text-slate-200 font-semibold">{exam.teacherProfile.subject}</span> ({exam.questions.length} Soal, {exam.durationMinutes} Menit)
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => exportTokensToExcel(exam, examTokens, school)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-emerald-950"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export Sheets (.xlsx)</span>
            </button>
            <button
              onClick={() => printTokenCards(exam, examTokens, school)}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Cetak Kartu Login Siswa</span>
            </button>
          </div>
        </div>

        {/* Master Credentials Display */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          {/* Exam Code Card */}
          <div className="bg-[#1a1a1c] rounded-2xl p-5 border border-slate-800 space-y-2">
            <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider">
              1. Kode Naskah Soal
            </div>
            <div className="text-3xl font-black font-mono tracking-widest text-emerald-400">
              {exam.code}
            </div>
            <p className="text-[11px] text-slate-400">
              Digunakan siswa saat memilih naskah ujian pada portal CBT.
            </p>
          </div>

          {/* Master Session Token Card */}
          <div className="bg-[#1a1a1c] rounded-2xl p-5 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-400 uppercase font-semibold tracking-wider flex items-center gap-1">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>2. Token Sesi Ujian (Master Token)</span>
              </div>
              <button
                onClick={handleGenerateNewMasterToken}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer font-medium"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Rilis Token Baru</span>
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-black font-mono tracking-widest text-amber-400">
                {exam.sessionToken}
              </div>
              <button
                onClick={handleCopyMasterToken}
                className="p-2 bg-[#26262a] hover:bg-slate-700 border border-slate-700 rounded-xl text-white transition-colors cursor-pointer"
                title="Salin Token"
              >
                {copiedToken ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-300" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">
              Rilis token ini kepada siswa saat waktu pengerjaan dimulai.
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Generator & Token Roster Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bulk Generator Form */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-[#121214] rounded-2xl p-5 border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Users className="w-4 h-4 text-indigo-400" />
              <span>Generate Token Siswa Kolektif</span>
            </div>
            <p className="text-xs text-slate-400">
              Buat token ujian individual per siswa lengkap dengan NISN untuk dicetak menjadi Kartu Peserta Ujian.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Pilih / Ketik Nama Kelas</label>
                <input
                  type="text"
                  value={batchClass}
                  onChange={(e) => setBatchClass(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-semibold"
                  placeholder="Misal: X MIPA 1"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  Daftar Nama Siswa (1 Baris 1 Nama)
                </label>
                <textarea
                  rows={6}
                  value={studentNamesInput}
                  onChange={(e) => setStudentNamesInput(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-mono text-xs"
                  placeholder="Paste daftar nama siswa..."
                />
              </div>

              <button
                onClick={handleGenerateBulkTokens}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs shadow-lg shadow-indigo-950 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Generate Token untuk Kelas Ini</span>
              </button>
            </div>
          </div>
        </div>

        {/* Token Table */}
        <div className="lg:col-span-8">
          <div className="bg-[#121214] rounded-2xl border border-slate-800 shadow-sm overflow-hidden p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-sm">
                  Daftar Token Siswa Terdaftar ({examTokens.length} Siswa)
                </h3>
                <p className="text-xs text-slate-400">Token unik per peserta untuk naskah ini.</p>
              </div>

              {examTokens.length > 0 && (
                <button
                  onClick={handleClearAllExamTokens}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition-colors cursor-pointer"
                >
                  Kosongkan Daftar
                </button>
              )}
            </div>

            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-[#1a1a1c] text-slate-400 font-semibold uppercase tracking-wider sticky top-0">
                    <th className="py-2.5 px-3">No</th>
                    <th className="py-2.5 px-3">Nama Siswa</th>
                    <th className="py-2.5 px-3">NISN</th>
                    <th className="py-2.5 px-3">Kelas</th>
                    <th className="py-2.5 px-3">Token Siswa</th>
                    <th className="py-2.5 px-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                  {examTokens.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                        Belum ada token siswa yang dibuat. Gunakan form di sebelah kiri untuk generate.
                      </td>
                    </tr>
                  ) : (
                    examTokens.map((t, idx) => (
                      <tr key={t.id} className="hover:bg-[#1a1a1c]/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium text-white">{t.studentName}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">{t.nisn}</td>
                        <td className="py-2.5 px-3 font-medium text-indigo-400">{t.className}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-200 bg-[#1a1a1c] border border-slate-800 px-2 py-0.5 rounded tracking-wider">
                            {t.token}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleDeleteToken(t.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                            title="Hapus Token"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
