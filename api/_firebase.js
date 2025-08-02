import admin from 'firebase-admin';
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
    databaseURL: `https://test-250724-default-rtdb.asia-southeast1.firebasedatabase.app`
  });
}
export const db = admin.firestore();
