import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach((scope) => {
  provider.addScope(scope);
});
provider.setCustomParameters({
  prompt: 'select_account',
});

const AUTH_STORAGE_KEY = "slideexam_gdrive_auth_session";

let isSigningIn = false;

type AuthExpiredListener = () => void;
const authExpiredListeners = new Set<AuthExpiredListener>();

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
    return "Sesi login Google Drive telah kedaluwarsa. Silakan hubungkan ulang akun Google Anda untuk memperbarui izin akses.";
  }
  const msg = error?.message || String(error);
  if (msg.includes("popup-closed-by-user")) {
    return "Jendela login Google ditutup sebelum selesai. Silakan coba lagi.";
  }
  if (msg.includes("popup-blocked")) {
    return "Jendela pop-up diblokir oleh browser. Harap izinkan pop-up untuk situs ini.";
  }
  if (msg.includes("unauthorized-domain")) {
    return "Domain ini belum diotorisasi di Firebase. Sistem beralih ke Google Identity Services.";
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
          // Token expired, clear it
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    }
  } catch (e) {
    console.warn("Could not read auth storage", e);
  }
  return null;
})();

let cachedUser: any | null = (() => {
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

const saveAuthSession = (user: any, token: string) => {
  try {
    cachedAccessToken = token;
    cachedUser = user;
    if (typeof window !== "undefined") {
      // 50 minutes validity before refresh (Google tokens expire in 60 minutes)
      const expiresAt = Date.now() + 50 * 60 * 1000;
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ user, token, expiresAt })
      );
    }
  } catch (e) {
    console.warn("Failed saving auth session", e);
  }
};

/**
 * Initialize auth listener
 */
export const initAuth = (
  onAuthSuccess?: (user: User | any, token: string) => void,
  onAuthFailure?: () => void
) => {
  // If we have cached session on start, notify listener immediately
  if (cachedUser && cachedAccessToken) {
    if (onAuthSuccess) onAuthSuccess(cachedUser, cachedAccessToken);
  }

  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        saveAuthSession(user, cachedAccessToken);
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (cachedUser && cachedAccessToken) {
          if (onAuthSuccess) onAuthSuccess(cachedUser, cachedAccessToken);
        } else if (onAuthFailure) {
          onAuthFailure();
        }
      }
    } else {
      if (!cachedAccessToken) {
        if (onAuthFailure) onAuthFailure();
      } else if (cachedUser && onAuthSuccess) {
        onAuthSuccess(cachedUser, cachedAccessToken);
      }
    }
  });
};

/**
 * Helper to request token via Google Identity Services (GIS) token client
 */
export const requestGoogleTokenViaGIS = (clientId: string, silent = false): Promise<{ user: any; accessToken: string }> => {
  return new Promise((resolve, reject) => {
    const loadGsi = () => {
      if ((window as any).google?.accounts?.oauth2) {
        return Promise.resolve();
      }
      return new Promise<void>((res, rej) => {
        const id = 'google-gsi-client-script';
        if (document.getElementById(id)) {
          setTimeout(() => res(), 300);
          return;
        }
        const s = document.createElement('script');
        s.id = id;
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = () => res();
        s.onerror = () => rej(new Error('Gagal memuat script Google Identity Services.'));
        document.head.appendChild(s);
      });
    };

    loadGsi().then(() => {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
          callback: async (tokenResponse: any) => {
            if (tokenResponse.error) {
              reject(new Error(tokenResponse.error_description || tokenResponse.error));
              return;
            }
            if (tokenResponse.access_token) {
              cachedAccessToken = tokenResponse.access_token;
              let displayName = "Pengguna Google";
              let email = "";
              let photoURL = "";
              try {
                const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                if (userRes.ok) {
                  const userData = await userRes.json();
                  displayName = userData.name || userData.email || displayName;
                  email = userData.email || "";
                  photoURL = userData.picture || "";
                }
              } catch (e) {
                console.warn("Could not fetch user info via access token", e);
              }
              const customUser = {
                displayName,
                email,
                photoURL,
                uid: email || "gis-user-" + Date.now(),
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
    }).catch(reject);
  });
};

/**
 * Sign in with Google Popup and obtain access token for Google Drive
 */
export const googleSignIn = async (): Promise<{ user: User | any; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        saveAuthSession(result.user, credential.accessToken);
        return {
          user: result.user,
          accessToken: credential.accessToken,
        };
      }
      // If Firebase popup succeeded but accessToken was not returned, fallback to GIS
      if (firebaseConfig.oAuthClientId) {
        const gisResult = await requestGoogleTokenViaGIS(firebaseConfig.oAuthClientId, false);
        return gisResult;
      }
      throw new Error('Gagal mendapatkan token akses Google Drive. Pastikan izin telah diberikan.');
    } catch (popupErr: any) {
      const errCode = popupErr?.code || '';
      const errMsg = popupErr?.message || '';
      const isUnauth =
        errCode === 'auth/unauthorized-domain' ||
        errMsg.includes('auth/unauthorized-domain') ||
        errMsg.includes('unauthorized-domain') ||
        errCode === 'auth/popup-blocked' ||
        errMsg.includes('popup-blocked');

      if (firebaseConfig.oAuthClientId) {
        try {
          return await requestGoogleTokenViaGIS(firebaseConfig.oAuthClientId, false);
        } catch (gisErr: any) {
          if (isUnauth) {
            const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'domain aplikasi';
            const enhancedError = new Error(
              `Domain '${currentHost}' belum terdaftar di Firebase Authorized Domains atau izin GIS ditolak.`
            );
            (enhancedError as any).code = 'auth/unauthorized-domain';
            (enhancedError as any).currentHost = currentHost;
            (enhancedError as any).projectId = firebaseConfig.projectId;
            throw enhancedError;
          }
          throw gisErr;
        }
      }
      throw popupErr;
    }
  } catch (error: any) {
    console.error('Google Sign In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Sign out and clear cached token
 */
export const googleSignOut = async (): Promise<void> => {
  clearAuthSession();
  await signOut(auth);
};

export const getCachedAccessToken = (): string | null => {
  // Re-verify expiration
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

export const getCachedUser = (): any | null => {
  return cachedUser;
};

export const getValidDriveToken = async (interactive = false): Promise<string | null> => {
  const current = getCachedAccessToken();
  if (current) return current;
  if (firebaseConfig.oAuthClientId) {
    try {
      const res = await requestGoogleTokenViaGIS(firebaseConfig.oAuthClientId, !interactive);
      return res.accessToken;
    } catch {
      return null;
    }
  }
  return null;
};

export const getFirebaseConfigData = () => {
  return firebaseConfig;
};
