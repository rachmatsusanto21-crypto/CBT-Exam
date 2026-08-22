import React, { useState, useRef } from "react";
import {
  Building2,
  Printer,
  FileText,
  Save,
  CheckCircle2,
  Image as ImageIcon,
  UserCheck,
  Eye,
  Sliders,
  Upload,
  Trash2,
  Link as LinkIcon,
  Code,
  Edit3
} from "lucide-react";
import { ExamPackage, SchoolProfile } from "../types";
import { printExamToDocsFormat } from "../utils/sheetExport";

interface SchoolProfileAndPrintViewProps {
  school: SchoolProfile;
  activeExam: ExamPackage;
  onUpdateSchool: (updated: SchoolProfile) => void;
  onUpdateExam: (updated: ExamPackage) => void;
}

export const SchoolProfileAndPrintView: React.FC<SchoolProfileAndPrintViewProps> = ({
  school,
  activeExam,
  onUpdateSchool,
  onUpdateExam,
}) => {
  const [profile, setProfile] = useState<SchoolProfile>({ ...school });
  const [teacher, setTeacher] = useState({ ...activeExam.teacherProfile });
  const [examCode, setExamCode] = useState(activeExam.code);
  const [examTitle, setExamTitle] = useState(activeExam.title);
  const [isSaved, setIsSaved] = useState(false);
  const [kopTab, setKopTab] = useState<"upload" | "url">("upload");
  const [kopUrlInput, setKopUrlInput] = useState(profile.kopSuratUrl || "");
  const [kopError, setKopError] = useState<string | null>(null);
  const kopFileInputRef = useRef<HTMLInputElement>(null);

  // Print options
  const [includeAnswerKey, setIncludeAnswerKey] = useState(false);

  const handleSaveAll = () => {
    onUpdateSchool(profile);
    onUpdateExam({
      ...activeExam,
      code: examCode.trim().toUpperCase(),
      title: examTitle.trim(),
      schoolProfile: profile,
      teacherProfile: teacher,
      updatedAt: new Date().toISOString(),
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleKopFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    if (!file.type.startsWith("image/")) {
      setKopError("File harus berupa gambar (JPG, PNG, WebP, SVG).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setKopError("Ukuran file gambar kop maksimal 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setProfile((prev) => ({ ...prev, kopSuratUrl: base64 }));
      setKopError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyKopUrl = () => {
    if (!kopUrlInput.trim()) {
      setKopError("Masukkan tautan URL gambar kop surat yang valid.");
      return;
    }
    setProfile((prev) => ({ ...prev, kopSuratUrl: kopUrlInput.trim() }));
    setKopError(null);
  };

  const handleRemoveKop = () => {
    setProfile((prev) => ({ ...prev, kopSuratUrl: undefined }));
    setKopUrlInput("");
    setKopError(null);
  };

  const handlePrintExam = () => {
    const updatedExam: ExamPackage = {
      ...activeExam,
      code: examCode.trim().toUpperCase(),
      title: examTitle.trim(),
      schoolProfile: profile,
      teacherProfile: teacher,
    };
    printExamToDocsFormat(updatedExam, profile, { includeAnswerKey });
  };

  return (
    <div id="school-profile-and-print-view" className="space-y-6">
      {/* Top Banner */}
      <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 font-medium text-xs">
            <Building2 className="w-4 h-4" />
            <span>Kop Surat Resmi & Naskah Cetak Docs</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">Profil Sekolah & Cetak Soal</h2>
          <p className="text-xs text-slate-400 mt-1">
            Atur identitas lembaga, unggah kop surat resmi sekolah, dan cetak naskah soal berstandar dokumen resmi.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="print-exam-docs-btn"
            onClick={handlePrintExam}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1a1a1c] hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-sm"
          >
            <Printer className="w-4 h-4 text-indigo-400" />
            <span>Cetak Naskah Soal (Docs)</span>
          </button>
          <button
            onClick={handleSaveAll}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-lg shadow-indigo-950"
          >
            <Save className="w-4 h-4" />
            <span>{isSaved ? "Tersimpan!" : "Simpan Profil & Kode"}</span>
          </button>
        </div>
      </div>

      {/* Live Preview Kop Surat Box */}
      <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-1.5 text-slate-300">
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
            <span>Preview Kop Surat {profile.kopSuratUrl ? "Resmi (Gambar Banner)" : "Standar (Teks & Logo)"}</span>
          </span>
          {profile.kopSuratUrl ? (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              ✓ Menggunakan Gambar Kop Unggahan
            </span>
          ) : (
            <span className="text-[11px] text-slate-400 font-medium">Format Teks & Logo Bawaan</span>
          )}
        </div>

        {/* Formatted Kop Surat Preview */}
        {profile.kopSuratUrl ? (
          <div className="p-4 bg-white rounded-xl border border-slate-700 max-w-3xl mx-auto flex flex-col items-center justify-center">
            <img
              src={profile.kopSuratUrl}
              alt="Kop Surat Resmi Sekolah"
              className="w-full max-h-32 object-contain"
            />
          </div>
        ) : (
          <div className="p-6 bg-slate-900/80 rounded-xl border border-slate-800 max-w-3xl mx-auto flex items-center justify-between gap-4 text-center">
            {profile.logoLeftUrl && (
              <img
                src={profile.logoLeftUrl}
                alt="Logo Kiri"
                className="w-16 h-16 object-contain shrink-0"
              />
            )}

            <div className="flex-1 space-y-0.5">
              <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                {profile.agencyName}
              </div>
              <div className="text-lg font-black uppercase text-white tracking-wide">
                {profile.schoolName}
              </div>
              <div className="text-[11px] text-slate-300">
                NPSN: {profile.npsn} • {profile.address}
              </div>
              <div className="text-[10px] text-slate-500">
                Telp: {profile.phone || "-"} • Email: {profile.email || "-"} • Web: {profile.website || "-"}
              </div>
            </div>

            {profile.logoRightUrl && (
              <img
                src={profile.logoRightUrl}
                alt="Logo Kanan"
                className="w-16 h-16 object-contain shrink-0 rounded-full"
              />
            )}
          </div>
        )}
        <div className="w-full max-w-3xl mx-auto border-b-2 border-slate-700 -mt-2" />
        <div className="w-full max-w-3xl mx-auto border-b border-slate-700 -mt-3" />
      </div>

      {/* Editor Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: School Profile Form & Kop Upload */}
        <div className="space-y-6">
          {/* Official Kop Upload Card */}
          <div className="bg-[#121214] rounded-2xl p-6 border border-indigo-500/30 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                <span>Unggah Gambar Kop Surat Sekolah Lengkap</span>
              </div>
              {profile.kopSuratUrl && (
                <button
                  onClick={handleRemoveKop}
                  className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Kop</span>
                </button>
              )}
            </div>

            <p className="text-xs text-slate-400">
              Bila gambar kop surat resmi sekolah diunggah, maka secara otomatis akan menggantikan kop teks dan logo buatan aplikasi pada cetak naskah soal dan dokumen ujian.
            </p>

            {/* Upload Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
              <button
                type="button"
                onClick={() => setKopTab("upload")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  kopTab === "upload"
                    ? "bg-indigo-600 text-white"
                    : "bg-[#1a1a1c] text-slate-400 hover:text-slate-200"
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Unggah Berkas Gambar</span>
              </button>
              <button
                type="button"
                onClick={() => setKopTab("url")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  kopTab === "url"
                    ? "bg-indigo-600 text-white"
                    : "bg-[#1a1a1c] text-slate-400 hover:text-slate-200"
                }`}
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>Tautan / Link URL</span>
              </button>
            </div>

            {kopTab === "upload" && (
              <div className="space-y-3">
                <input
                  type="file"
                  ref={kopFileInputRef}
                  onChange={handleKopFileUpload}
                  accept="image/png, image/jpeg, image/webp, image/svg+xml"
                  className="hidden"
                />
                <div
                  onClick={() => kopFileInputRef.current?.click()}
                  className="p-5 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl text-center cursor-pointer transition-all bg-[#161618] hover:bg-[#1a1a1e] space-y-2"
                >
                  <Upload className="w-6 h-6 text-indigo-400 mx-auto" />
                  <div className="text-xs font-bold text-slate-200">
                    Klik untuk memilih berkas gambar kop surat sekolah
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Format PNG, JPG, WebP, atau SVG (Maks. 5 MB). Dianjurkan rasio lebar (misal 1200x250 px).
                  </div>
                </div>
              </div>
            )}

            {kopTab === "url" && (
              <div className="flex gap-2">
                <input
                  type="url"
                  value={kopUrlInput}
                  onChange={(e) => setKopUrlInput(e.target.value)}
                  placeholder="https://sekolah.sch.id/kop-surat-resmi.png"
                  className="flex-1 px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 text-xs focus:border-indigo-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleApplyKopUrl}
                  className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Terapkan
                </button>
              </div>
            )}

            {kopError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs">
                {kopError}
              </div>
            )}
          </div>

          {/* School Profile Form */}
          <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <span>Identitas Lembaga & Kop Teks</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Nama Instansi / Dinas Pembina</label>
                <input
                  type="text"
                  value={profile.agencyName}
                  onChange={(e) => setProfile({ ...profile, agencyName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Nama Sekolah Lengkap</label>
                <input
                  type="text"
                  value={profile.schoolName}
                  onChange={(e) => setProfile({ ...profile, schoolName: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">NPSN</label>
                  <input
                    type="text"
                    value={profile.npsn}
                    onChange={(e) => setProfile({ ...profile, npsn: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Telepon / Kontak</label>
                  <input
                    type="text"
                    value={profile.phone || ""}
                    onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Alamat Lengkap</label>
                <input
                  type="text"
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Email Sekolah</label>
                  <input
                    type="email"
                    value={profile.email || ""}
                    onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Website Resmi</label>
                  <input
                    type="text"
                    value={profile.website || ""}
                    onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Motto / Slogan Sekolah (Muncul di Slide 1)</label>
                <input
                  type="text"
                  value={profile.motto || ""}
                  onChange={(e) => setProfile({ ...profile, motto: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none italic"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">URL Logo Kiri (Dinas/Tut Wuri)</label>
                  <input
                    type="text"
                    value={profile.logoLeftUrl || ""}
                    onChange={(e) => setProfile({ ...profile, logoLeftUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 text-[11px] focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">URL Logo Kanan (Sekolah)</label>
                  <input
                    type="text"
                    value={profile.logoRightUrl || ""}
                    onChange={(e) => setProfile({ ...profile, logoRightUrl: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 text-[11px] focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Exam Code, Teacher, & Print Config */}
        <div className="space-y-6">
          {/* Exam Code & Details Card */}
          <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Code className="w-4 h-4 text-emerald-400" />
              <span>Kode Naskah Soal & Identitas Ujian</span>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Kode Naskah Soal</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={examCode}
                    onChange={(e) => setExamCode(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-emerald-400 focus:border-emerald-500 focus:outline-none font-mono font-bold text-sm tracking-wider uppercase"
                    placeholder="Misal: MAT-XII-2026"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Kode ini dipakai siswa dan sistem token untuk mengakses naskah ujian ini.
                </p>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Judul Naskah Ujian</label>
                <input
                  type="text"
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-bold"
                />
              </div>
            </div>
          </div>

          {/* Teacher & Principal Card */}
          <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Pimpinan & Guru Pengampu</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Nama Kepala Sekolah</label>
                  <input
                    type="text"
                    value={profile.principalName}
                    onChange={(e) => setProfile({ ...profile, principalName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">NIP Kepala Sekolah</label>
                  <input
                    type="text"
                    value={profile.principalNIP}
                    onChange={(e) => setProfile({ ...profile, principalNIP: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Nama Guru Pengampu</label>
                  <input
                    type="text"
                    value={teacher.teacherName}
                    onChange={(e) => setTeacher({ ...teacher, teacherName: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">NIP Guru Pengampu</label>
                  <input
                    type="text"
                    value={teacher.teacherNIP || ""}
                    onChange={(e) => setTeacher({ ...teacher, teacherNIP: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Mata Pelajaran</label>
                  <input
                    type="text"
                    value={teacher.subject}
                    onChange={(e) => setTeacher({ ...teacher, subject: e.target.value })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">KKM Kelulusan</label>
                  <input
                    type="number"
                    value={teacher.passingGrade}
                    onChange={(e) => setTeacher({ ...teacher, passingGrade: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-bold text-emerald-400"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-300 mb-1">Alokasi Menit</label>
                  <input
                    type="number"
                    value={activeExam.durationMinutes}
                    onChange={(e) =>
                      onUpdateExam({ ...activeExam, durationMinutes: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[#1a1a1c] border border-slate-800 rounded-lg text-slate-200 focus:border-indigo-500 focus:outline-none font-bold text-indigo-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Docs Print Setting */}
          <div className="bg-[#121214] rounded-2xl p-6 border border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center gap-2 font-bold text-white text-sm">
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Opsi Pencetakan Naskah Soal Docs</span>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAnswerKey}
                  onChange={(e) => setIncludeAnswerKey(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-[#1a1a1c] border-slate-700"
                />
                <span>Sertakan Lembar Kunci Jawaban & Pembahasan Guru di Akhir Dokumen</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
