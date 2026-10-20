import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import dotenv from 'dotenv';

if (!process.env.FIREBASE_PROJECT_ID) {
  dotenv.config({ path: '.env.local' });
  dotenv.config();
}

let firebaseApp = null;
let messaging = null;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (projectId && clientEmail && privateKey) {
  try {
    let formattedPrivateKey = privateKey.trim();
    if (formattedPrivateKey.startsWith('"') && formattedPrivateKey.endsWith('"')) {
      formattedPrivateKey = formattedPrivateKey.slice(1, -1);
    }
    formattedPrivateKey = formattedPrivateKey.replace(/\\n/g, '\n');

    firebaseApp = getApps().length > 0
      ? getApp()
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey: formattedPrivateKey,
          }),
        });

    messaging = getMessaging(firebaseApp);
    console.log('[Firebase] Firebase Admin SDK initialized successfully.');
  } catch (err) {
    console.error('[Firebase] Error initializing Firebase Admin:', err.message);
  }
} else {
  console.warn('[Firebase] Firebase Admin credentials missing. Push notifications will be disabled/mocked.');
}

// Backwards-compatible wrapper providing .messaging().send()
const firebaseAdmin = firebaseApp ? {
  ...firebaseApp,
  name: firebaseApp.name,
  options: firebaseApp.options,
  messaging: () => messaging,
} : null;

export { firebaseAdmin, messaging, firebaseApp };
export default firebaseAdmin;
