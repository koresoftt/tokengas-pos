export async function sha256HexFromString(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bufToHex(hash);
}

export async function sha256HexFromBytes(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return bufToHex(hash);
}

function bufToHex(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out; // lowercase hex ✅
}

export function unixTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

export function makeNonce(len = 18): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  // base64url friendly
  const b64 = btoa(String.fromCharCode(...bytes));
  return b64.replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function abToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  const bin = String.fromCharCode(...bytes);
  return btoa(bin); // backend tolera base64 ✅
}
