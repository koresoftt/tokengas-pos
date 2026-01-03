import { Injectable } from '@angular/core';
import { AppKeys } from './appkeys.native';

@Injectable({ providedIn: 'root' })
export class AppKeysService {
  async ensure(): Promise<void> {
    await AppKeys.ensure();
  }
  async getKid(): Promise<string> {
    const r = await AppKeys.getKid();
    return r.kid;
  }
  async sign(payload: string): Promise<{ kid: string; signature: string }> {
    return AppKeys.sign({ payload });
  }
}
