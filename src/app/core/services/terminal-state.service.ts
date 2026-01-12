import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { AppBootstrapService, StatusResp } from './app-bootstrap.service';
import { DeviceSessionService } from './device-session.service';
import { firstValueFrom } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';

export type TerminalStatus = 'ACTIVE' | 'PENDING' | 'NOT_REGISTERED' | 'ERROR';
export type TerminalStatusResult = { status: TerminalStatus; raw?: any };

// ✅ Payload que tu ActivacionPage arma hoy
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
  private baseUrlRaw = (environment.baseUrl || '').replace(/\/+$/, '');

  constructor(
    private bootstrap: AppBootstrapService,
    private http: HttpClient,
    private session: DeviceSessionService,
  ) {}

  // -----------------------------
  // UID estable (lo toma del bootstrap service)
  // -----------------------------
  async getDeviceUid(): Promise<string> {
    return this.bootstrap.getDeviceUid();
  }

  // -----------------------------
  // Pending local flag
  // -----------------------------
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

  // -----------------------------
  // Status desde backend (firma X-App-* ya la hace AppBootstrapService)
  // -----------------------------
  async checkTerminalStatus(_appVersion?: string): Promise<TerminalStatusResult> {
    try {
      const r: StatusResp = await this.bootstrap.meStatus();

      const s = String(r?.status || '').toUpperCase();
      if (s === 'ACTIVE') return { status: 'ACTIVE', raw: r };
      if (s === 'PENDING') return { status: 'PENDING', raw: r };
      if (s === 'NOT_REGISTERED') return { status: 'NOT_REGISTERED', raw: r };

      return { status: 'PENDING', raw: r };
    } catch (e: any) {
      return { status: 'ERROR', raw: { message: e?.message || String(e) } };
    }
  }

  // -----------------------------
  // Crear solicitud de activación (YA firmada Android Key)
  // -----------------------------
 async createActivationRequest(payload: ActivationRequestPayload): Promise<ActivationRequestResp> {
  try {
    const jwt = await this.bootstrap.getJwt();
    if (!jwt) return { ok: false, message: 'NO_TOKEN' };

    const path = '/app/enroll/requests';
    const url = `${this.baseUrlRaw}${path}`;

    let headers = await this.bootstrap.signedHeaders('POST', path, payload);
    headers = headers
      .set('Authorization', `Bearer ${jwt}`)
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json');

    const resp = await firstValueFrom(
      this.http.post<ActivationRequestResp>(url, payload, { headers })
    );

    if (resp?.ok) await this.markPending();
    return resp || { ok: false, message: 'empty_response' };
  } catch (e: any) {
    const msg = e?.error?.message || e?.message || 'request_failed';
    return { ok: false, message: msg };
  }
}



}
