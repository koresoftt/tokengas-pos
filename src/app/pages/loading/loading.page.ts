import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonSpinner,
  IonButton,
  IonIcon,
} from '@ionic/angular/standalone';
import { App } from '@capacitor/app';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  timeOutline,
  alertCircleOutline,
} from 'ionicons/icons';

import { TerminalStateService } from 'src/app/core/services/terminal-state.service';
import { CryptoIdentityService } from 'src/app/core/security/crypto-identity.service';

type UiPhase =
  | 'checking'
  | 'activated'
  | 'pending'
  | 'not_registered'
  | 'error';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonButton, IonIcon],
  templateUrl: './loading.page.html',
  styleUrls: ['./loading.page.scss'],
})
export class LoadingPage implements OnInit, OnDestroy {
  phase: UiPhase = 'checking';
  title = 'Verificando dispositivo';
  subtitle = 'Un momento…';
  detail = '';

  checking = true;
  canRetry = false;

  private appVersion = '1.0.3';
  private destroyed = false;

  // UX: tiempo máximo para no “colgar” la pantalla
  private readonly REQUEST_TIMEOUT_MS = 12_000;

  // Si está pendiente, polling corto
  private readonly PENDING_POLL_MAX = 3;
  private pendingPolls = 0;

  constructor(
    private terminal: TerminalStateService,
    private router: Router,
    private cryptoId: CryptoIdentityService
  ) {
    addIcons({
      checkmarkCircleOutline,
      timeOutline,
      alertCircleOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    // 1️⃣ Inicializar identidad criptográfica
    try {
      await this.cryptoId.ensureIdentity();
      const { kid } = this.cryptoId.getIdentity();
      console.log('[CRYPTO] KID OK:', kid);
    } catch (e) {
      console.error('[CRYPTO] Error inicializando identidad', e);
      this.phase = 'error';
      this.title = 'Error de seguridad';
      this.subtitle = 'No se pudo inicializar el dispositivo';
      this.canRetry = false;
      return;
    }

    // 2️⃣ Obtener versión de la app (opcional)
    try {
      const info = await App.getInfo();
      this.appVersion = info.version || this.appVersion;
    } catch {
      // noop
    }

    // 3️⃣ Flujo legacy (temporal)
    await this.run();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  async run(): Promise<void> {
    this.setCheckingUi();

    try {
      const result = await this.withTimeout(
        this.terminal.checkTerminalStatus(this.appVersion),
        this.REQUEST_TIMEOUT_MS
      );

      if (this.destroyed) return;

      switch (result.status) {
        case 'ACTIVATED':
          this.phase = 'activated';
          this.title = 'Terminal activa';
          this.subtitle = 'Iniciando POS…';
          this.checking = true;
          this.canRetry = false;

          await this.sleep(500);
          if (this.destroyed) return;

          await this.router.navigateByUrl('/terminal', {
            replaceUrl: true,
          });
          return;

        case 'PENDING':
          this.phase = 'pending';
          this.title = 'Solicitud en proceso';
          this.subtitle = 'Estamos esperando aprobación…';
          this.detail = 'Puedes dejar esta pantalla abierta.';

          if (this.pendingPolls < this.PENDING_POLL_MAX) {
            this.pendingPolls++;
            this.checking = true;
            this.canRetry = false;
            await this.sleep(2500);
            if (this.destroyed) return;
            return this.run();
          }

          this.checking = false;
          this.canRetry = true;
          this.detail = 'Si ya fue aprobada, toca “Reintentar”.';
          return;

        case 'ALREADY_REGISTERED':
          this.phase = 'pending';
          this.title = 'Dispositivo registrado';
          this.subtitle = 'Continuemos con activación…';
          this.checking = true;
          this.canRetry = false;

          await this.sleep(300);
          if (this.destroyed) return;

          await this.router.navigateByUrl('/activacion', {
            replaceUrl: true,
          });
          return;

        case 'NOT_REGISTERED':
        default:
          this.phase = 'not_registered';
          this.title = 'Listo para activar';
          this.subtitle = 'Inicia el proceso de activación.';
          this.checking = true;
          this.canRetry = false;

          await this.sleep(200);
          if (this.destroyed) return;

          await this.router.navigateByUrl('/activacion', {
            replaceUrl: true,
          });
          return;
      }
    } catch (err) {
      if (this.destroyed) return;

      console.error('[LOADING] Error verificando estado:', err);

      this.phase = 'error';
      this.title = 'No se pudo verificar';
      this.subtitle = 'Revisa tu conexión e inténtalo de nuevo.';
      this.detail = 'Si el problema persiste, contacta a soporte.';
      this.checking = false;
      this.canRetry = true;
    }
  }

  onRetry(): void {
    this.pendingPolls = 0;
    this.run();
  }

  private setCheckingUi(): void {
    this.phase = 'checking';
    this.title = 'Verificando dispositivo';
    this.subtitle = 'Validando estado del terminal…';
    this.detail = '';
    this.checking = true;
    this.canRetry = false;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number
  ): Promise<T> {
    let t: any;
    const timeout = new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(`Timeout ${ms}ms`)), ms);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(t);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
