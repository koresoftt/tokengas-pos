
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonSpinner, IonList, IonItem, IonLabel, IonButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent
} from '@ionic/angular/standalone';

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
    .center { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; min-height:60vh; text-align:center; }
    .uid { font-size: 28px; font-weight: 700; letter-spacing: .5px; }
    .mono{font-family:ui-monospace,Menlo,Consolas,monospace}
    .muted{opacity:.7}
  `],
  template: `
    <ion-header>
      <ion-toolbar><ion-title>NFC</ion-title></ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p class="muted">Estado: <b>{{ scanning ? 'escaneando' : 'tag leído' }}</b></p>

      <div *ngIf="scanning; else result" class="center">
        <ion-spinner name="crescent"></ion-spinner>
        <div><h2>Acerca una etiqueta…</h2><p>Reader Mode activo</p></div>
      </div>

      <ng-template #result>
        <ion-card>
          <ion-card-header>
            <ion-card-title>UID leído</ion-card-title>
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

  constructor(private zone: NgZone) {}

  ngOnInit(): void {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<NfcDetail>;
      const data = ev.detail;
      this.zone.run(() => {
        this.scanning = false;
        this.uid = data?.uid || '';
        this.detail = data;
        this.raw = data;
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
  }
}
