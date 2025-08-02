import pako from 'pako';
export function parseZlib64(data) {
  if (!data.startsWith('ZLIB64:')) return null;
  const b64 = data.slice(7);
  const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const str = pako.inflate(bin, { to: 'string' });
  return JSON.parse(str);
}
