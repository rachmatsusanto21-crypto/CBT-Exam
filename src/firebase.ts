import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { initializeFirestore, getFirestore, Firestore, setLogLevel, terminate } from "firebase/firestore";
import firebaseConfigJson from "../firebase-applet-config.json";

// Matikan log internal koneksi / retry backoff Firestore di konsol
try {
  setLogLevel("silent");
} catch {}

export const firebaseConfig = {
  apiKey: firebaseConfigJson.apiKey,
  authDomain: firebaseConfigJson.authDomain,
  projectId: firebaseConfigJson.projectId,
  storageBucket: firebaseConfigJson.storageBucket,
  messagingSenderId: firebaseConfigJson.messagingSenderId,
  appId: firebaseConfigJson.appId,
};

// Inisialisasi Firebase App
export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Inisialisasi Firestore dengan Database ID Kustom Anda
export const FIRESTORE_DATABASE_ID: string =
  (firebaseConfigJson as Record<string, any>).firestoreDatabaseId ||
  "ai-studio-slideexamcbtujia-337b5171-4150-47ed-a493-fc87b19bc190";

let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(
    app,
    { databaseId: FIRESTORE_DATABASE_ID } as any,
    FIRESTORE_DATABASE_ID
  );
} catch {
  firestoreDb = getFirestore(app, FIRESTORE_DATABASE_ID);
}

export const db: Firestore = firestoreDb;

export async function terminateFirestoreInstance(): Promise<void> {
  try {
    if (firestoreDb) {
      await terminate(firestoreDb);
    }
  } catch {}
}
