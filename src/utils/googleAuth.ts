/**
 * Google Authentication & Identity Service
 * Uses Google Identity Services (GIS) directly without Firebase dependencies.
 */

export interface GoogleUser {
  displayName?: string;
  email?: string;
  photoURL?: string;
  uid?: string;
}

export type User = GoogleUser;

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

const AUTH_STORAGE_KEY = "slideexam_gdrive_auth_session";
const CLIENT_ID_STORAGE_KEY = "slideexam_google_client_id";

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

type AuthStateListener = (user: GoogleUser | null, token: string | null) => void;
const authStateListeners = new Set<AuthStateListener>();

export const onGoogleAuthExpired = (cb: AuthExpiredListener) => {
  authExpiredListeners.add(cb);
  return () => {
    authExpiredListeners.delete(cb);
  };
};

export const clearAuthSession = () => {
  cachedAccessToken = null;
  cachedUser = null;
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  } catch (e) {
    console.warn("Failed clearing auth session", e);
  }
  authStateListeners.forEach((cb) => {
    try {
      cb(null, null);
    } catch {}
  });
};

export const notifyAuthExpired = () => {
  clearAuthSession();
  authExpiredListeners.forEach((cb) => {
    try {
      cb();
    } catch {}
  });
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new CustomEvent("google-drive-auth-expired"));
    } catch {}
  }
};

export const isAuthExpiredError = (error: any): boolean => {
  if (!error) return false;
  const msg = (
    typeof error === "string" ? error : error?.message || error?.error?.message || ""
  ).toLowerCase();
  const status = error?.status || error?.code || error?.statusCode || 0;
  return (
    status === 401 ||
    status === "UNAUTHENTICATED" ||
    msg.includes("invalid authentication credentials") ||
    msg.includes("unauthenticated") ||
    msg.includes("oauth 2 access token") ||
    msg.includes("login cookie") ||
    msg.includes("token expired") ||
    msg.includes("token_expired") ||
    msg.includes("invalid_token") ||
    msg.includes("auth_expired") ||
    msg.includes("unauthorized")
  );
};

export const formatGoogleAuthErrorMessage = (error: any): string => {
  if (isAuthExpiredError(error)) {
    return "Sesi login Google telah kedaluwarsa. Silakan hubungkan ulang akun Google Anda.";
  }
  const msg = error?.message || String(error);
  if (msg.includes("popup-closed-by-user") || msg.includes("access_denied")) {
    return "Jendela otorisasi Google ditutup sebelum selesai atau izin ditolak.";
  }
  if (msg.includes("popup-blocked")) {
    return "Jendela pop-up diblokir oleh browser. Harap izinkan pop-up untuk situs ini.";
  }
  return msg;
};

let cachedAccessToken: string | null = (() => {
  try {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.token && parsed.expiresAt && Date.now() < parsed.expiresAt) {
          return parsed.token;
        } else if (parsed.expiresAt && Date.now() >= parsed.expiresAt) {
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    }
  } catch (e) {
    console.warn("Could not read auth storage", e);
  }
  return null;
})();

let cachedUser: GoogleUser | null = (() => {
  try {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.token && parsed.expiresAt && Date.now() < parsed.expiresAt) {
          return parsed.user || null;
        }
      }
    }
  } catch (e) {
    console.warn("Could not read user storage", e);
  }
  return null;
})();

export const saveAuthSession = (user: GoogleUser, token: string) => {
  try {
    cachedAccessToken = token;
    cachedUser = user;
    if (typeof window !== "undefined") {
      // 50 minutes validity before refresh
      const expiresAt = Date.now() + 50 * 60 * 1000;
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ user, token, expiresAt })
      );
    }
    authStateListeners.forEach((cb) => {
      try {
        cb(user, token);
      } catch {}
    });
  } catch (e) {
    console.warn("Failed saving auth session", e);
  }
};

/**
 * Initialize auth listener
 */
