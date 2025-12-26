import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonSpinner,
  IonButton,
} from '@ionic/angular/standalone';
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
  checking = true;     // muestra spinner
  leaving = false;     // animación de salida
  canRetry = false;    // muestra botón "Reintentar"

  constructor(
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Timeout para que no se quede colgado si la API no responde
  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout de ${ms} ms esperando respuesta`));
      }, ms);

      promise
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  ngOnInit() {
    this.runCheck();
  }

  async runCheck() {
    // Estado inicial en cada intento
    this.checking = true;
    this.leaving = false;
    this.canRetry = false;
    this.statusMessage = 'Verificando dispositivo…';

    let target: '/terminal' | '/activacion' = '/activacion';

    try {
      console.log('[LOAD] Iniciando verificación de estado…');

const result = await this.withTimeout(
  this.terminalState.checkTerminalStatus(),
  8000
);

// Normalizamos siempre a string en mayúsculas
const remoteStatus = String(result?.status || 'UNKNOWN').toUpperCase();
const pendingLocal = await this.terminalState.isEnrollPending();

console.log('[LOAD] remoteStatus=', remoteStatus, 'pendingLocal=', pendingLocal);

if (remoteStatus === 'ACTIVE') {
  this.statusMessage = 'Terminal activa. Abriendo POS…';
  target = '/terminal';

} else if (remoteStatus === 'PENDING') {
  this.statusMessage =
    'Tienes una solicitud de activación en proceso. ' +
    'En cuanto sea aprobada podrás usar la terminal.';
  target = '/activacion';

} else if (remoteStatus === 'NOT_REGISTERED') {
  if (pendingLocal) {
    this.statusMessage =
      'Tienes una solicitud de activación en proceso. ' +
      'Abriendo pantalla de activación…';
  } else {
    this.statusMessage =
      'Terminal no activada. Preparando pantalla de activación…';
  }
  target = '/activacion';

} else {
  this.statusMessage =
    'No se pudo determinar el estado de la terminal. Iremos a activación…';
  target = '/activacion';
}



      // Flujo OK → apagamos spinner, animamos y navegamos
      this.checking = false;
      await this.sleep(2000);
      this.leaving = true;
      await this.sleep(450);

      console.log('[LOAD] Navegando a:', target);
      this.router.navigateByUrl(target, { replaceUrl: true });
    } catch (err) {
      console.error('[LOAD] Error verificando estado:', err);

      // ❌ Hubo problema → detenemos spinner, mostramos mensaje y habilitamos reintento
      this.checking = false;
      this.leaving = false;
      this.statusMessage =
        'No fue posible verificar el dispositivo.\n' +
        'Verifica que tienes conexión a internet e inténtalo nuevamente.';
      this.canRetry = true;
    }
  }

  onRetry() {
    console.log('[LOAD] Reintentando verificación…');
    this.runCheck();
  }
}
