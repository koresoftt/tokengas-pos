import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { TerminalStateService } from 'src/app/core/services/terminal-state.service';

@Component({
  selector: 'app-loading',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner],
  templateUrl: './loading.page.html',
  styleUrls: ['./loading.page.scss'],
})
export class LoadingPage implements OnInit {
  // Texto que ve el usuario
  statusMessage = 'Verificando dispositivo…';
  // Mientras true, se muestra el spinner
  checking = true;
  // Clase para animación de salida
  leaving = false;

  constructor(
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async ngOnInit() {
  let target: '/terminal' | '/activacion' = '/activacion';

  try {
    console.log('[LOAD] Verificando estado en BFF…');
    const result = await this.terminalState.checkTerminalStatus();
    console.log('[LOAD] Resultado BFF:', result);

    if (result.status === 'ACTIVE') {
      this.statusMessage = 'Terminal activa. Abriendo POS…';
      target = '/terminal';
    } else {
      this.statusMessage =
        'Terminal no activada. Preparando pantalla de activación…';
      target = '/activacion';
    }
  } catch (err) {
    console.error('[LOAD] Error verificando estado:', err);
    this.statusMessage =
      'No se pudo verificar el estado. Iremos a la pantalla de activación…';
    target = '/activacion';
  }

  // 👇 Primero apagamos el spinner
  this.checking = false;

  // 👉 Deja el mensaje quieto 1 segundo para que se LEA
  await this.sleep(2000);

  // 👉 Ahora dispara la animación de salida
  this.leaving = true;

  // 👉 450 ms para que el fade/slide se note bien
  await this.sleep(3000);

  // Y recién ahí navegamos
  this.router.navigateByUrl(target, { replaceUrl: true });
}

}
