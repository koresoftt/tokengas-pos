// src/app/app.component.ts
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';

import { TerminalStateService } from './core/services/terminal-state.service';
import { DeviceAuthService } from './core/services/device-auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
    </ion-app>
  `,
})
export class AppComponent implements OnInit {
  constructor(
    private router: Router,
    private terminalState: TerminalStateService,
    private deviceAuth: DeviceAuthService
  ) {}

  async ngOnInit() {
    await this.bootstrapTerminalFlow();
  }

  private async bootstrapTerminalFlow() {
    try {
      // 1) ¿Ya hay sesión válida?
      const session = await this.deviceAuth.loadSession();
      if (session) {
        // Ya tiene token y config → directo a terminal
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      // 2) Revisar estado de la terminal vía BFF
      const status = await this.terminalState.checkTerminalStatus();

      if (status.status === 'ACTIVE') {
        // 2a. Activa → hacer device-login y luego ir a terminal
        const newSession = await this.deviceAuth.loginDevice();
        if (newSession?.token) {
          await this.router.navigateByUrl('/terminal', { replaceUrl: true });
          return;
        }

        // Si por alguna razón falla el login, mandamos a activación
        await this.router.navigateByUrl('/activacion', { replaceUrl: true });
        return;
      }

      if (status.status === 'NOT_REGISTERED') {
        // 2b. No registrada → esperar activación
        await this.router.navigateByUrl('/esperando-activacion', {
          replaceUrl: true,
        });
        return;
      }

      // 2c. Cualquier otro caso → pantalla de activación (para levantar solicitud)
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    } catch (err) {
      console.error('[App] Error en bootstrapTerminalFlow:', err);
      await this.router.navigateByUrl('/activacion', { replaceUrl: true });
    }
  }
}
