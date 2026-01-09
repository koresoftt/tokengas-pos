import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';

import { AppBootstrapService } from '../core/services/app-bootstrap.service';

export type ActivationPayload = {
  lat: number;
  lon: number;
  accuracy?: number;
  model?: string;
  platform?: string;
  osVersion?: string;
};

export type ActivationStored = ActivationPayload & { at: number; device_uid: string };

const KEY = 'tg_activated_meta';

@Injectable({ providedIn: 'root' })
export class ActivationService {
  constructor(private bootstrap: AppBootstrapService) {}

  async activate(payload: ActivationPayload): Promise<boolean> {
    try {
      const info = await App.getInfo();
      const dev = await Device.getInfo();

      const modelo =
        payload.model ||
        `${dev.manufacturer || ''} ${dev.model || ''}`.trim() ||
        'UNKNOWN';

      // ✅ bootstrap REAL (challenge + complete)
  const res = await this.bootstrap.bootstrap({
  app_id: 'tokengas-pos',
  app_version: '1.0.3',
  modelo: payload.model || '',
});


      const toStore: ActivationStored = {
        ...payload,
        device_uid: res.device_uid,
        at: Date.now(),
      };

      await Preferences.set({ key: KEY, value: JSON.stringify(toStore) });
      return true;
    } catch (e) {
      console.error('Activation error', e);
      return false;
    }
  }

  async isActivated(): Promise<boolean> {
    const v = await Preferences.get({ key: KEY });
    return !!v.value;
  }

  async getStored(): Promise<ActivationStored | null> {
    const v = await Preferences.get({ key: KEY });
    if (!v.value) return null;
    try {
      return JSON.parse(v.value) as ActivationStored;
    } catch {
      return null;
    }
  }

  async deactivate(): Promise<void> {
    await Preferences.remove({ key: KEY });
  }
}
