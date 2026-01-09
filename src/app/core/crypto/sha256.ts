// src/app/core/crypto/sha256.ts
export async function sha256HexFromUtf8(str: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256HexEmpty(): Promise<string> {
  // hash de empty buffer
  return sha256HexFromUtf8('');
}
