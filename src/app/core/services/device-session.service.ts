import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Preferences } from '@capacitor/preferences';
import { Device } from '@capacitor/device';
import { environment } from 'src/environments/environment';

interface DeviceLoginResponse {
  ok: boolean;
  device_session: string;
  expires_in: number;
}

@Injectable({ providedIn: 'root' })
export class DeviceSessionService {
  private readonly STORAGE_KEY = 'tg_device_session';
  private inMemory: string | null = null;

  constructor(private http: HttpClient) {}

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
    const uid = (await Device.getId()).identifier || 'UNKNOWN_DEVICE';

    const res = await firstValueFrom(
      this.http.post<DeviceLoginResponse>(
        `${environment.baseUrl}/auth/device-login`,
        { device_uid: uid, app_version: appVersion }
      )
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
