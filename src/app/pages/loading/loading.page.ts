import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner, IonButton, IonText } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';

import { TerminalStateService } from 'src/app/core/services/terminal-state.service';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonButton, IonText],
  templateUrl: './loading.page.html',
  styleUrls: ['./loading.page.scss'],
})
export class LoadingPage implements OnInit {
  statusMessage = 'Verificando dispositivo…';
  debugText = '';
  checking = true;
  canRetry = false;

  private appVersion = '1.0.0';

  constructor(
    private terminal: TerminalStateService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.statusMessage = 'Leyendo versión…';
      const info = await App.getInfo();
      this.appVersion = info.version || '1.0.0';
    } catch {
      this.appVersion = '1.0.0';
    }
    await this.run();
  }

  async run(): Promise<void> {
    this.checking = true;
    this.canRetry = false;
    this.debugText = '';
    this.statusMessage = 'Leyendo UID…';

    try {
      const uid = await this.terminal.getDeviceUid();
      this.statusMessage = `UID: ${uid} | Consultando estado…`;

      const result = await this.terminal.checkTerminalStatus(this.appVersion);
      const s = String(result?.status || '').toUpperCase();

      // ✅ muestra debug del service
      this.debugText = this.terminal.debugText;

      this.statusMessage = `Estado: ${s}`;

      // ✅ deja visible 2s para que lo veas
      await wait(2000);

      if (s === 'ACTIVATED') {
        this.statusMessage = 'Terminal activa. Iniciando POS…';
        await wait(600);
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      // cualquier otro -> activación (pero deja el debug visible)
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    } catch (err) {
      console.error('[LOADING] Error verificando estado:', err);
      this.checking = false;
      this.canRetry = true;

      // si hay debug del service, muéstralo
      this.debugText = this.terminal.debugText || (err instanceof Error ? err.message : String(err));

      this.statusMessage =
        'No fue posible verificar el dispositivo.\nRevisa tu conexión e intenta de nuevo.';
      return;
    } finally {
      this.checking = false;
    }
  }

  onRetry(): void {
    this.run();
  }
}
