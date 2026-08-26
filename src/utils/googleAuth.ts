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

let isSigningIn = false;
let cachedAccessToken: string | null = null;

/**
 * Initialize auth listener
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Helper to request token via Google Identity Services (GIS) token client
 */
export const requestGoogleTokenViaGIS = (clientId: string): Promise<{ user: any; accessToken: string }> => {
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
              resolve({ user: customUser, accessToken: tokenResponse.access_token });
            } else {
              reject(new Error("Tidak menerima token akses dari Google."));
            }
          },
          error_callback: (err: any) => {
            reject(err);
          },
        });
        client.requestAccessToken({ prompt: 'select_account' });
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
      if (!credential?.accessToken) {
        throw new Error('Gagal mendapatkan token akses Google Drive. Pastikan izin telah diberikan.');
      }
      cachedAccessToken = credential.accessToken;
      return {
        user: result.user,
        accessToken: credential.accessToken,
      };
    } catch (popupErr: any) {
      const errCode = popupErr?.code || '';
      const errMsg = popupErr?.message || '';
      const isUnauth =
        errCode === 'auth/unauthorized-domain' ||
        errMsg.includes('auth/unauthorized-domain') ||
        errMsg.includes('unauthorized-domain');

      if (isUnauth && firebaseConfig.oAuthClientId) {
        try {
          return await requestGoogleTokenViaGIS(firebaseConfig.oAuthClientId);
        } catch (gisErr: any) {
          const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'domain aplikasi';
          const enhancedError = new Error(
            `Firebase: Error (auth/unauthorized-domain). Domain '${currentHost}' belum terdaftar di Firebase Authorized Domains.`
          );
          (enhancedError as any).code = 'auth/unauthorized-domain';
          (enhancedError as any).currentHost = currentHost;
          (enhancedError as any).projectId = firebaseConfig.projectId;
          throw enhancedError;
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
  cachedAccessToken = null;
  await signOut(auth);
};

export const getCachedAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getFirebaseConfigData = () => {
  return firebaseConfig;
};
