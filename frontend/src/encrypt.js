export async function encryptPayload(data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(process.env.REACT_APP_ENCRYPT_KEY),
    'AES-GCM',
    false,
    ['encrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(ct)) };
}
