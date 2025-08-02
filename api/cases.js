import admin from 'firebase-admin';
import { db } from './_firebase';
import { verify } from './_verify';

export default async function handler(req, res) {
  const user = await verify(req, res);
  if (!user) return;
  if (req.method === 'POST') {
    const { orderNo, clientName, product } = req.body;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const ref = await db.collection('cases').add({ orderNo, client: clientName, product, createdAt: now, owner: user.uid });
    const snap = await ref.get();
    return res.status(201).json({ id: ref.id, ...snap.data() });
  }
  res.setHeader('Allow','POST');
  res.status(405).end('Method Not Allowed');
}
