import admin from 'firebase-admin';

let firebaseAdmin = null;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (projectId && clientEmail && privateKey) {
  try {
    const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');
    
    firebaseAdmin = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: formattedPrivateKey,
      }),
    });
    
    console.log('[Firebase] Firebase Admin SDK initialized successfully.');
  } catch (err) {
    console.error('[Firebase] Error initializing Firebase Admin:', err.message);
  }
} else {
  console.warn('[Firebase] Firebase Admin credentials missing. Push notifications will be disabled/mocked.');
}

export { firebaseAdmin };
export default admin;
