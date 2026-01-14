// src/app/core/services/terminal-state.service.ts
import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';

import { AppBootstrapService, StatusResp } from './app-bootstrap.service';
import { DeviceSessionService } from './device-session.service';

export type TerminalStatus =
  | 'ACTIVE'
  | 'PENDING'
  | 'NOT_REGISTERED'
  | 'INACTIVE'
  | 'REJECTED'
  | 'ERROR';

export type TerminalStatusResult = { status: TerminalStatus; raw?: any };

export type ActivationRequestPayload = {
  app_version: string;
  modelo: string;
  operator_id: string;
  geo_lat: number;
  geo_lon: number;
};

type ActivationRequestResp = {
  ok: boolean;
  status?: string;
  message?: string;
  solicitud_id?: string | number;
  meta?: any;
};

const PENDING_KEY = 'tg_enroll_pending';

@Injectable({ providedIn: 'root' })
export class TerminalStateService {
  // ✅ fallback duro por si prod trae baseUrl vacío
  private baseUrlRaw = (environment.baseUrl || 'https://app-api.koresoft.mx').replace(/\/+$/, '');

  constructor(
    private bootstrap: AppBootstrapService,
    private http: HttpClient,
    private session: DeviceSessionService,
  ) {}

  async getDeviceUid(): Promise<string> {
    return this.bootstrap.getDeviceUid();
  }

  async isEnrollPending(): Promise<boolean> {
    const v = await Preferences.get({ key: PENDING_KEY });
    return v.value === '1';
  }

  async markPending(): Promise<void> {
    await Preferences.set({ key: PENDING_KEY, value: '1' });
  }

  async clearPending(): Promise<void> {
    await Preferences.remove({ key: PENDING_KEY });
  }

 async checkTerminalStatus(): Promise<TerminalStatusResult> {
  try {
    const r: StatusResp = await this.bootstrap.meStatus();
    const s = String(r?.status || '').toUpperCase();

    if (s === 'ACTIVE') return { status: 'ACTIVE', raw: r };
    if (s === 'PENDING') return { status: 'PENDING', raw: r };

    // ✅ todo lo que NO sea ACTIVE/PENDING lo tratamos como "no registrada"
    // (incluye NOT_REGISTERED, INACTIVE, REJECTED, etc.)
    return { status: 'NOT_REGISTERED', raw: r };

  } catch (e: any) {
    return { status: 'ERROR', raw: { message: e?.message || String(e), error: e } };
  }
}

async ensureAppKeys(): Promise<void> {
  await this.bootstrap.ensureKeys();
}


 async createActivationRequest(payload: ActivationRequestPayload): Promise<ActivationRequestResp> {
  console.log('[ENROLL] 1 start');
  console.log('[ENROLL] baseUrlRaw=', this.baseUrlRaw);

  const path = '/app/enroll/requests';
  const url = `${this.baseUrlRaw}${path}`;

  try {
    console.log('[ENROLL] 2 before getJwt');
    const jwt = await this.bootstrap.getJwt();
    console.log('[ENROLL] 3 after getJwt', !!jwt);

    if (!jwt) return { ok: false, message: 'NO_TOKEN' };

    console.log('[ENROLL] 4 before signedHeaders');
    let headers = await this.bootstrap.signedHeaders('POST', path, payload);
    console.log('[ENROLL] 5 after signedHeaders');

    headers = headers
      .set('Authorization', `Bearer ${jwt}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');

    console.log('[ENROLL] 6 before http.post', url);

    const resp = await firstValueFrom(
      this.http.post<ActivationRequestResp>(url, payload, { headers })
    );

    console.log('[ENROLL] 7 after http.post', resp);

    if (resp?.ok) await this.markPending();
    return resp || { ok: false, message: 'empty_response' };

  } catch (e: any) {
    console.error('[ENROLL] catch', e);
    return { ok: false, message: e?.message || 'request_failed' };
  }
}

}
