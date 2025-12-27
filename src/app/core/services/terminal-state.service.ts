import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
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

  // ✅ debug visible para UI
  private _debugLines: string[] = [];
  get debugText(): string {
    return this._debugLines.join('\n');
  }
  clearDebug(): void {
    this._debugLines = [];
  }
  private dbg(line: string) {
    this._debugLines.push(line);
    // también a consola
    // eslint-disable-next-line no-console
    console.log('[TG][ENROLL]', line);
  }

  constructor(
    private http: HttpClient,
    private storage: Storage
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

  async checkTerminalStatus(_appVersion: string): Promise<TerminalStatusResult> {
    await this.storageReady;
    this.clearDebug();

    const deviceUid = await this.getDeviceUid();
    const url = `${environment.baseUrl}/enroll/status`;

    this.dbg(`baseUrl=${environment.baseUrl}`);
    this.dbg(`GET ${url}`);
    this.dbg(`X-Device-Uid=${deviceUid}`);

    const headers = new HttpHeaders({
      'X-Device-Uid': deviceUid,
      'Accept': 'application/json',
    });

    try {
      const r = await firstValueFrom(this.http.get<any>(url, { headers }));

      this.dbg(`HTTP OK`);
      this.dbg(`body.status=${String(r?.status || '')}`);
      this.dbg(`body.message=${String(r?.message || '')}`);

      if (r?.ok) {
        const s = String(r.status || '').toUpperCase();

        if (s === 'ACTIVATED') {
          await this.clearPending();
          return { deviceUid, status: 'ACTIVATED', config: null };
        }

        if (s === 'PENDING' || s === 'ALREADY_REGISTERED') {
          await this.markPending();
          return { deviceUid, status: s as TerminalStatus, config: null };
        }

        if (s === 'NOT_REGISTERED') {
          await this.clearPending();
          return { deviceUid, status: 'NOT_REGISTERED', config: null };
        }
      }

      this.dbg(`Respuesta inesperada -> ERROR`);
      return { deviceUid, status: 'ERROR', config: null };
    } catch (e: any) {
      const err = e as HttpErrorResponse;
      this.dbg(`HTTP ERROR`);
      this.dbg(`status=${err?.status}`);
      this.dbg(`message=${err?.message}`);

      // intenta imprimir body del error
      try {
        const body = err?.error;
        if (typeof body === 'string') {
          this.dbg(`errorBody=${body.slice(0, 500)}`);
        } else if (body && typeof body === 'object') {
          this.dbg(`errorBody=${JSON.stringify(body).slice(0, 800)}`);
        } else {
          this.dbg(`errorBody=<empty>`);
        }
      } catch {
        this.dbg(`errorBody=<unreadable>`);
      }

      return { deviceUid, status: 'ERROR', config: null };
    }
  }

  async createActivationRequest(payload: ActivationRequestPayload): Promise<ActivationRequestResponse> {
    await this.storageReady;
    this.clearDebug();

    const deviceUid = await this.getDeviceUid();
    const url = `${environment.baseUrl}/enroll/request`;

    this.dbg(`baseUrl=${environment.baseUrl}`);
    this.dbg(`POST ${url}`);
    this.dbg(`X-Device-Uid=${deviceUid}`);

    const headers = new HttpHeaders({
      'X-Device-Uid': deviceUid,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    });

    const body = {
      modelo: payload.modelo,
      app_version: payload.app_version,
      operator_id: payload.operator_id,
      geo_lat: payload.geo_lat,
      geo_lon: payload.geo_lon,
    };

    this.dbg(`payload=${JSON.stringify(body)}`);

    try {
      const r = await firstValueFrom(this.http.post<any>(url, body, { headers }));

      this.dbg(`HTTP OK`);
      this.dbg(`resp=${JSON.stringify(r).slice(0, 800)}`);

      // En tu API a veces regresa {ok:true,...} o 201 con otro shape.
      await this.markPending();
      return { ok: true, message: r?.message || 'Solicitud enviada.' };
    } catch (e: any) {
      const err = e as HttpErrorResponse;
      this.dbg(`HTTP ERROR`);
      this.dbg(`status=${err?.status}`);
      this.dbg(`message=${err?.message}`);

      try {
        const bodyErr = err?.error;
        if (typeof bodyErr === 'string') this.dbg(`errorBody=${bodyErr.slice(0, 500)}`);
        else if (bodyErr && typeof bodyErr === 'object') this.dbg(`errorBody=${JSON.stringify(bodyErr).slice(0, 800)}`);
        else this.dbg(`errorBody=<empty>`);
      } catch {
        this.dbg(`errorBody=<unreadable>`);
      }

      if (err?.status === 409) {
        await this.markPending();
        return { ok: false, message: 'Ya existe una solicitud registrada.' };
      }

      return { ok: false, message: err?.error?.message || 'Error al crear solicitud.' };
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
