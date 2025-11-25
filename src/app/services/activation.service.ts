import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type ActivationPayload = {
  deviceId: string;
  model?: string;
  platform?: string;
  osVersion?: string;
  lat: number;
  lon: number;
  accuracy?: number;
};

export type ActivationStored = ActivationPayload & { at: number };

const KEY = 'tg_activated';

@Injectable({ providedIn: 'root' })
export class ActivationService {
  async activate(payload: ActivationPayload): Promise<boolean> {
    try {
      // TODO: Reemplazar por POST real a tu API
      // const res = await fetch('https://api.koresoft.mx/activar', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(payload)
      // });
      // if (!res.ok) return false;

      await new Promise(r => setTimeout(r, 600)); // simulación

      const toStore: ActivationStored = { ...payload, at: Date.now() };
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
    try { return JSON.parse(v.value) as ActivationStored; } catch { return null; }
  }

  async deactivate(): Promise<void> {
    await Preferences.remove({ key: KEY });
  }
}
