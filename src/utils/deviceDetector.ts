/**
 * Deteksi Perangkat Unik Siswa Menggunakan navigator.userAgent dan Screen Resolution
 * Menghasilkan deviceId deterministik dan unik per perangkat siswa serta mendeteksi jenis perangkat.
 */

export interface StudentDeviceFingerprint {
  deviceId: string;
  deviceType: string;
  browser: string;
  userAgent: string;
  screenResolution: string;
  colorDepth: number;
  pixelRatio: number;
  platform: string;
  isTouch: boolean;
}

const DEVICE_STORAGE_KEY = "slideexam_student_device_id_v2";

/**
 * Menghasilkan hash numerik sederhana menjadi string heksadesimal 8 karakter
 */
function createHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, "0").toUpperCase();
}

/**
 * Deteksi human-friendly jenis perangkat siswa
 */
export function detectDeviceTypeFromUA(ua: string): string {
  if (!ua) return "Perangkat Siswa";
  if (/iPad|Tablet/i.test(ua)) return "Tablet";
  if (/Android/i.test(ua)) {
    return /Mobile/i.test(ua) ? "HP Android" : "Tablet Android";
  }
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Windows/i.test(ua)) return "Laptop / PC Windows";
  if (/Macintosh|Mac OS/i.test(ua)) return "MacBook / Mac";
  if (/CrOS/i.test(ua)) return "Chromebook";
  if (/Linux/i.test(ua)) return "Linux PC";
  return "Smartphone";
}

/**
 * Ambil sidik jari unik perangkat siswa (Device Fingerprint)
 * Mengombinasikan navigator.userAgent, screen resolution (width x height), colorDepth, pixelRatio, dan platform.
 * Disimpan di localStorage dan sessionStorage agar konsisten sepanjang sesi ujian.
 */
export function getStudentDeviceFingerprint(): StudentDeviceFingerprint {
  if (typeof window === "undefined") {
    return {
      deviceId: "DEV-SERVER-0000",
      deviceType: "Server",
      browser: "Server",
      userAgent: "",
      screenResolution: "0x0",
      colorDepth: 24,
      pixelRatio: 1,
      platform: "Server",
      isTouch: false,
    };
  }

  // 1. Ekstrak data layar dan peramban
  const ua = navigator.userAgent || "";
  const screenWidth = window.screen?.width || window.innerWidth || 0;
  const screenHeight = window.screen?.height || window.innerHeight || 0;
  const colorDepth = window.screen?.colorDepth || 24;
  const pixelRatio = Number((window.devicePixelRatio || 1).toFixed(2));
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || "Web";
  const screenResolution = `${screenWidth}x${screenHeight} (DPR ${pixelRatio})`;

  // 2. Ambil atau buat deviceId unik
  let storedDeviceId = "";
  try {
    storedDeviceId = localStorage.getItem(DEVICE_STORAGE_KEY) || sessionStorage.getItem(DEVICE_STORAGE_KEY) || "";
  } catch {}

  if (!storedDeviceId || !storedDeviceId.startsWith("DEV-")) {
    // Bangun sidik jari dari navigator.userAgent dan screen resolution
    const seed = `${ua}|${screenWidth}x${screenHeight}|${colorDepth}|${pixelRatio}|${platform}`;
    const hashHex = createHash(seed);
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    storedDeviceId = `DEV-${hashHex}-${randPart}`;

    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, storedDeviceId);
      sessionStorage.setItem(DEVICE_STORAGE_KEY, storedDeviceId);
    } catch {}
  }

  const deviceType = detectDeviceTypeFromUA(ua);

  return {
    deviceId: storedDeviceId,
    deviceType,
    browser: ua,
    userAgent: ua,
    screenResolution,
    colorDepth,
    pixelRatio,
    platform,
    isTouch,
  };
}
