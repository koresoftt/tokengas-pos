import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonButton, IonCard, IonCardHeader, IonCardTitle,
  IonCardContent, IonText, IonSpinner
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { TerminalStateService, TerminalStatusResult } from 'src/app/core/services/terminal-state.service';

@Component({
  selector: 'app-waiting-activation',
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonButton, IonCard, IonCardHeader, IonCardTitle,
    IonCardContent, IonText, IonSpinner
  ],
  templateUrl: './waiting-activation.page.html',
  styleUrls: ['./waiting-activation.page.scss'],
})
export class WaitingActivationPage implements OnDestroy {
  loading = false;
  errorMsg = '';
  private intervalId: any;

  constructor(
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  ionViewWillEnter() {
    this.check();
    // auto-reintento cada 20 segundos
    this.intervalId = setInterval(() => this.check(), 20000);
  }

  ionViewWillLeave() {
    this.clearTimer();
  }

  ngOnDestroy() {
    this.clearTimer();
  }

  private clearTimer() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async check() {
    this.loading = true;
    this.errorMsg = '';

  const result = await this.terminalState.checkTerminalStatus();

if (result.status === 'ACTIVE') {
  this.clearTimer();
  this.router.navigateByUrl('/terminal-ready', { replaceUrl: true });
} else if (result.status === 'PENDING') {
  this.errorMsg = 'Solicitud en proceso. En breve se activará la terminal.';
} else if (result.status === 'NOT_REGISTERED') {
  this.errorMsg = 'La terminal aún no ha sido activada en TokenGas.';
} else {
  this.errorMsg = 'No fue posible verificar el estado. Revisa la conexión.';
}



  }
}
