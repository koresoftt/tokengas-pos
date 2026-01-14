import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner, IonText } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';

import { TerminalStateService } from 'src/app/core/services/terminal-state.service';

@Component({
  selector: 'app-startup',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonText],
  template: `
    <ion-content class="ion-padding">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
        <ion-spinner></ion-spinner>
        <ion-text color="medium">
          <p style="margin-top:12px;">{{ message }}</p>
        </ion-text>
      </div>
    </ion-content>
  `,
})
export class StartupPage implements OnInit {
  message = 'Iniciando…';

  constructor(
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      this.message = 'Leyendo versión…';
      const info = await App.getInfo();
      const appVersion = info.version || '1.0.0';

      this.message = 'Verificando estado…';
      const r = await this.terminalState.checkTerminalStatus();


      const s = String(r?.status || '').toUpperCase().trim();

      if (s === 'ACTIVATED') {
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      // ✅ Trata PENDING y ALREADY_REGISTERED como “en espera”
      if (s === 'PENDING' || s === 'ALREADY_REGISTERED') {
        await this.router.navigateByUrl('/waiting-activation', { replaceUrl: true });
        return;
      }

      // NOT_REGISTERED (o cualquier otro) -> activación
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    } catch (_e) {
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    }
  }
}
