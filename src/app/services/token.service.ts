import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private readonly KEY = 'tg_device_jwt';

  async getBearer(): Promise<string> {
    const r = await Preferences.get({ key: this.KEY });
    return r.value || '';
  }

  async setBearer(token: string): Promise<void> {
    if (!token) return;
    await Preferences.set({ key: this.KEY, value: token });
  }

  async clearBearer(): Promise<void> {
    await Preferences.remove({ key: this.KEY });
  }
}
