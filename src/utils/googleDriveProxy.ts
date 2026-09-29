/**
 * Google Drive Server-Side Proxy Utility
 * 
 * Exposes a clean, robust interface for fetching JSON files (exam packages, backups, questions)
 * from Google Drive using a server-side proxy strategy.
 * Completely circumvents browser CORS restrictions, cross-origin third-party cookie blocking,
 * and Google Workspace tenant firewalls on student devices (mobile phones, tablets, Chromebooks).
 */

import { ExamPackage } from "../types";

export interface ProxyRequestOptions {
  /** Optional OAuth Bearer access token if teacher is authenticated */
  accessToken?: string | null;
  /** Optional custom Google Apps Script Web App URL for official cloud proxying */
  gasUrl?: string | null;
  /** Optional exam code for matching or registry lookup */
  examCode?: string | null;
  /** Timeout in milliseconds (defaults to 15000ms) */
  timeoutMs?: number;
  /** Whether to bypass local cache and force remote fetch */
  forceRefresh?: boolean;
}

export type ProxyErrorCode =
  | "INVALID_INPUT"
  | "FILE_NOT_FOUND"
  | "CORS_BLOCKED"
  | "AUTH_REQUIRED"
  | "INVALID_JSON"
  | "NETWORK_TIMEOUT"
  | "SERVER_PROXY_ERROR"
  | "UNKNOWN_ERROR";

export interface ProxyResponse<T = any> {
  success: boolean;
  data: T | null;
  source: "cache" | "server_proxy" | "gas_proxy" | "direct_drive" | "fallback" | null;
  fileId?: string;
  errorCode?: ProxyErrorCode;
  errorMessage?: string;
  durationMs: number;
}

/**
 * Checks if a string is a Google Drive URL or direct Drive File ID
 */
export function isGoogleDriveUrlOrId(input: string): boolean {
  if (!input || typeof input !== "string") return false;
  const trimmed = input.trim();
  return (
    trimmed.includes("drive.google.com") ||
    trimmed.includes("docs.google.com") ||
    trimmed.includes("/file/d/") ||
    trimmed.includes("id=") ||
    /^[a-zA-Z0-9_-]{25,70}$/.test(trimmed)
  );
}

/**
 * Extracts the file ID from various Google Drive URL formats or raw ID string.
 */
export function extractDriveFileId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // If user pasted a folder link
  if (trimmed.includes("/folders/") || trimmed.includes("folder/")) {
    return null;
  }

  // 1. /file/d/FILE_ID
  const matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]{20,70})/i);
  if (matchFileD && matchFileD[1]) return matchFileD[1];

  // 2. [?&]id=FILE_ID
  const matchIdParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,70})/i);
  if (matchIdParam && matchIdParam[1]) return matchIdParam[1];

  // 3. /d/FILE_ID
  const matchD = trimmed.match(/\/d\/([a-zA-Z0-9_-]{20,70})/i);
  if (matchD && matchD[1]) return matchD[1];

  // 4. Raw file ID (20 to 70 alphanumeric chars)
  if (/^[a-zA-Z0-9_-]{20,70}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Safely fetches with timeout
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err: any) {
    clearTimeout(id);
    if (err?.name === "AbortError") {
      throw new Error(`Koneksi terputus: Permintaan melebihi batas waktu (${Math.round(timeoutMs / 1000)} detik).`);
    }
    throw err;
  }
}

/**
 * Fetches JSON content from Google Drive via the Server-Side Proxy strategy.
 * Designed specifically to prevent mobile browser CORS issues and Drive cookie restrictions.
 */
