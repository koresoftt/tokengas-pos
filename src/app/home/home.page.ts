import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertController, ToastController } from '@ionic/angular';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular/standalone';

type NfcRecord = { tnf: number; type: string; payloadHex: string; payloadText?: string; };
type NfcDetail = { uid: string; tech: string[]; records: NfcRecord[] };

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  styles: [`
    ion-content { --background: #fff; }

    /* ===== Escena centrada (más grande) ===== */
    .nfc-anim{
      --size: clamp(440px, 74vw, 720px);
      position: relative;
      width: var(--size);
      height: var(--size);
      margin: 8px auto 0;
      filter: drop-shadow(0 12px 20px rgba(0,0,0,.18));
    }

    /* Celular súper centrado */
    .phone-img{
      --phoneW: calc(var(--size) * 0.74);
      --phoneH: calc(var(--size) * 1.20);
      position: absolute; left: 45%; top: 50%;
      width: var(--phoneW); height: var(--phoneH);
      transform: translate(-50%, -50%);
      background: url("/assets/brand/phone.png") center/contain no-repeat;
      filter: drop-shadow(0 7px 16px rgba(0,0,0,.28));
      pointer-events: none;
      z-index: 2;
    }

    /* Ondas NFC centradas exactamente */
    .wave{
      position: absolute; left: 50%; top: 50%;
      --ring: calc(var(--size) * 0.32);
      width: var(--ring); height: var(--ring);
      margin-left: calc(var(--ring) * -0.5);
      margin-top:  calc(var(--ring) * -0.5);
      border: 2px solid #00e29b; border-radius: 50%;
      opacity: .28; transform: scale(1);
      animation: nfcPulse 2.6s ease-in-out infinite;
      z-index: 1;
    }
    .w2{ animation-delay: .35s; }
    .w3{ animation-delay: .70s; }

    @keyframes nfcPulse{
      0%   { opacity:.28; transform: scale(1); }
      72%  { opacity:0;   transform: scale(2.7); }
      100% { opacity:0;   transform: scale(2.7); }
    }

    /* Tarjeta: cruza y “flota” ligeramente a la derecha del centro */
    .card-img{
      --cardW: calc(var(--size) * 0.46);
      --cardH: calc(var(--size) * 0.29);
      position: absolute; left: 50%; top: 50%;
      width: var(--cardW); height: var(--cardH);
      background: url("/assets/brand/card.png") center/contain no-repeat;
      border-radius: 12px;
      z-index: 3;
      transform: translate(-50%, -50%);
      animation: cardApproachSide 2.6s ease-in-out infinite;
    }
    @keyframes cardApproachSide{
      0%   { transform: translate(calc(-50% - 56%), -50%) rotate(-6deg); }
      46%  { transform: translate(calc(-50% + 12%), -50%) rotate(-2deg); } /* casi centro */
      54%  { transform: translate(calc(-50% + 12%), -50%) rotate(-2deg); }
      100% { transform: translate(calc(-50% - 56%), -50%) rotate(-6deg); }
    }

    /* Botones marca Tokengas */
    .actions{
      display:grid; grid-template-columns: 1fr 1fr; gap:12px;
      max-width: 720px; margin: 18px auto 0; padding: 0 12px;
    }
    .btn-blue{
      --background: #0a62ff; --color: #fff;
      --background-activated: #084fcb; --background-focused: #0a62ff;
    }
    .btn-green{
      --background: #00e29b; --color: #053b2d;
      --background-activated: #00c789; --background-focused: #00e29b;
    }

    /* Resultado */
    .result{ max-width: 720px; margin: 18px auto 0; padding: 0 12px; }
    .mono{ font-family: ui-monospace, Menlo, Consolas, monospace; }
    .muted{ opacity: .75; }

    /* Mejora visual de los alerts (overlay) */
    :host ::ng-deep .tok-alert .alert-wrapper { border-radius:16px; }
    :host ::ng-deep .tok-alert .alert-title { font-weight:700; }
    :host ::ng-deep .tok-alert .alert-message { font-size: 14px; line-height:1.35; }
    :host ::ng-deep .tok-alert .alert-input {
      font-size: 22px; letter-spacing: 0.35em; text-align:center;
    }

    @media (prefers-reduced-motion: reduce){
      .wave, .card-img { animation: none; }
    }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Tokengas</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- Animación -->
      <div class="nfc-anim">
        <div class="phone-img"></div>
        <div class="wave w1"></div>
        <div class="wave w2"></div>
        <div class="wave w3"></div>
        <div class="card-img"></div>
      </div>

      <!-- Acciones -->
      <div class="actions">
        <ion-button class="btn-blue"  expand="block" (click)="entradaManual()">Entrada Manual</ion-button>
        <ion-button class="btn-green" expand="block" (click)="leerQR()">Leer QR</ion-button>
      </div>

      <!-- Track leído (mismo screen) -->
      <div class="result" *ngIf="track">
        <ion-card>
          <ion-card-header>
            <ion-card-title>Track leído</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div><b>Valor:</b> <span class="mono">{{ track }}</span></div>
            <div class="muted" *ngIf="uid && uid !== track" style="margin-top:8px">
              <b>UID:</b> <span class="mono">{{ uid }}</span>
            </div>
          </ion-card-content>
        </ion-card>
      </div>
    </ion-content>
  `
})
export class HomePage implements OnInit, OnDestroy {
  track = '';
  uid = '';
  private off?: () => void;
  private askingPin = false;
  private lastUid = '';

