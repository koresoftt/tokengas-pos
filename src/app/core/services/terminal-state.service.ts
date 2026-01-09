import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

import { AppBootstrapService, StatusResp } from './app-bootstrap.service';
import { DeviceSessionService } from './device-session.service';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
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
  private baseUrlRaw = (environment.baseUrl || 'https://app-api.koresoft.mx').replace(/\/+$/, '');

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
  // Crear solicitud de activación (tu flujo actual)
  // -----------------------------
  async createActivationRequest(payload: ActivationRequestPayload): Promise<ActivationRequestResp> {
    try {
      // Asegura sesión device (si tu backend la usa aquí)
      const bearer = await this.session.ensure(payload.app_version);

      const url = `${this.baseUrlRaw}/enroll/requests`;

      const resp = await firstValueFrom(
        this.http.post<ActivationRequestResp>(
          url,
          payload,
          {
            headers: {
              Authorization: `Bearer ${bearer}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            }
          }
        )
      );

      if (resp?.ok) {
        await this.markPending();
      }

      return resp || { ok: false, message: 'empty_response' };
    } catch (e: any) {
      const msg = e?.error?.message || e?.message || 'request_failed';

      // Si el backend responde algo tipo 409 o “ya existe”, marcamos pending para UX
      const statusCode = e?.status || e?.error?.status;
      if (statusCode === 409) {
        await this.markPending();
        return { ok: false, message: 'Ya existe una solicitud registrada.' };
      }

      return { ok: false, message: msg };
    }
  }
}
