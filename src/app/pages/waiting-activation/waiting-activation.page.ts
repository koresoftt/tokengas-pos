import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent, IonButton, IonCard, IonCardHeader, IonCardTitle,
  IonCardContent, IonText, IonSpinner
} from '@ionic/angular/standalone';
import { Router } from '@angular/router';
import { TerminalStateService } from 'src/app/core/services/terminal-state.service';

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

    try {
      const result = await this.terminalState.checkTerminalStatus();

      if (result.status === 'ACTIVE') {
        this.clearTimer();
        await this.terminalState.clearPending();
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      if (result.status === 'PENDING') {
        this.errorMsg = 'Solicitud en proceso. En breve se activará la terminal.';
        return;
      }

      if (result.status === 'INACTIVE' || result.status === 'NOT_REGISTERED') {
        this.clearTimer();
        await this.router.navigateByUrl('/activacion', { replaceUrl: true });
        return;
      }

      if (result.status === 'REJECTED') {
        this.clearTimer();
        await this.router.navigateByUrl('/activacion', { replaceUrl: true });
        return;
      }

      this.errorMsg = 'No fue posible verificar el estado. Revisa la conexión.';
    } finally {
      this.loading = false;
    }
  }
}
