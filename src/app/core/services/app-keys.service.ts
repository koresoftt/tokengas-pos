import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';

type SignResult = { kid: string; signature: string };

type AppKeysPlugin = {
  ensure(): Promise<void>;
  getKid(): Promise<{ kid: string }>;
  sign(opts: { payload: string }): Promise<{ signature: string }>;
  // Si tu plugin no trae esto, lo dejamos opcional:
  getPublicKeyPem?: () => Promise<{ public_key_pem: string }>;
};

const AppKeys = registerPlugin<AppKeysPlugin>('AppKeys');

@Injectable({ providedIn: 'root' })
export class AppKeysService {
  async ensure(): Promise<void> {
    await AppKeys.ensure();
  }

  async getKid(): Promise<string> {
    const r = await AppKeys.getKid();
    return r.kid;
  }

  async sign(payload: string): Promise<SignResult> {
    const kid = await this.getKid();
    const r = await AppKeys.sign({ payload });
    return { kid, signature: r.signature };
  }

  async getPublicKeyPem(): Promise<string> {
    if (!AppKeys.getPublicKeyPem) return '';
    const r = await AppKeys.getPublicKeyPem();
    return r.public_key_pem;
  }
}