  constructor(
    private zone: NgZone,
    private alerts: AlertController,
    private toasts: ToastController
  ) {}

  ngOnInit(): void {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<NfcDetail>;
      const data = ev.detail;
      if (!data) return;

      const txt = data.records?.find(r => !!r.payloadText)?.payloadText?.trim();
      const trackValue = txt || data.uid || '';

      this.zone.run(() => {
        this.uid = (data.uid || '').toUpperCase();
        this.track = (trackValue || '').toUpperCase();
      });

      // Evita alertas duplicadas si el mismo tag dispara varios eventos
      if (!this.askingPin && this.lastUid !== data.uid) {
        this.lastUid = data.uid;
        this.askNipFlow();
        // Permitimos re-leer el mismo tag después de unos segundos
        setTimeout(() => { this.lastUid = ''; }, 3000);
      }
    };

    window.addEventListener('nfc:tag', handler as EventListener);
    this.off = () => window.removeEventListener('nfc:tag', handler as EventListener);
  }

  ngOnDestroy(): void { if (this.off) this.off(); }

  entradaManual() { this.toast('Entrada manual (pendiente)'); }
  leerQR()       { this.toast('Leer QR (pendiente)'); }

  /* ===== Prompts mejorados ===== */
private async askNipFlow() {
  this.askingPin = true;
  try {
    const alert = await this.alerts.create({
      cssClass: 'tok-alert tok-alert--big',
      mode: 'ios',
      header: 'Validar tarjeta',
      message: 'Ingrese su NIP para continuar.',
      backdropDismiss: false,
      inputs: [{
        name: 'pin',
        type: 'password',
        attributes: { inputmode: 'numeric', maxlength: 4, pattern: '\\d*' },
        placeholder: '••••'
      }],
      // Se cierra solo al teclear 4 dígitos; dejamos solo Cancelar
      buttons: [{ text: 'Cancelar', role: 'cancel' }]
    });

    await alert.present();
    await (alert as any).onDidPresent?.();

    const inputEl: HTMLInputElement | null =
      (alert as any).shadowRoot?.querySelector('input.alert-input') ??
      document.querySelector('ion-alert input.alert-input');

    let handled = false;

    if (inputEl) {
      inputEl.setAttribute('inputmode', 'numeric');
      inputEl.setAttribute('maxlength', '4');
      inputEl.focus();

      inputEl.addEventListener('input', async () => {
        if (!inputEl) return;
        const val = inputEl.value.replace(/\D/g, '').slice(0, 4);
        if (inputEl.value !== val) inputEl.value = val;

        if (val.length === 4 && !handled) {
          handled = true;
          await alert.dismiss({ pin: val }, 'auto');
          await this.showSaldo();
        }
      });
    }

    await alert.onDidDismiss();
  } finally {
    this.askingPin = false;
  }
}



  private async showSaldo() {
    const ok = await this.alerts.create({
      cssClass: 'tok-alert',
      header: '✅ Operación exitosa',
      message: `Su saldo es de ${this.formatMoney(2500)} pesos.`,
      buttons: ['OK'],
      backdropDismiss: true
    });
    await ok.present();
  }

  private buildResumen() {
    const short = (s: string) => s.length > 28 ? (s.slice(0, 12) + '…' + s.slice(-8)) : s;
    return {
      track: short(this.track || '—'),
      uid:   short(this.uid || '')
    };
  }

  private formatMoney(v: number) {
    return new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  }

  private async toast(msg: string) {
    const t = await this.toasts.create({ message: msg, duration: 1600, position: 'bottom' });
    await t.present();
  }
}
