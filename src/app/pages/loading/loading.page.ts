import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner, IonButton } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';

import { TerminalStateService } from 'src/app/core/services/terminal-state.service';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonButton],
  templateUrl: './loading.page.html',
  styleUrls: ['./loading.page.scss'],
})
export class LoadingPage implements OnInit {
  statusMessage = 'Verificando dispositivo…';
  checking = true;
  canRetry = false;

  private appVersion = '1.0.3';

  constructor(
    private terminal: TerminalStateService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const info = await App.getInfo();
      this.appVersion = info.version || '1.0.3';
    } catch {
      this.appVersion = '1.0.3';
    }

    await this.run();
  }

  async run(): Promise<void> {
    this.checking = true;
    this.canRetry = false;
    this.statusMessage = 'Verificando dispositivo…';

    try {
      const result = await this.terminal.checkTerminalStatus(this.appVersion);

      if (result.status === 'ACTIVATED') {
        this.statusMessage = 'Terminal activa. Iniciando POS…';
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      // PENDING / ALREADY_REGISTERED / NOT_REGISTERED -> activación
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    } catch (err) {
      // Error real (red, timeout, server down)
      console.error('[LOADING] Error verificando estado:', err);
      this.checking = false;
      this.canRetry = true;
      this.statusMessage =
        'No fue posible verificar el dispositivo.\nRevisa tu conexión e intenta de nuevo.';
    }
  }

  onRetry(): void {
    this.run();
  }
}
