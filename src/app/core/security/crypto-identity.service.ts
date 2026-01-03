import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin';

const KID_KEY = 'app_kid';
const PRIVATE_KEY_KEY = 'app_private_key_jwk';

@Injectable({ providedIn: 'root' })
export class CryptoIdentityService {
  privateKeyJwk?: JsonWebKey;
  kid?: string;

  async ensureIdentity(): Promise<void> {
    const { value: kid } = await Preferences.get({ key: KID_KEY });

    if (kid) {
      this.kid = kid;
      await this.loadPrivateKey();
      return;
    }

    await this.createIdentity();
  }

  private async createIdentity(): Promise<void> {
    // ✅ Compatible con WebView (sin crypto.randomUUID)
    const kid = `KID_${this.randomHex(16)}`;

    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign']
    );

    const jwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    await SecureStoragePlugin.set({
      key: PRIVATE_KEY_KEY,
      value: JSON.stringify(jwk),
    });

    await Preferences.set({ key: KID_KEY, value: kid });

    this.privateKeyJwk = jwk;
    this.kid = kid;
  }

  private async loadPrivateKey(): Promise<void> {
    const stored = await SecureStoragePlugin.get({ key: PRIVATE_KEY_KEY });
    if (!stored?.value) {
      throw new Error('Private key not found in secure storage');
    }
    this.privateKeyJwk = JSON.parse(stored.value);
  }

  private randomHex(bytes: number): string {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  getIdentity() {
    if (!this.privateKeyJwk || !this.kid) {
      throw new Error('Crypto identity not initialized');
    }
    return { kid: this.kid, privateKeyJwk: this.privateKeyJwk };
  }
}
