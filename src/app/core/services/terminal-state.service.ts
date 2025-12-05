import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Storage } from '@ionic/storage-angular';
import { Device } from '@capacitor/device';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

// ============= TIPOS Y INTERFACES =============

export type TerminalStatus = 'ACTIVE' | 'NOT_REGISTERED' | 'UNKNOWN';

export interface MerchantInfo {
  id: string;
  code: string;
  name: string;
}

export interface SiteInfo {
  id: string;
  code: string;
  name: string;
}

export interface GeoInfo {
  lat: number;
  lon: number;
}

export interface TerminalConfig {
  deviceUid: string;
  descripcion: string;
  networkCode: string;
  merchant: MerchantInfo;
  site: SiteInfo;
  modelo: string;
  appVersion: string;
  operatorId: string;
  geo: GeoInfo;
}

export interface BffTerminalStatusResponse {
  ok: boolean;
  status: 'ACTIVE' | 'NOT_REGISTERED';
  terminal?: {
    device_uid: string;
    descripcion: string;
    networkCode: string;
    merchant: MerchantInfo;
    site: SiteInfo;
    modelo: string;
    appVersion: string;
    operatorId: string;
    geo: GeoInfo;
  };
}

export interface TerminalStatusResult {
  deviceUid: string;
  status: TerminalStatus;
  config: TerminalConfig | null;
}

export interface ActivationRequestPayload {
  device_uid: string;
  stationName: string;
  modelo: string;
  platform: string;
  osVersion: string;
  geo_lat: number;
  geo_lon: number;
}

export interface ActivationRequestResponse {
  ok: boolean;
  solicitudId?: string;
  message?: string;
}

// ============= SERVICIO =============

@Injectable({
  providedIn: 'root',
})
export class TerminalStateService {
  private storageReady: Promise<void>;

  private readonly STORAGE_DEVICE_UID = 'tg_device_uid';
  private readonly STORAGE_TERMINAL_CONFIG = 'tg_terminal_config';
  private readonly STORAGE_ENROLL_PENDING = 'tg_enroll_pending';

  constructor(
    private http: HttpClient,
    private storage: Storage
  ) {
    this.storageReady = this.storage.create().then(() => undefined);
  }

  // ========== DEVICE UID ==========
  async getDeviceUid(): Promise<string> {
    await this.storageReady;

    const cached = await this.storage.get(this.STORAGE_DEVICE_UID);
    if (cached) return cached;

    const info = await Device.getId();
    const uid = info.identifier || 'UNKNOWN_DEVICE';

    await this.storage.set(this.STORAGE_DEVICE_UID, uid);
    return uid;
  }

  // ========== ESTADO DE TERMINAL ==========
  /**
   * Verifica si la terminal está activa usando el BFF:
   * GET {bffBaseUrl}/terminales/by-device/:device_uid/status
   */
  async checkTerminalStatus(): Promise<TerminalStatusResult> {
  await this.storageReady;

  const deviceUid = await this.getDeviceUid();
  const url = `${environment.bffBaseUrl}/terminales/by-device/${deviceUid}/status`;

  console.log('[TG] checkTerminalStatus → URL', url);

  try {
    const resp = await firstValueFrom(
      this.http.get<BffTerminalStatusResponse>(url)
    );

    console.log('[TG] checkTerminalStatus → resp', resp);

    if (resp.ok && resp.status === 'ACTIVE' && resp.terminal) {
      const t = resp.terminal;

      const config: TerminalConfig = {
        deviceUid: t.device_uid,
        descripcion: t.descripcion,
        networkCode: t.networkCode,
        merchant: t.merchant,
        site: t.site,
        modelo: t.modelo,
        appVersion: t.appVersion,
        operatorId: t.operatorId,
        geo: t.geo,
      };

      await this.saveTerminalConfig(config);
      await this.clearEnrollPending();

      return { deviceUid, status: 'ACTIVE', config };
    }

    // Si no vino ACTIVE con terminal, lo tratamos como UNKNOWN
    return { deviceUid, status: 'UNKNOWN', config: null };

  } catch (err: any) {
    console.error('[TG] checkTerminalStatus → ERROR', err);

    // Error de red / TLS / sin conexión
    if (err.status === 0) {
      return { deviceUid, status: 'UNKNOWN', config: null };
    }

    // Cualquier 404 del BFF se interpreta como NO REGISTRADA
    if (err.status === 404) {
      return { deviceUid, status: 'NOT_REGISTERED', config: null };
    }

    return { deviceUid, status: 'UNKNOWN', config: null };
  }
}


  // ========== STORAGE CONFIG ==========
  async saveTerminalConfig(config: TerminalConfig): Promise<void> {
    await this.storageReady;
    await this.storage.set(this.STORAGE_TERMINAL_CONFIG, config);
  }

  async getTerminalConfig(): Promise<TerminalConfig | null> {
    await this.storageReady;
    return (await this.storage.get(this.STORAGE_TERMINAL_CONFIG)) || null;
  }

  async clearTerminalData(): Promise<void> {
    await this.storageReady;
    await this.storage.remove(this.STORAGE_TERMINAL_CONFIG);
    await this.storage.remove(this.STORAGE_DEVICE_UID);
    await this.storage.remove(this.STORAGE_ENROLL_PENDING);
  }

  // ========== BANDERA DE SOLICITUD PENDIENTE ==========
  async markEnrollPending(): Promise<void> {
    await this.storageReady;
    await this.storage.set(this.STORAGE_ENROLL_PENDING, true);
  }

  async clearEnrollPending(): Promise<void> {
    await this.storageReady;
    await this.storage.remove(this.STORAGE_ENROLL_PENDING);
  }

  async isEnrollPending(): Promise<boolean> {
    await this.storageReady;
    const v = await this.storage.get(this.STORAGE_ENROLL_PENDING);
    return !!v;
  }

  // ========== CREAR SOLICITUD DE ACTIVACIÓN ==========
  /**
   * Envía la solicitud de enroll al BFF:
   * POST {bffBaseUrl}/enroll/request
   */
  async createActivationRequest(
    payload: ActivationRequestPayload
  ): Promise<ActivationRequestResponse> {
    const url = `${environment.bffBaseUrl}/enroll/request`;

    try {
      const resp = await firstValueFrom(
        this.http.post<ActivationRequestResponse>(url, payload)
      );

      // Si la API dice ok=true, marcamos que hay solicitud pendiente
      if (resp.ok) {
        await this.markEnrollPending();
      }

      return resp;
    } catch (err: any) {
      console.error('[ENROLL] Error creando solicitud:', err);

      // Caso especial: 409 device_already_registered
      if (err.status === 409 && err.error?.detail) {
        try {
          const detail = JSON.parse(err.error.detail);

          if (detail.error === 'device_already_registered') {
            // Igual dejamos la bandera de pending, porque ya hay una solicitud
            await this.markEnrollPending();

            return {
              ok: false,
              message:
                detail.message ||
                'Ya existe una solicitud registrada para este dispositivo.',
            };
          }
        } catch {
          // ignore parse error
        }
      }

      return {
        ok: false,
        message: 'No se pudo crear la solicitud de activación.',
      };
    }
  }
}