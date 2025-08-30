import { Component, OnDestroy, OnInit } from '@angular/core';

type NfcRecord = {
  tnf: number;
  type: string;
  payloadHex: string;
  payloadText?: string;
};

type NfcDetail = {
  uid: string;
  tech: string[];
  records: NfcRecord[];
};

@Component({
  selector: 'app-terminal',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>NFC</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p><b>UID:</b> {{ uid || '—' }}</p>

      <div *ngIf="detail">
        <p><b>Tecnologías:</b> {{ detail.tech.join(', ') || '—' }}</p>

        <ng-container *ngIf="detail.records?.length; else vacia">
          <h3>Registros NDEF</h3>
          <ion-list>
            <ion-item *ngFor="let r of detail.records; let i = index">
              <ion-label>
                <h2>TNF {{ r.tnf }} / {{ r.type }}</h2>
                <p *ngIf="r.payloadText">Texto: {{ r.payloadText }}</p>
                <p class="mono">HEX: {{ r.payloadHex }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ng-container>
        <ng-template #vacia>
          <p><i>Etiqueta vacía (sin NDEF)</i></p>
        </ng-template>
      </div>

      <pre *ngIf="raw">{{ raw | json }}</pre>
    </ion-content>
  `,
  styles: [`.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; }`]
})
export class TerminalPage implements OnInit, OnDestroy {
  uid = '';
  detail?: NfcDetail;
  raw: any;
  private off?: () => void;

  ngOnInit(): void {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<NfcDetail>;
      const data = ev.detail;
      this.uid = data?.uid || '';
      this.detail = data;
      this.raw = data;
      console.log('NFC tag', data);
    };

    window.addEventListener('nfc:tag', handler as EventListener);
    this.off = () => window.removeEventListener('nfc:tag', handler as EventListener);
  }

  ngOnDestroy(): void {
    if (this.off) this.off();
  }
}
