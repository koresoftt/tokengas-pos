import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, timeout } from 'rxjs';
import { environment } from 'src/environments/environment';
import { AppKeysService } from './app-keys.service';

// ===== Tipos de UI/estado =====
export type TxState = 'IDLE' | 'LOADING' | 'NEED_PIN' | 'AUTHORIZED' | 'ERROR' | 'TIMEOUT';

export type TxError = {
  code?: string;
  message?: string;
  http_status?: number;
  raw?: any;
};

// ===== Helpers =====
function nowEpochSec(): number {
  return Math.floor(Date.now() / 1000);
}

// nonce base64url (sin padding)
function randomNonce(bytes = 16): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  const b64 = btoa(s);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function idempotencyKey(minLen = 32): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  const b64 = btoa(s).replace(/\+/g, '').replace(/\//g, '').replace(/=+$/g, '');
  const k = `tg_${b64}`;
  return k.length >= minLen ? k.slice(0, minLen) : (k + '0'.repeat(minLen)).slice(0, minLen);
}

function operationId(): string {
  const anyCrypto: any = crypto as any;
  if (typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID();
  return `op_${idempotencyKey(32)}`;
}

async function sha256HexUtf8(text: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

function pickPathForCanonical(fullUrl: string): string {
  try {
    const u = new URL(fullUrl);
    return u.pathname; // "/app-pos/v1/preauth"
  } catch {
    return fullUrl.split('?')[0];
  }
}

@Injectable({ providedIn: 'root' })
export class AppPosService {
  /**
   * DEBUG: si true, NO firma ni calcula hash.
   * Útil para aislar si el problema es de crypto/firma o de HTTP.
   */
  private readonly DEBUG_NO_SIGN = false;

  private readonly baseUrl =
    `${((environment as any).appPosBaseUrl || 'https://api.koresoft.mx').replace(/\/+$/, '')}/app-pos/v1`;

  private readonly appId = 'tokengas-pos';

  readonly state$ = new BehaviorSubject<TxState>('IDLE');
  readonly error$ = new BehaviorSubject<TxError | null>(null);

  private readonly timeoutMsPreauth = 15000;
  private readonly timeoutMsCompletion = 20000;
  private readonly timeoutMsCancel = 15000;

  constructor(
    private http: HttpClient,
    private keys: AppKeysService,
  ) {}

  async ensureKeys(): Promise<void> {
    await this.keys.ensure();
  }

  private setError(err: TxError | null, state: TxState) {
    this.error$.next(err);
    this.state$.next(state);
  }

  private mapHttpError(e: any): TxError {
    if (e?.name === 'TimeoutError') {
      return { code: 'TIMEOUT', message: 'Tiempo de espera agotado', raw: e };
    }
    if (e instanceof HttpErrorResponse) {
      return {
        http_status: e.status,
        code: e.error?.code || e.error?.status || 'HTTP_ERROR',
        message: e.error?.message || e.message,
        raw: e.error ?? e,
      };
    }
    return { code: 'UNKNOWN_ERROR', message: String(e?.message || e), raw: e };
  }

  /**
   * Headers firmados (o modo debug sin firma)
   */
  private async buildHeaders(args: {
    method: 'POST';
    fullUrl: string;
    body: any;
    idemKey?: string;
    authorizationBearer?: string;
  }): Promise<HttpHeaders> {
    const ts = nowEpochSec();
    const nonce = randomNonce(16);
    const idem = args.idemKey || idempotencyKey(32);

    // === DEBUG: no firma ===
    if (this.DEBUG_NO_SIGN) {
      let h = new HttpHeaders()
        .set('Content-Type', 'application/json')
        .set('Idempotency-Key', idem)
        .set('X-App-Id', this.appId)
        .set('X-App-Kid', 'debug_no_sign')
        .set('X-App-Ts', String(ts))
        .set('X-App-Nonce', nonce)
        .set('X-App-SigAlg', 'ED25519')
        .set('X-App-Sign', 'debug_no_sign');

      if (args.authorizationBearer) {
        h = h.set('Authorization', `Bearer ${args.authorizationBearer}`);
      }

      console.log('[APP_POS][DEBUG_NO_SIGN] URL:', args.fullUrl);
      console.log('[APP_POS][DEBUG_NO_SIGN] BODY:', args.body);
      console.log('[APP_POS][DEBUG_NO_SIGN] IDEM:', idem);

      return h;
    }

    // === REAL: hash + canonical + firma ===
    const bodyText = args.body == null ? '' : JSON.stringify(args.body);
    const bodyHash = await sha256HexUtf8(bodyText);
    const path = pickPathForCanonical(args.fullUrl);
    const canonical = `v1|${ts}|${nonce}|${args.method}|${path}|${bodyHash}`;

    console.log('[APP_POS] URL:', args.fullUrl);
    console.log('[APP_POS] PATH:', path);
    console.log('[APP_POS] BODY_HASH:', bodyHash);
    console.log('[APP_POS] CANONICAL:', canonical);

    const signed = await this.keys.sign(canonical); // { kid, signature }

    const kid = (signed.kid || '').trim();
    const sigB64Url = (signed.signature || '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');

    if (!kid || !sigB64Url) {
      throw new Error('APP_KEYS_SIGN_FAILED');
    }

    let h = new HttpHeaders()
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idem)
      .set('X-App-Id', this.appId)
      .set('X-App-Kid', kid)
      .set('X-App-Ts', String(ts))
      .set('X-App-Nonce', nonce)
      .set('X-App-SigAlg', 'ED25519') // deja esto igual por ahora
      .set('X-App-Sign', sigB64Url);

    if (args.authorizationBearer) {
      h = h.set('Authorization', `Bearer ${args.authorizationBearer}`);
    }

    return h;
  }

  // =====================
  // PREAUTH
  // =====================
  async preauth(input: {
    terminal_id: string;
    operation_id?: string;
    primary_track: string;
    primary_pin?: string | null;
    authorization_code?: string | null;
    product_amount?: number | null;
    product_quantity?: number | null;
    [k: string]: any;
  }): Promise<{
    resp: any;
    operation_id: string;
    idemKey: string;
    tx_token?: string;
    authorization_code?: string;
    required_fields?: string[];
  }> {
    this.setError(null, 'LOADING');

    const opId = input.operation_id || operationId();
    const idemKey = idempotencyKey(32);
    const body = { ...input, operation_id: opId };

    const url = `${this.baseUrl}/preauth`;
    const headers = await this.buildHeaders({ method: 'POST', fullUrl: url, body, idemKey });

    console.log('[APP_POS] PREAUTH ->', url);

    try {
      const obs = this.http.post(url, body, { headers }).pipe(timeout(this.timeoutMsPreauth));
      const resp = await firstValueFrom(obs) as any;

      const required_fields: string[] = Array.isArray(resp?.required_fields) ? resp.required_fields : [];
      const rc = String(resp?.atio?.ResponseCode || '');

      if (required_fields.includes('primary_pin')) {
        this.setError(null, 'NEED_PIN');
      } else if (rc === '00000') {
        this.setError(null, 'AUTHORIZED');
      } else {
        this.setError(
          { code: resp?.atio?.ResponseCode, message: resp?.atio?.ResponseText, raw: resp },
          'ERROR'
        );
      }

      return {
        resp,
        operation_id: opId,
        idemKey,
        tx_token: resp?.tx_token,
        authorization_code: resp?.authorization_code,
        required_fields,
      };
    } catch (e: any) {
      console.log('[APP_POS] PREAUTH HTTP ERROR status:', e?.status);
      console.log('[APP_POS] PREAUTH HTTP ERROR message:', e?.message);
      console.log('[APP_POS] PREAUTH HTTP ERROR body:', e?.error);

      const mapped = this.mapHttpError(e);
      this.setError(mapped, mapped.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR');
      throw e;
    }
  }

  // =====================
  // COMPLETION
  // =====================
  async completion(input: {
    terminal_id: string;
    operation_id: string;
    authorization_code: string;
    product_amount?: number | null;
    product_quantity?: number | null;
    tx_token: string;
    [k: string]: any;
  }): Promise<any> {
    this.setError(null, 'LOADING');

    const { tx_token, ...body } = input;
    const idemKey = idempotencyKey(32);

    const url = `${this.baseUrl}/completion`;
    const headers = await this.buildHeaders({
      method: 'POST',
      fullUrl: url,
      body,
      idemKey,
      authorizationBearer: tx_token,
    });

    console.log('[APP_POS] COMPLETION ->', url);

    try {
      const obs = this.http.post(url, body, { headers }).pipe(timeout(this.timeoutMsCompletion));
      const resp = await firstValueFrom(obs) as any;
      this.setError(null, 'IDLE');
      return resp;
    } catch (e: any) {
      const mapped = this.mapHttpError(e);
      this.setError(mapped, mapped.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR');
      throw e;
    }
  }

  // =====================
  // CANCEL
  // =====================
  async cancel(input: {
    terminal_id: string;
    operation_id: string;
    authorization_code: string;
    tx_token: string;
    [k: string]: any;
  }): Promise<any> {
    this.setError(null, 'LOADING');

    const { tx_token, ...body } = input;
    const idemKey = idempotencyKey(32);

    const url = `${this.baseUrl}/cancel`;
    const headers = await this.buildHeaders({
      method: 'POST',
      fullUrl: url,
      body,
      idemKey,
      authorizationBearer: tx_token,
    });

    console.log('[APP_POS] CANCEL ->', url);

    try {
      const obs = this.http.post(url, body, { headers }).pipe(timeout(this.timeoutMsCancel));
      const resp = await firstValueFrom(obs) as any;
      this.setError(null, 'IDLE');
      return resp;
    } catch (e: any) {
      const mapped = this.mapHttpError(e);
      this.setError(mapped, mapped.code === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR');
      throw e;
    }
  }
}