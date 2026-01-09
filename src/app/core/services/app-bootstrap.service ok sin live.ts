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

  private genNonceClient(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return btoa(String.fromCharCode(...bytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // ----------------------------
  // SHA-256 HEX (WebCrypto)
  // ----------------------------
  private async sha256Hex(input: string): Promise<string> {
    const data = new TextEncoder().encode(input);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private bodyToJson(body: any): string {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    return JSON.stringify(body);
  }

  private url(path: string): string {
    return `${this.baseUrlRaw}${path.startsWith('/') ? path : '/' + path}`;
  }

  // Canonical v1 (como tu middleware)
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
    const { kid, signature } = await this.appKeys.sign(canon);

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

  // ----------------------------
  // STATUS (requiere JWT + NO X-Device-Uid)
  // ----------------------------
  async meStatus(): Promise<StatusResp> {
    const path = '/app/me/status';
    const token = await this.getAccessToken();

    // si no hay token todavía, fuerza error “autenticación” para que tu Loading haga bootstrap
    if (!token) {
      // simula un error manejable
      throw { code: 'NO_TOKEN', message: 'No access token yet' };
    }

    let headers = await this.signedHeadersBase('GET', path, null);
    headers = headers.set('Authorization', `Bearer ${token}`);

    return await firstValueFrom(this.http.get<StatusResp>(this.url(path), { headers }));
  }

  // ----------------------------
  // BOOTSTRAP (sí permite X-Device-Uid)
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
    const signed = await this.appKeys.sign(payload);

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

    // ✅ guardar token para /app/me/status
    if (res?.access_token) {
      await this.setAccessToken(res.access_token);
    }

    return res;
  }
}