export async function fetchGoogleDriveJsonViaProxy<T = any>(
  fileIdOrUrl: string,
  options: ProxyRequestOptions = {}
): Promise<ProxyResponse<T>> {
  const startTime = Date.now();
  const fileId = extractDriveFileId(fileIdOrUrl);

  if (!fileId) {
    return {
      success: false,
      data: null,
      source: null,
      errorCode: "INVALID_INPUT",
      errorMessage: "Tautan atau ID File Google Drive tidak valid.",
      durationMs: Date.now() - startTime,
    };
  }

  const {
    accessToken,
    gasUrl,
    examCode,
    timeoutMs = 15000,
    forceRefresh = false,
  } = options;

  // TIER 1: Check localStorage cache (Instant & Offline) unless forceRefresh
  if (!forceRefresh && typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem(`gdrive_cache_${fileId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && (Array.isArray(parsed.questions) || parsed.id || parsed.title)) {
          return {
            success: true,
            data: parsed as T,
            source: "cache",
            fileId,
            durationMs: Date.now() - startTime,
          };
        }
      }
    } catch {}
  }

  // TIER 2: Express Node.js Server Proxy (/api/gdrive/exam/:fileId or /api/gdrive/proxy/:fileId)
  // Express server uses Node.js HTTP client which has NO CORS boundaries and follows Google redirects
  try {
    const proxyHeaders: Record<string, string> = {
      Accept: "application/json, text/plain, */*",
    };
    if (accessToken) {
      proxyHeaders.Authorization = `Bearer ${accessToken}`;
    }

    let proxyRes = await fetchWithTimeout(
      `/api/gdrive/exam/${encodeURIComponent(fileId)}`,
      { headers: proxyHeaders },
      timeoutMs
    );

    // If failed with token, retry proxy without token (handles public links)
    if (!proxyRes.ok && accessToken) {
      proxyRes = await fetchWithTimeout(
        `/api/gdrive/exam/${encodeURIComponent(fileId)}`,
        { headers: { Accept: "application/json, text/plain, */*" } },
        timeoutMs
      );
    }

    // Try fallback proxy alias route: /api/gdrive/proxy?fileId=...
    if (!proxyRes.ok) {
      proxyRes = await fetchWithTimeout(
        `/api/gdrive/proxy?fileId=${encodeURIComponent(fileId)}`,
        { headers: proxyHeaders },
        timeoutMs
      );
    }

    if (proxyRes.ok) {
      const json = await proxyRes.json();
      if (json) {
        const payload: any =
          json.exam ||
          (Array.isArray(json.questions) ? json : null) ||
          (json.item?.exam ? json.item.exam : null) ||
          (json.success && json.data ? json.data : null) ||
          json;

        if (payload && (Array.isArray(payload.questions) || payload.title || payload.id)) {
          const finalResult: any = {
            ...payload,
            gdriveFileId: fileId,
            gdriveSyncedAt: payload.gdriveSyncedAt || new Date().toISOString(),
          };

          // Cache in localStorage
          if (typeof window !== "undefined") {
            try {
              localStorage.setItem(`gdrive_cache_${fileId}`, JSON.stringify(finalResult));
              if (finalResult.code) {
                localStorage.setItem(`gdrive_code_${String(finalResult.code).toUpperCase()}`, JSON.stringify(finalResult));
              }
            } catch {}
          }

          return {
            success: true,
            data: finalResult as T,
            source: "server_proxy",
            fileId,
            durationMs: Date.now() - startTime,
          };
        }
      }
    }
  } catch (err: any) {
    console.warn(`[Proxy] Express server-side proxy failed for ${fileId}:`, err?.message);
  }

  // TIER 3: Google Apps Script Web App Cloud Proxy (CORS-friendly Web App official tunnel)
  let targetGasUrl = (gasUrl || "").trim();
  if (!targetGasUrl && typeof window !== "undefined") {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlGas = urlParams.get("gasUrl");
      if (urlGas && urlGas.startsWith("http")) {
        targetGasUrl = decodeURIComponent(urlGas).trim();
      } else {
        const storedGas = localStorage.getItem("slideexam_gas_config_v1");
        if (storedGas) {
          const parsedGas = JSON.parse(storedGas);
          if (parsedGas && parsedGas.webAppUrl) {
            targetGasUrl = parsedGas.webAppUrl.trim();
          }
        }
      }
    } catch {}
  }

  if (targetGasUrl) {
    try {
      const qCode = encodeURIComponent(examCode || "");
      const gasEndpoints = [
        `${targetGasUrl}?action=getQuestion&driveId=${encodeURIComponent(fileId)}&code=${qCode}`,
        `${targetGasUrl}?action=getExam&driveId=${encodeURIComponent(fileId)}&code=${qCode}`,
        `${targetGasUrl}?action=getQuestions&driveId=${encodeURIComponent(fileId)}&code=${qCode}`,
      ];

      for (const endpoint of gasEndpoints) {
        try {
          const gasRes = await fetchWithTimeout(
            endpoint,
            { headers: { Accept: "application/json" } },
            timeoutMs
          );

          if (gasRes.ok) {
            const gasJson = await gasRes.json();
            const candidate =
              gasJson.exam ||
              (Array.isArray(gasJson.questions) ? gasJson : null) ||
              (gasJson.success && gasJson.data ? gasJson.data : null);

            if (candidate && (Array.isArray(candidate.questions) || candidate.title)) {
              const gasResult: any = {
                ...candidate,
                gdriveFileId: fileId,
                gdriveSyncedAt: new Date().toISOString(),
              };

              if (typeof window !== "undefined") {
                try {
                  localStorage.setItem(`gdrive_cache_${fileId}`, JSON.stringify(gasResult));
                  if (gasResult.code) {
                    localStorage.setItem(`gdrive_code_${String(gasResult.code).toUpperCase()}`, JSON.stringify(gasResult));
                  }
                } catch {}
              }

              return {
                success: true,
                data: gasResult as T,
                source: "gas_proxy",
                fileId,
                durationMs: Date.now() - startTime,
              };
            }
          }
        } catch {}
      }
    } catch (gasErr: any) {
      console.warn(`[Proxy] GAS cloud proxy failed for ${fileId}:`, gasErr?.message);
    }
  }

  // TIER 4: Direct Google Drive public download endpoints (Best-effort fallback)
  const directUrls = [
    `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
    `https://docs.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`,
    `https://drive.google.com/uc?id=${encodeURIComponent(fileId)}&export=download&confirm=t`,
  ];

  for (const dUrl of directUrls) {
    try {
      const directRes = await fetchWithTimeout(dUrl, { redirect: "follow" }, 8000);
      if (directRes.ok) {
        const text = await directRes.text();
        try {
          const parsed = JSON.parse(text);
          if (parsed && (Array.isArray(parsed.questions) || parsed.title)) {
            const result: any = {
              ...parsed,
              gdriveFileId: fileId,
              gdriveSyncedAt: new Date().toISOString(),
            };

            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(`gdrive_cache_${fileId}`, JSON.stringify(result));
              } catch {}
            }

            return {
              success: true,
              data: result as T,
              source: "direct_drive",
              fileId,
              durationMs: Date.now() - startTime,
            };
          }
        } catch {
          // May be HTML virus warning page or login page
        }
      }
    } catch {}
  }

  return {
    success: false,
    data: null,
    source: null,
    fileId,
    errorCode: "SERVER_PROXY_ERROR",
    errorMessage:
      "Gagal mengunduh file Google Drive melalui server proxy dan cloud proxy. Pastikan izin berbagi file diset ke 'Siapa saja yang memiliki link'.",
    durationMs: Date.now() - startTime,
  };
}

/**
 * High-level helper specifically tailored for loading an ExamPackage from Drive via proxy.
 */
export async function fetchExamPackageViaProxy(
  fileIdOrUrl: string,
  options: ProxyRequestOptions = {}
): Promise<ExamPackage | null> {
  const res = await fetchGoogleDriveJsonViaProxy<ExamPackage>(fileIdOrUrl, options);
  if (res.success && res.data && Array.isArray(res.data.questions)) {
    return res.data;
  }
  return null;
}

/**
 * Checks server proxy health status
 */
export async function pingGoogleDriveProxy(): Promise<boolean> {
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      return data?.status === "ok";
    }
  } catch {}
  return false;
}
