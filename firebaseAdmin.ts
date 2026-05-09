import { initializeApp, cert, getApps, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";
import { RUNTIME_CONFIG } from "./runtimeConfig.ts";

let app: App;
let db: Firestore;
let auth: Auth;

function initialize() {
  if (db) return; // Already initialized

  const isEnabled = RUNTIME_CONFIG.USE_FIRESTORE;
  if (!isEnabled) {
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("[FB] Missing Firebase environment variables, Firestore will remain disabled.");
    return;
  }

  // Sanitize private key
  privateKey = privateKey.replace(/\\n/g, '\n');

  if (privateKey.length < 1000) {
    console.error("[FB CRITICAL] INVALID FIREBASE PRIVATE KEY (Too short)");
    throw new Error("INVALID FIREBASE PRIVATE KEY");
  }

  app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

  db = getFirestore(app);
  auth = getAuth(app);

  console.log("[FB DEBUG] Firebase initialized successfully");

  // Immediate Firestore Connection Test
  (async () => {
    try {
      const snap = await db.collection("brands").limit(1).get();
      console.log("[FB TEST] SUCCESS: Document count in 'brands' (limit 1):", snap.size);
    } catch (e: any) {
      console.error("[FB TEST] FAILED");
      console.error("[FB TEST] ERROR CODE:", e.code || "unknown");
      console.error("[FB TEST] ERROR MSG:", e.message);
      if (e.message?.includes("PERMISSION_DENIED")) {
        console.error("[FB DIAGNOSIS] PERMISSION_DENIED: Check IAM roles for " + clientEmail);
      }
    }
  })();
}

// Lazy initialization helpers
export const getDb = (): Firestore => {
  initialize();
  if (!db) {
    // Return a proxy or just throw a more specific "DISABLED" error if needed
    // But most callers expect a Firestore object. 
    // For now, let's throw if called when disabled, but the server.ts handles it.
    throw new Error("FIRESTORE_DISABLED");
  }
  return db;
};

export const getAuthInstance = (): Auth => {
  initialize();
  if (!auth) {
    throw new Error("AUTH_DISABLED");
  }
  return auth;
};

export { db, auth };
