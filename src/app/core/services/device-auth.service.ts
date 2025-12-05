// src/app/core/services/device-auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Storage } from '@ionic/storage-angular';
import { firstValueFrom, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Device } from '@capacitor/device';

import { environment } from 'src/environments/environment';
import { TerminalConfig, TerminalStateService } from './terminal-state.service';

export interface DeviceLoginResponse {
  ok: boolean;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  terminal?: {
    device_uid: string;
    descripcion: string;
    networkCode: string;
    merchant: {
      id: string;
      code: string;
      name: string;
    };
    site: {
      id: string;
      code: string;
      name: string;
    };
    modelo: string;
    appVersion: string;
    operatorId: string;
    geo: {
      lat: number;
      lon: number;
    };
  };
  error?: string;
  message?: string;
}

export interface DeviceSession {
  token: string;
  expiresAt: number;
  terminalConfig: TerminalConfig;
}

@Injectable({
  providedIn: 'root',
})
export class DeviceAuthService {
  private storageReady: Promise<void>;

  private readonly STORAGE_ACCESS_TOKEN = 'tg_pos_access_token';
  private readonly STORAGE_TOKEN_EXPIRES = 'tg_pos_access_expires_at';

  constructor(
    private http: HttpClient,
    private storage: Storage,
    private terminalState: TerminalStateService
  ) {
    this.storageReady = this.storage.create().then(() => undefined);
  }

  /**
   * Login de la terminal contra el BFF:
   * POST {bffBaseUrl}/auth/device-login
   */
  async loginDevice(): Promise<DeviceSession | null> {
    await this.storageReady;

    const deviceInfo = await Device.getId();
    const device_uid = deviceInfo.identifier || 'UNKNOWN_DEVICE';

    const body = {
      device_uid,
      app_version: '1.0.0', // TODO: luego ligamos al versionName real
    };

    const url = `${environment.bffBaseUrl}/auth/device-login`;
    console.log('➡️ Device login URL:', url, 'body:', body);

    const resp = await firstValueFrom(
      this.http.post<DeviceLoginResponse>(url, body).pipe(
        catchError((err: HttpErrorResponse) => {
          console.error('🚨 Device login error', {
            status: err.status,
            statusText: err.statusText,
            message: err.message,
            url: err.url,
            error: err.error,
          });
          return throwError(() => err);
        })
      )
    );

    if (!resp.ok || !resp.access_token || !resp.terminal) {
      console.error('[DeviceAuth] Login falló (respuesta válida pero ok=false):', resp);
      return null;
    }

    const expiresIn = resp.expires_in ?? 900; // default 15 min
    const expiresAt = Date.now() + expiresIn * 1000;

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

    // Guardar token + expiración + config
    await this.storage.set(this.STORAGE_ACCESS_TOKEN, resp.access_token);
    await this.storage.set(this.STORAGE_TOKEN_EXPIRES, expiresAt);
    await this.terminalState.saveTerminalConfig(config);

    return {
      token: resp.access_token,
      expiresAt,
      terminalConfig: config,
    };
  }

  /**
   * Cargar sesión desde Storage y validar expiración.
   */
  async loadSession(): Promise<DeviceSession | null> {
    await this.storageReady;

    const token = await this.storage.get(this.STORAGE_ACCESS_TOKEN);
    const expiresAt = Number(
      (await this.storage.get(this.STORAGE_TOKEN_EXPIRES)) ?? 0
    );
    const config = await this.terminalState.getTerminalConfig();

    if (!token || !expiresAt || !config) {
      return null;
    }

    // Expirado
    if (Date.now() > expiresAt - 5000) {
      return null;
    }

    return { token, expiresAt, terminalConfig: config };
  }

  /**
   * Limpiar sesión de la terminal.
   */
  async clearSession(): Promise<void> {
    await this.storageReady;
    await this.storage.remove(this.STORAGE_ACCESS_TOKEN);
    await this.storage.remove(this.STORAGE_TOKEN_EXPIRES);
    await this.terminalState.clearTerminalData();
  }
}
