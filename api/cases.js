import admin from 'firebase-admin';
import { db } from './_firebase';
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { orderNo, clientName, product } = req.body;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const docRef = await db.collection('cases').add({ orderNo, client: clientName, product, createdAt: now });
    const snap = await docRef.get();
    res.status(201).json({ id: docRef.id, ...snap.data() });
  } else {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
  }
}
