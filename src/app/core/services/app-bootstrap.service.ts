// src/app/core/services/app-bootstrap.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';

import { AppKeysService } from 'src/app/core/security/app-keys.service';

const DEVICE_UID_KEY = 'tg_device_uid';
const ACCESS_TOKEN_KEY = 'tg_access_token';

export type StatusResp = {
  ok?: boolean;
  status: 'ACTIVE' | 'PENDING' | 'NOT_REGISTERED' | 'REJECTED';
  meta?: any;
};

type BootstrapChallengeResp = {
  ok: boolean;
  challenge_id: string;
  challenge: string; // base64
  expires_in: number;
  algo: string;
  payload_format: string;
};

export type BootstrapCompleteResp = {
  ok: boolean;
  device_uid: string;
  kid: string;
  app_id: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

@Injectable({ providedIn: 'root' })
export class AppBootstrapService {
  private baseUrlRaw = (environment.baseUrl || 'https://app-api.koresoft.mx').replace(/\/+$/, '');

  constructor(
    private http: HttpClient,
    private appKeys: AppKeysService
  ) {}

  // ----------------------------
  // Detectar LIVE reload (-l --external)
  // ----------------------------
  private isLiveReload(): boolean {
    // En -l --external tu webview carga desde https://localhost (dev server)
    try {
      const o = String(globalThis?.location?.origin || '').toLowerCase();
      return o.includes('localhost');
    } catch {
      return false;
    }
  }

  // ----------------------------
  // UID estable
  // ----------------------------
  async getDeviceUid(): Promise<string> {
    const stored = await Preferences.get({ key: DEVICE_UID_KEY });
    if (stored.value) return stored.value;

    const id = await Device.getId();
    const uid = (id.identifier || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
    const finalUid = uid || `dev${Date.now().toString(16)}`;

    await Preferences.set({ key: DEVICE_UID_KEY, value: finalUid });
    return finalUid;
  }

  // ----------------------------
  // Token JWT (del bootstrap)
  // ----------------------------
  private async getAccessToken(): Promise<string | null> {
    const v = await Preferences.get({ key: ACCESS_TOKEN_KEY });
    return v.value || null;
  }

  private async setAccessToken(token: string): Promise<void> {
    await Preferences.set({ key: ACCESS_TOKEN_KEY, value: token });
  }

  async clearAccessToken(): Promise<void> {
    await Preferences.remove({ key: ACCESS_TOKEN_KEY });
  }

  private nowSec(): number {
    return Math.floor(Date.now() / 1000);
  }

  // Nonce base64url
  private genNonceClient(): string {
    const bytes = new Uint8Array(16);

    const c = (globalThis as any).crypto;
    if (c?.getRandomValues) {
      c.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
    }

    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  private bodyToJson(body: any): string {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    return JSON.stringify(body);
  }

  private url(path: string): string {
    return `${this.baseUrlRaw}${path.startsWith('/') ? path : '/' + path}`;
  }

  // ----------------------------
  // SHA-256 HEX (subtle si existe; si no, fallback)
  // ----------------------------
  private async sha256Hex(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);

    const c = (globalThis as any).crypto;
    const subtle = c?.subtle;

    if (subtle?.digest) {
      const hash = await subtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    const hashBytes = this.sha256Fallback(data);
    return Array.from(hashBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private sha256Fallback(msg: Uint8Array): Uint8Array {
    const K = new Uint32Array([
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
    ]);

    let h0=0x6a09e667, h1=0xbb67ae85, h2=0x3c6ef372, h3=0xa54ff53a;
    let h4=0x510e527f, h5=0x9b05688c, h6=0x1f83d9ab, h7=0x5be0cd19;

    const ml = msg.length * 8;
    const withOne = new Uint8Array(msg.length + 1);
    withOne.set(msg, 0);
    withOne[msg.length] = 0x80;

    let paddedLen = withOne.length;
    while ((paddedLen % 64) !== 56) paddedLen++;

    const padded = new Uint8Array(paddedLen + 8);
    padded.set(withOne, 0);

    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, Math.floor(ml / 2**32), false);
    dv.setUint32(padded.length - 4, ml >>> 0, false);

    const w = new Uint32Array(64);
    const rotr = (x:number,n:number)=> (x>>>n) | (x<<(32-n));
    const ch = (x:number,y:number,z:number)=> (x & y) ^ (~x & z);
    const maj = (x:number,y:number,z:number)=> (x & y) ^ (x & z) ^ (y & z);
    const S0 = (x:number)=> rotr(x,2) ^ rotr(x,13) ^ rotr(x,22);
    const S1 = (x:number)=> rotr(x,6) ^ rotr(x,11) ^ rotr(x,25);
    const s0 = (x:number)=> rotr(x,7) ^ rotr(x,18) ^ (x>>>3);
    const s1 = (x:number)=> rotr(x,17) ^ rotr(x,19) ^ (x>>>10);

    for (let i = 0; i < padded.length; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t*4, false);
      for (let t = 16; t < 64; t++) w[t] = (s1(w[t-2]) + w[t-7] + s0(w[t-15]) + w[t-16]) >>> 0;

      let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;

      for (let t = 0; t < 64; t++) {
        const T1 = (h + S1(e) + ch(e,f,g) + K[t] + w[t]) >>> 0;
        const T2 = (S0(a) + maj(a,b,c)) >>> 0;
        h=g; g=f; f=e; e=(d + T1)>>>0; d=c; c=b; b=a; a=(T1 + T2)>>>0;
      }

      h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
      h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
    }

    const out = new Uint8Array(32);
    const outDv = new DataView(out.buffer);
    outDv.setUint32(0, h0, false);  outDv.setUint32(4, h1, false);
    outDv.setUint32(8, h2, false);  outDv.setUint32(12, h3, false);
    outDv.setUint32(16, h4, false); outDv.setUint32(20, h5, false);
    outDv.setUint32(24, h6, false); outDv.setUint32(28, h7, false);
    return out;
  }

  // Canonical v1: v1|ts|nonce|METHOD|/path|sha256(bodyJson)
  private async canonical(method: string, path: string, ts: number, nonce: string, body: any): Promise<string> {
    const bodyJson = this.bodyToJson(body);
    const bodyHash = await this.sha256Hex(bodyJson);
    return `v1|${ts}|${nonce}|${method.toUpperCase()}|${path}|${bodyHash}`;
  }

  // Firma base (X-App-*)
  private async signedHeadersBase(method: string, path: string, body: any): Promise<HttpHeaders> {
    const ts = this.nowSec();
    const nonce = this.genNonceClient();

    const canon = await this.canonical(method, path, ts, nonce, body);
    const { kid, signature } = await this.withTimeout(
  this.appKeys.sign(canon),
  6000,
  'APPKEYS_SIGN_TIMEOUT'
);


    return new HttpHeaders({
      'Content-Type': 'application/json',
      'X-App-Id': 'tokengas-pos',
      'X-App-Kid': kid,
      'X-App-Ts': String(ts),
      'X-App-Nonce': nonce,
      'X-App-SigAlg': 'ES256',
      'X-App-Sign': signature,
    });
  }

  // ✅ público
  async signedHeaders(method: string, path: string, body: any): Promise<HttpHeaders> {
    return this.signedHeadersBase(method, path, body);
  }

  async getJwt(): Promise<string | null> {
    return this.getAccessToken();
  }

  // ----------------------------
// STATUS: requiere JWT
// ----------------------------
async meStatus(): Promise<StatusResp> {
  const path = '/app/me/status';

  const token = await this.getAccessToken();
  if (!token) throw { code: 'NO_TOKEN', message: 'No access token yet' };

  let headers = await this.signedHeadersBase('GET', path, null);
  headers = headers.set('Authorization', `Bearer ${token}`);

  try {
    return await firstValueFrom(
      this.http.get<StatusResp>(this.url(path), { headers })
    );
  } catch (e: any) {
    const code = String(
      e?.error?.code ||
      e?.error?.error?.code ||
      e?.error?.error ||
      e?.error?.message ||
      ''
    ).toUpperCase();

    // ✅ Solo borrar token cuando realmente es token inválido / no autorizado
    // 401 casi siempre significa token inválido/expirado
    if (e?.status === 401) {
      await this.clearAccessToken();
    }

    // 403 NO siempre es token inválido (puede ser firma/headers/appSig)
    // Solo limpia si el backend lo marca explícitamente como token inválido
    if (e?.status === 403) {
      if (
        code.includes('INVALID_TOKEN') ||
        code.includes('MISSING_BEARER') ||
        code.includes('INVALID_SCOPE')
      ) {
        await this.clearAccessToken();
      }
    }

    throw e;
  }
}
async ensureKeys(): Promise<void> {
  await this.appKeys.ensure();
}

private async withTimeout<T>(p: Promise<T>, ms = 6000, tag = 'timeout'): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(tag)), ms)),
  ]);
}

  // ----------------------------
  // BOOTSTRAP: sí permite X-Device-Uid y no usa JWT
  // ----------------------------
  async bootstrap(opts?: { app_id?: string; app_version?: string; modelo?: string }): Promise<BootstrapCompleteResp> {
    const deviceUid = await this.getDeviceUid();
    await this.appKeys.ensure();

    const app_id = (opts?.app_id || 'tokengas-pos').trim();

    // 1) challenge
    const nonce_client = this.genNonceClient();
    const challengePath = '/app/bootstrap/challenge';
    const challengeBody = { device_uid: deviceUid, nonce_client };

    let h1 = await this.signedHeadersBase('POST', challengePath, challengeBody);
    h1 = h1.set('X-Device-Uid', deviceUid); // ✅ SOLO bootstrap

    const challenge = await firstValueFrom(
      this.http.post<BootstrapChallengeResp>(this.url(challengePath), challengeBody, { headers: h1 })
    );

    // 2) complete
    const payload = `${challenge.challenge_id}|${challenge.challenge}|${deviceUid}|${nonce_client}`;
    const signed = await this.withTimeout(
  this.appKeys.sign(payload),
  6000,
  'APPKEYS_SIGN_TIMEOUT_BOOTSTRAP'
);


    const completePath = '/app/bootstrap/complete';
    const completeBody = {
      challenge_id: challenge.challenge_id,
      device_uid: deviceUid,
      kid: signed.kid,
      app_id,
      public_key_pem: await this.appKeys.getPublicKeyPem(),
      signature_b64: signed.signature,
      modelo: opts?.modelo || null,
      app_version: opts?.app_version || null,
    };

    let h2 = await this.signedHeadersBase('POST', completePath, completeBody);
    h2 = h2.set('X-Device-Uid', deviceUid); // ✅ SOLO bootstrap

    const res = await firstValueFrom(
      this.http.post<BootstrapCompleteResp>(this.url(completePath), completeBody, { headers: h2 })
    );

    if (res?.access_token) {
      await this.setAccessToken(res.access_token);
    }

    return res;
  }
}
