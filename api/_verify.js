import admin from 'firebase-admin';
export async function verify(req, res) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).end('Unauthorized');
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded;
  } catch {
    return res.status(401).end('Invalid token');
  }
}
