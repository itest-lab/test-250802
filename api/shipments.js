import admin from 'firebase-admin';
import { db } from './_firebase';
import crypto from 'crypto';
import { verify } from './_verify';

const ENC_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
function encryptJSON(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj),'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + ct.toString('hex') + ':' + tag.toString('hex');
}

export default async function handler(req, res) {
  const user = await verify(req, res);
  if (!user) return;
  if (req.method === 'POST') {
    const { caseId, shipments } = req.body;
    const now = admin.firestore.FieldValue.serverTimestamp();
    const added = [];
    for (const s of shipments) {
      const dup = await db.collection('shipments')
        .where('caseId','==',caseId)
        .where('carrier','==',s.carrier)
        .where('trackingNo','==',s.trackingNo)
        .limit(1)
        .get();
      if (!dup.empty) continue;
      const encrypted = encryptJSON(s);
      await db.collection('shipments').add({ caseId, carrier: s.carrier, trackingNo: s.trackingNo, encryptedData: encrypted, createdAt: now, owner: user.uid });
      added.push(s);
    }
    return res.status(201).json({ added });
  }
  res.setHeader('Allow','POST');
  res.status(405).end('Method Not Allowed');
}
