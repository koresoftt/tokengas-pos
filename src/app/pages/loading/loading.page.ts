import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { App } from '@capacitor/app';
import { Device } from '@capacitor/device';

import { AppKeysService } from 'src/app/core/security/app-keys.service';
import { AppBootstrapService, StatusResp } from 'src/app/core/services/app-bootstrap.service';

type Phase = 'checking' | 'active' | 'pending' | 'inactive' | 'not_registered' | 'rejected' | 'error';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, IonicModule],
  templateUrl: './loading.page.html',
  styleUrls: ['./loading.page.scss'],
})
export class LoadingPage {
  phase: Phase = 'checking';
  checking = true;

  title = 'TokenGas POS';
  subtitle = 'Verificando terminal…';
  detail: string | null = null;
  canRetry = false;

  private running = false;
  private bootstrappedThisRun = false;

  constructor(
    private router: Router,
    private appKeys: AppKeysService,
    private boot: AppBootstrapService
  ) {}

  async ionViewDidEnter() {
    console.log('[LOADING] ionViewDidEnter fired', new Date().toISOString());

    if (this.running) return;
    this.running = true;
    this.bootstrappedThisRun = false;
    await this.runFlow(false);
    this.running = false;
  }

  async onRetry() {
    if (this.running) return;
    this.running = true;
    this.bootstrappedThisRun = false;
    await this.runFlow(true);
    this.running = false;
  }

  private setState(phase: Phase, subtitle: string, detail?: string | null, canRetry = false) {
    this.phase = phase;
    this.checking = phase === 'checking';
    this.subtitle = subtitle;
    this.detail = detail ?? null;
    this.canRetry = canRetry;
  }

  private normalizeHttpError(e: any): { status?: number; code?: string; message: string } {
    if (e instanceof HttpErrorResponse) {
      const code =
        e.error?.code ||
        e.error?.error?.code ||
        e.error?.error ||
        e.error?.message;

      const msg = code
        ? `${e.status} ${e.statusText} (${code})`
        : `${e.status} ${e.statusText}`;

      return { status: e.status, code: String(code || ''), message: msg };
    }
    return { message: String(e?.message || e) };
  }

  private extractCode(e: any): string {
    if (e instanceof HttpErrorResponse) {
      return String(
        e.error?.code ||
          e.error?.error?.code ||
          e.error?.error ||
          e.error?.message ||
          ''
      );
    }
    return String(e?.code || e?.message || '');
  }

  private isAppTsSkew(err: any): boolean {
    return this.extractCode(err).includes('APP_TS_SKEW');
  }

  private shouldAutoBootstrap(err: any): boolean {
    const code = this.extractCode(err);

    if (code.includes('APP_KEY_NOT_FOUND')) return true;
    if (code.includes('APP_HEADERS_MISSING')) return true;
    if (code.includes('APP_SIGNATURE_INVALID')) return true;

    // fallback por status genérico
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401 || err.status === 403) return true;
    }
    return false;
  }

  private async routeByStatus(st: StatusResp) {
  const s = String(st?.status || '').toUpperCase();

  if (s === 'ACTIVE') {
    this.setState('active', 'Terminal activa', null, false);
    await this.router.navigateByUrl('/terminal', { replaceUrl: true });
    return;
  }

  if (s === 'PENDING') {
    this.setState('pending', 'Solicitud en proceso', 'Espera autorización en horario laboral.', false);
    await this.router.navigateByUrl('/waiting', { replaceUrl: true });
    return;
  }

  if (s === 'INACTIVE') {
    this.setState('inactive', 'Terminal inactiva', 'Esta terminal existe pero no está activa. Puedes solicitar activación.', false);
    await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    return;
  }

  if (s === 'REJECTED') {
    this.setState('rejected', 'Solicitud rechazada', 'Contacta al administrador o vuelve a solicitar.', false);
    await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    return;
  }

  // NOT_REGISTERED
  this.setState('not_registered', 'Terminal no registrada', null, false);
  await this.router.navigateByUrl('/activacion', { replaceUrl: true });
}


  private async doBootstrap(infoVersion: string) {
    // Asegura que exista KID/keys del lado app
    await this.appKeys.ensure();

    const dev = await Device.getInfo();
    const modelo = `${dev.manufacturer || ''} ${dev.model || ''}`.trim() || 'UNKNOWN';
    const app_version = infoVersion || '1.0.0';

    // ✅ bootstrap 1 sola vez por corrida (evita loops)
    await this.boot.bootstrap({
      app_id: 'tokengas-pos',
      app_version,
      modelo,
    });

    this.bootstrappedThisRun = true;
  }

 private async runFlow(fromRetry: boolean) {
  console.log('[FLOW] start', { fromRetry, at: new Date().toISOString() });

  try {
    this.setState('checking', fromRetry ? 'Reintentando…' : 'Verificando terminal…', null, false);

    console.log('[FLOW] before App.getInfo');
    const info = await App.getInfo();
    console.log('[FLOW] after App.getInfo', info);

    // 1) Intento #1: status (NO bootstrap primero)
    try {
      console.log('[FLOW] try#1 before meStatus');
      const st = await this.boot.meStatus();
      console.log('[FLOW] try#1 after meStatus', st);

      await this.routeByStatus(st);
      return;

    } catch (e1: any) {
      console.error('[FLOW] try#1 error', e1);

      // ✅ Caso CLAVE: no hay token todavía -> bootstrap directo
      const code = this.extractCode(e1);
      if (code.includes('NO_TOKEN')) {
        console.log('[FLOW] NO_TOKEN -> bootstrap');
        this.setState('checking', 'Registrando dispositivo…', 'Bootstrap (token)…', false);

        if (!this.bootstrappedThisRun) {
          await this.doBootstrap(info.version || '');
        }

        console.log('[FLOW] after bootstrap -> meStatus');
        const st2 = await this.boot.meStatus();
        console.log('[FLOW] after bootstrap -> meStatus ok', st2);

        await this.routeByStatus(st2);
        return;
      }

      // Hora desfasada: NO bootstrap
      if (this.isAppTsSkew(e1)) {
        this.setState(
          'error',
          'Hora del dispositivo desfasada',
          'Activa “Fecha y hora automáticas” y “Zona horaria automática”, conecta a internet y reintenta.',
          true
        );
        return;
      }

      // Si no aplica bootstrap, mostramos error tal cual
      if (!this.shouldAutoBootstrap(e1)) {
        const norm = this.normalizeHttpError(e1);
        this.setState('error', 'No se pudo validar terminal', norm.message, true);
        return;
      }

      // 2) Bootstrap (solo una vez)
      if (!this.bootstrappedThisRun) {
        this.setState('checking', 'Registrando dispositivo…', 'Bootstrap (llaves + registro)…', false);
        await this.doBootstrap(info.version || '');
      }

      // 3) Intento #2: status ya con KID registrado
      this.setState('checking', 'Verificando terminal…', null, false);

      console.log('[FLOW] try#2 before meStatus');
      const st2 = await this.boot.meStatus();
      console.log('[FLOW] try#2 after meStatus', st2);

      await this.routeByStatus(st2);
      return;
    }
  } catch (e: any) {
    const norm = this.normalizeHttpError(e);
    this.setState('error', 'Error inesperado', norm.message, true);
    console.error('[LOADING] runFlow outer error:', e);

    try {
      const nowEpoch = Math.floor(Date.now() / 1000);
      const devInfo = await Device.getInfo();
      console.log('[TIME DEBUG]', { nowEpoch, iso: new Date().toISOString(), devInfo });
    } catch {}
  }
}

}