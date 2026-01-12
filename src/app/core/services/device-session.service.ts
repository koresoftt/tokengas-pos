import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { environment } from 'src/environments/environment';

import { AppBootstrapService } from 'src/app/core/services/app-bootstrap.service';

interface DeviceLoginResponse {
  ok: boolean;
  device_session: string;
  expires_in: number;
}

@Injectable({ providedIn: 'root' })
export class DeviceSessionService {
  private readonly STORAGE_KEY = 'tg_device_session';
  private inMemory: string | null = null;

  private baseUrlRaw = (environment.baseUrl || '').replace(/\/+$/, '');

  constructor(
    private http: HttpClient,
    private bootstrap: AppBootstrapService,
  ) {}

  async get(): Promise<string | null> {
    if (this.inMemory) return this.inMemory;
    const { value } = await Preferences.get({ key: this.STORAGE_KEY });
    this.inMemory = value ?? null;
    return this.inMemory;
  }

  async clear(): Promise<void> {
    this.inMemory = null;
    await Preferences.remove({ key: this.STORAGE_KEY });
  }

  async login(appVersion: string): Promise<string> {
    if (!this.baseUrlRaw) throw new Error('environment.baseUrl missing');

    // ✅ MISMO UID que usa bootstrap (estable y persistido)
    const uid = await this.bootstrap.getDeviceUid();

    const path = '/auth/device-login';
    const url = `${this.baseUrlRaw}${path}`;
    const body = { device_uid: uid, app_version: appVersion };

    // ✅ Firma Android Key (X-App-*)
    const headers: HttpHeaders = await this.bootstrap.signedHeaders('POST', path, body);

    const res = await firstValueFrom(
      this.http.post<DeviceLoginResponse>(url, body, { headers })
    );

    if (!res?.ok || !res.device_session) {
      throw new Error('device-login failed');
    }

    this.inMemory = res.device_session;
    await Preferences.set({ key: this.STORAGE_KEY, value: res.device_session });
    return res.device_session;
  }

  async ensure(appVersion: string): Promise<string> {
    const s = await this.get();
    if (s) return s;
    return this.login(appVersion);
  }
}
