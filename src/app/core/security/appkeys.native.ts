import { registerPlugin } from '@capacitor/core';

export interface AppKeysPlugin {
  ensure(): Promise<{ ok: boolean }>;
  getKid(): Promise<{ kid: string }>;
  sign(options: { payload: string }): Promise<{ kid: string; signature: string }>;
}

export const AppKeys = registerPlugin<AppKeysPlugin>('AppKeys');
