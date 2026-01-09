import { registerPlugin } from '@capacitor/core';

export type AppKeysPlugin = {
  ensure(): Promise<{ ok: boolean }>;
  getKid(): Promise<{ kid: string }>;
  sign(options: { payload: string }): Promise<{ kid: string; signature: string }>;
  getPublicKeyPem(): Promise<{ public_key_pem: string }>;
};

export const AppKeys = registerPlugin<AppKeysPlugin>('AppKeys');
