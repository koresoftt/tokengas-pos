import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import { DeviceSessionService } from './device-session.service';
import { Device } from '@capacitor/device';
import { Storage } from '@ionic/storage-angular';

export type TerminalStatus =
  | 'ACTIVATED'
  | 'PENDING'
  | 'ALREADY_REGISTERED'
  | 'NOT_REGISTERED'
  | 'ERROR';

export interface TerminalStatusResult {
  deviceUid: string;
  status: TerminalStatus;
  config: null;
}

export interface ActivationRequestPayload {
  app_version: string;
  modelo: string;
  operator_id: string;
  geo_lat: number;
  geo_lon: number;
}

export interface ActivationRequestResponse {
  ok: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class TerminalStateService {
  private storageReady: Promise<void>;
  private readonly STORAGE_PENDING = 'tg_enroll_pending';
  private readonly STORAGE_DEVICE_UID = 'tg_device_uid';

  constructor(
    private http: HttpClient,
    private storage: Storage,
    private session: DeviceSessionService
  ) {
    this.storageReady = (this.storage as any)['create']().then(() => undefined);
  }

  async getDeviceUid(): Promise<string> {
    await this.storageReady;
    const cached = await (this.storage as any)['get'](this.STORAGE_DEVICE_UID);
    if (cached) return cached;

    const uid = (await Device.getId()).identifier || 'UNKNOWN_DEVICE';
    await (this.storage as any)['set'](this.STORAGE_DEVICE_UID, uid);
    return uid;
  }

  async checkTerminalStatus(appVersion: string): Promise<TerminalStatusResult> {
    await this.storageReady;

    const deviceUid = await this.getDeviceUid();
    const url = `${environment.baseUrl}/bff/enroll/status`;

    const call = async () => {
      const s = await this.session.ensure(appVersion);
      const headers = new HttpHeaders({ 'X-Device-Session': s });
      return await firstValueFrom(this.http.get<any>(url, { headers }));
    };

    try {
      const r = await call();

      if (r?.ok) {
        if (r.status === 'ACTIVATED') {
          await this.clearPending();
          return { deviceUid, status: 'ACTIVATED', config: null };
        }

        if (r.status === 'PENDING' || r.status === 'ALREADY_REGISTERED') {
          await this.markPending();
          return { deviceUid, status: r.status, config: null };
        }

        if (r.status === 'NOT_REGISTERED') {
          await this.clearPending();
          return { deviceUid, status: 'NOT_REGISTERED', config: null };
        }
      }

      return { deviceUid, status: 'ERROR', config: null };
    } catch (e: any) {
      if (e?.status === 401) {
        await this.session.clear();
        return this.checkTerminalStatus(appVersion); // re-login + retry
      }
      return { deviceUid, status: 'ERROR', config: null };
    }
  }

    async createActivationRequest(payload: ActivationRequestPayload): Promise<ActivationRequestResponse> {
    const url = `${environment.baseUrl}/bff/enroll/request`;

    const call = async () => {
      const s = await this.session.ensure(payload.app_version);
      const headers = new HttpHeaders({ 'X-Device-Session': s });
      return await firstValueFrom(this.http.post<any>(url, payload, { headers }));
    };

    try {
      const r = await call();
      if (r?.ok) {
        await this.markPending();
        return { ok: true, message: r.message };
      }
      return { ok: false, message: r?.message || 'Solicitud rechazada.' };
    } catch (e: any) {
      console.error('[ENROLL][REQUEST] error', {
        url,
        status: e?.status,
        error: e?.error,
        message: e?.message,
      });

      if (e?.status === 401) {
        await this.session.clear();
        return this.createActivationRequest(payload);
      }
      if (e?.status === 409) {
        await this.markPending();
        return { ok: false, message: 'Ya existe una solicitud registrada.' };
      }
      return { ok: false, message: e?.error?.message || 'Error al crear solicitud.' };
    }
  }


  async markPending() {
    await this.storageReady;
    await (this.storage as any)['set'](this.STORAGE_PENDING, true);
  }

  async clearPending() {
    await this.storageReady;
    await (this.storage as any)['remove'](this.STORAGE_PENDING);
  }

  async isEnrollPending(): Promise<boolean> {
    await this.storageReady;
    return !!(await (this.storage as any)['get'](this.STORAGE_PENDING));
  }
}
