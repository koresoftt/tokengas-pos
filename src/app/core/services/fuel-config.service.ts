import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type Fuel = { code: number; label: string; price: number };

const KEY = 'tg_fuels_v1';

const DEFAULT_FUELS: Fuel[] = [
  { code: 10100, label: 'Magna',   price: 24.99 },
  { code: 10300, label: 'Premium', price: 25.99 },
  { code: 10400, label: 'Diesel',  price: 25.49 },
];

@Injectable({ providedIn: 'root' })
export class FuelConfigService {

  async getFuels(): Promise<Fuel[]> {
    const { value } = await Preferences.get({ key: KEY });
    if (!value) return DEFAULT_FUELS;

    try {
      const arr = JSON.parse(value);
      if (Array.isArray(arr) && arr.length) return arr as Fuel[];
      return DEFAULT_FUELS;
    } catch {
      return DEFAULT_FUELS;
    }
  }

  async setFuels(fuels: Fuel[]): Promise<void> {
    await Preferences.set({ key: KEY, value: JSON.stringify(fuels) });
  }

  async setFuelPrice(code: number, price: number): Promise<void> {
    const fuels = await this.getFuels();
    const idx = fuels.findIndex(f => f.code === code);

    if (idx >= 0) fuels[idx] = { ...fuels[idx], price };
    else fuels.push({ code, label: String(code), price });

    await this.setFuels(fuels);
  }

  // ✅ para tu SettingsModal (arregla el error resetDefaults)
  async resetDefaults(): Promise<void> {
    await this.setFuels(DEFAULT_FUELS);
  }
}