export const initAuth = (
  onAuthSuccess?: (user: GoogleUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (cachedUser && cachedAccessToken) {
    if (onAuthSuccess) onAuthSuccess(cachedUser, cachedAccessToken);
  } else {
    if (onAuthFailure) onAuthFailure();
  }

  const listener: AuthStateListener = (user, token) => {
    if (user && token) {
      if (onAuthSuccess) onAuthSuccess(user, token);
    } else {
      if (onAuthFailure) onAuthFailure();
    }
  };

  authStateListeners.add(listener);
  return () => {
    authStateListeners.delete(listener);
  };
};

/**
 * Helper to dynamically load GIS script if not present
 */
const loadGISScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof (window as any).google?.accounts?.oauth2 !== 'undefined') {
      resolve();
      return;
    }
    const existing = document.getElementById('google-gis-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (err) => reject(err));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(new Error('Gagal memuat Google Identity Services script'));
    document.head.appendChild(script);
  });
};

/**
 * Get configured OAuth Client ID
 */
export const getOAuthClientId = (): string => {
  try {
    if (typeof window !== "undefined") {
      const custom = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
      if (custom) return custom;
    }
  } catch {}
  return "";
};

export const setOAuthClientId = (clientId: string): void => {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId.trim());
    }
  } catch {}
};

/**
 * Request Google Token via GIS (Google Identity Services)
 */
export const requestGoogleTokenViaGIS = async (
  clientId?: string,
  silent = false
): Promise<{ user: GoogleUser; accessToken: string }> => {
  const effectiveClientId = clientId || getOAuthClientId();
  if (!effectiveClientId) {
    throw new Error("Client ID Google belum disetel. Hubungkan akun Anda atau gunakan Google Apps Script.");
  }

  await loadGISScript();

  return new Promise((resolve, reject) => {
    try {
      const google = (window as any).google;
      const client = google.accounts.oauth2.initTokenClient({
        client_id: effectiveClientId,
        scope: DRIVE_SCOPES.join(' ') + ' email profile openid',
        callback: async (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
            let email = '';
            let name = 'Pengguna Google';
            let picture = '';

            try {
              const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
              });
              if (userInfoRes.ok) {
                const info = await userInfoRes.json();
                email = info.email || '';
                name = info.name || info.given_name || 'Pengguna Google';
                picture = info.picture || '';
              }
            } catch (err) {
              console.warn('Gagal mengambil info profil Google:', err);
            }

            const customUser: GoogleUser = {
              displayName: name,
              email: email,
              photoURL: picture,
              uid: email || "google-user-" + Date.now(),
            };
            saveAuthSession(customUser, tokenResponse.access_token);
            resolve({ user: customUser, accessToken: tokenResponse.access_token });
          } else {
            reject(new Error("Tidak menerima token akses dari Google."));
          }
        },
        error_callback: (err: any) => {
          reject(err);
        },
      });
      client.requestAccessToken({ prompt: silent ? '' : 'select_account' });
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Sign in with Google Popup and obtain access token
 */
export const googleSignIn = async (): Promise<{ user: GoogleUser; accessToken: string } | null> => {
  return await requestGoogleTokenViaGIS(undefined, false);
};

/**
 * Sign out and clear cached token
 */
export const googleSignOut = async (): Promise<void> => {
  clearAuthSession();
};

export const getCachedAccessToken = (): string | null => {
  try {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(AUTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.token && parsed.expiresAt && Date.now() < parsed.expiresAt) {
          cachedAccessToken = parsed.token;
          return parsed.token;
        } else if (parsed.expiresAt && Date.now() >= parsed.expiresAt) {
          clearAuthSession();
          return null;
        }
      }
    }
  } catch {}
  return cachedAccessToken;
};

export const getCachedUser = (): GoogleUser | null => {
  return cachedUser;
};

export const getValidDriveToken = async (interactive = false): Promise<string | null> => {
  const current = getCachedAccessToken();
  if (current) return current;
  const clientId = getOAuthClientId();
  if (clientId) {
    try {
      const res = await requestGoogleTokenViaGIS(clientId, !interactive);
      return res.accessToken;
    } catch {
      return null;
    }
  }
  return null;
};
