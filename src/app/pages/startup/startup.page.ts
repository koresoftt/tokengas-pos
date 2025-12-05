import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonSpinner,
  IonText
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';

import { TerminalStateService } from 'src/app/core/services/terminal-state.service';

@Component({
  selector: 'app-startup',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, IonText],
  templateUrl: './startup.page.html',
  styleUrls: ['./startup.page.scss'],
})
export class StartupPage implements OnInit {

  loading = true;
  message = 'Verificando estado de la terminal…';

  constructor(
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  async ngOnInit() {
    try {
      console.log('[Startup] Iniciando verificación…');

      // 1) Asegurar que tenemos deviceUid (se guarda en Storage)
      const uid = await this.terminalState.getDeviceUid();
      console.log('[Startup] deviceUid =', uid);

      // 2) Preguntar al BFF si la terminal está activa
      const status = await this.terminalState.checkTerminalStatus();
      console.log('[Startup] Resultado checkTerminalStatus =', status);

      // 3) Decidir a dónde ir
      if (status.status === 'ACTIVE') {
        console.log('[Startup] Terminal ACTIVA → /terminal');
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      if (status.status === 'NOT_REGISTERED') {
        console.log('[Startup] Terminal NO REGISTRADA → /esperando-activacion');
        await this.router.navigateByUrl('/esperando-activacion', { replaceUrl: true });
        return;
      }

      // UNKNOWN (error de red, 500, etc.)
      console.warn('[Startup] Estado UNKNOWN, enviando a /esperando-activacion');
      this.message = 'No se pudo determinar el estado de la terminal.';
      await this.router.navigateByUrl('/esperando-activacion', { replaceUrl: true });

    } catch (err) {
      console.error('[Startup] Error inesperado:', err);
      this.message = 'Error al iniciar la app.';
      // Como fallback también podemos mandar a esperando-activacion
      await this.router.navigateByUrl('/esperando-activacion', { replaceUrl: true });
    } finally {
      this.loading = false;
    }
  }
}
