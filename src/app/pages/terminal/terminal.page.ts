import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonSpinner, IonList, IonItem, IonLabel, IonButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular/standalone';

import { IdReaderService } from '../../services/id-reader.service';

type NfcRecord = { tnf: number; type: string; payloadHex: string; payloadText?: string; };
type NfcDetail = { uid: string; tech: string[]; records: NfcRecord[]; };

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonSpinner, IonList, IonItem, IonLabel, IonButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent
  ],
  styles: [`
    ion-content { --background: #ffffff; }

    .center {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:14px; min-height:60vh; text-align:center;
    }

    .uid { font-size: 28px; font-weight: 700; letter-spacing: .5px; }
    .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
    .muted{opacity:.7}

    /* === Ilustración: celular + tarjeta (animado) === */
    .nfc-scene {
      position: relative;
      width: min(88vw, 320px);
      height: 220px;
      margin: 6px auto 4px;
    }

    .phone {
      position: absolute;
      right: 12px; top: 0;
      width: 130px; height: 210px;
      border-radius: 22px;
      background: linear-gradient(180deg, #f7f7f8, #f0f1f3);
      box-shadow:
        inset 0 0 0 2px rgba(0,0,0,.08),
        0 8px 20px rgba(0,0,0,.08);
    }
    .phone::before { /* notch/speaker */
      content:'';
      position:absolute; top:8px; left:50%;
      transform:translateX(-50%);
      width:46px; height:5px; border-radius:3px;
      background: rgba(0,0,0,.2);
    }

    .waves { position:absolute; right:-2px; top:70px; width:0; height:0; }
    .waves span {
      position:absolute; right:0; top:0;
      border: 2px solid #10b981; /* emerald */
      border-left-color: transparent;
      border-bottom-color: transparent;
      border-radius: 0 100% 0 0;
      transform: rotate(45deg);
      opacity:.8;
      animation: wave 1500ms linear infinite;
    }
    .waves span:nth-child(1){ width:16px; height:16px; animation-delay: 0ms; }
    .waves span:nth-child(2){ width:26px; height:26px; animation-delay: 200ms; opacity:.6; }
    .waves span:nth-child(3){ width:36px; height:36px; animation-delay: 400ms; opacity:.45; }

    @keyframes wave {
      0%   { transform: rotate(45deg) scale(0.9); opacity:.85; }
      70%  { opacity:.15; }
      100% { transform: rotate(45deg) scale(1.25); opacity:0; }
    }

    .card {
      position: absolute;
      left: 0; top: 70px;
      width: 160px; height: 100px;
      border-radius: 14px;
      background:
        linear-gradient(135deg, #3b82f6, #06b6d4);
      box-shadow:
        0 8px 20px rgba(0,0,0,.12),
        inset 0 0 0 2px rgba(255,255,255,.25);
      transform: rotate(-2deg);
      animation: approach 2200ms ease-in-out infinite;
    }
    .card::before { /* banda */
      content:'';
      position:absolute; left:12px; top:18px;
      width:64px; height:10px; border-radius:4px;
      background: rgba(255,255,255,.65);
    }
    .card::after { /* chip */
      content:'';
      position:absolute; right:16px; bottom:18px;
      width:22px; height:16px; border-radius:3px;
      background: rgba(255,255,255,.85);
      box-shadow: inset 0 0 0 1px rgba(0,0,0,.06);
    }

    @keyframes approach {
      0%   { transform: translateX(0) rotate(-2deg); }
      50%  { transform: translateX(92px) rotate(0deg); }
      100% { transform: translateX(0) rotate(-2deg); }
    }
  `],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>NFC</ion-title></ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p class="muted">Estado: <b>{{ scanning ? 'escaneando' : 'tag/código leído' }}</b></p>

      <div *ngIf="scanning; else result" class="center">
        <!-- Ilustración animada -->
        <div class="nfc-scene" aria-hidden="true">
          <div class="phone">
            <div class="waves"><span></span><span></span><span></span></div>
          </div>
          <div class="card"></div>
        </div>

        <ion-spinner name="crescent"></ion-spinner>
        <div>
          <h2>Acerca una etiqueta…</h2>
          <p class="muted">Reader Mode activo</p>
        </div>

        <!-- Botón para lanzar el lector QR nativo -->
        <ion-button [disabled]="qrBusy" color="success" (click)="leerQr()">
          {{ qrBusy ? 'Abriendo cámara…' : 'Leer QR' }}
        </ion-button>

        <!-- Mensaje opcional de estado del QR -->
        <p class="muted" *ngIf="qrMsg">{{ qrMsg }}</p>
      </div>

      <ng-template #result>
        <ion-card>
          <ion-card-header>
            <ion-card-title>UID / ID leído</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div class="uid mono">{{ uid || '—' }}</div>
          </ion-card-content>
        </ion-card>

        <div *ngIf="detail">
          <p class="muted"><b>Tecnologías:</b> {{ detail.tech.join(', ') || '—' }}</p>

          <ng-container *ngIf="detail.records?.length; else vacia">
            <h3>Registros NDEF</h3>
            <ion-list>
              <ion-item *ngFor="let r of detail.records">
                <ion-label>
                  <h2>TNF {{ r.tnf }} / {{ r.type }}</h2>
                  <p *ngIf="r.payloadText">Texto: {{ r.payloadText }}</p>
                  <p class="mono">HEX: {{ r.payloadHex }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ng-container>
          <ng-template #vacia><p><i>Etiqueta vacía (sin NDEF)</i></p></ng-template>
        </div>

        <ion-button expand="block" (click)="reset()">Seguir escaneando</ion-button>
        <pre *ngIf="raw">{{ raw | json }}</pre>
      </ng-template>
    </ion-content>
  `
})
export class TerminalPage implements OnInit, OnDestroy {
  scanning = true;
  uid = '';
  detail?: NfcDetail;
  raw: any;
  private off?: () => void;

  // Estado QR
  qrBusy = false;
  qrMsg = '';

  constructor(private zone: NgZone, private idReader: IdReaderService) {}

  ngOnInit(): void {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<NfcDetail>;
      const data = ev.detail;
      this.zone.run(async () => {
        this.scanning = false;
        this.uid = data?.uid || '';
        this.detail = data;
        this.raw = data;
        try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
      });
    };
    window.addEventListener('nfc:tag', handler as EventListener);
    this.off = () => window.removeEventListener('nfc:tag', handler as EventListener);
  }

  ngOnDestroy(): void { if (this.off) this.off(); }

  reset(): void {
    this.scanning = true;
    this.uid = '';
    this.detail = undefined;
    this.raw = undefined;
    this.qrBusy = false;
    this.qrMsg = '';
  }

  // Lector QR nativo
  async leerQr() {
    if (this.qrBusy) return;
    this.qrBusy = true;
    this.qrMsg = 'abriendo cámara…';

    try {
      const id = await this.idReader.readFromQr();
      if (id && id.trim()) {
        await this.onQrOk(id.trim());
      } else {
        this.qrMsg = 'no se leyó ningún código';
      }
    } catch {
      this.qrMsg = 'lector no disponible';
    } finally {
      this.qrBusy = false;
    }
  }

  private async onQrOk(id: string) {
    this.scanning = false;
    this.uid = id;
    this.detail = undefined; // QR no trae NDEF
    this.raw = { via: 'QR(nativo)', id };
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
  }
}
