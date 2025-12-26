import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { App } from '@capacitor/app';

import { TerminalStateService } from 'src/app/core/services/terminal-state.service';

@Component({
  selector: 'app-startup',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner],
  template: `
    <ion-content class="ion-padding">
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
        <ion-spinner></ion-spinner>
        <p style="margin-top:12px;">Iniciando…</p>
      </div>
    </ion-content>
  `,
})
export class StartupPage implements OnInit {
  constructor(
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      const info = await App.getInfo();
      const appVersion = info.version || '1.0.0';

      const status = await this.terminalState.checkTerminalStatus(appVersion);

      if (status.status === 'ACTIVATED') {
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      // PENDING / ALREADY_REGISTERED / NOT_REGISTERED / ERROR -> activación
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    } catch (e) {
      // Si algo falla, cae a activación
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    }
  }
}
