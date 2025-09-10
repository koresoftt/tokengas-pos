import { BrowserMultiFormatReader } from '@zxing/browser';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonSpinner, IonButton, IonCard, IonCardHeader,
  IonCardTitle, IonCardContent, IonText
} from '@ionic/angular/standalone';

import { IdReaderService } from '../../services/id-reader.service';
import { Capacitor } from '@capacitor/core';

type NfcRecord = { tnf: number; type: string; payloadHex: string; payloadText?: string };
type NfcDetail = { uid: string; tech: string[]; records: NfcRecord[] };

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonSpinner, IonButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonText
  ],
  templateUrl: './terminal.page.html',
  styleUrls: ['./terminal.page.scss']
})
export class TerminalPage implements OnInit, OnDestroy {
  // UI
  scanning = true;       // true: vista escaneo; false: vista resultado
  nfcLocked = false;     // evita lecturas múltiples del mismo toque

  // Datos
  uid = '';
  detail?: NfcDetail;
  raw: any;

  // Assets
  phoneArt = 'assets/brand/phone.png';
  cardArt  = 'assets/brand/card.png';

  // QR
  qrBusy = false;        // ⬅️ el spinner depende SOLO de esto
  qrMsg = '';
  qrWeb = false;
  private zxing?: BrowserMultiFormatReader;

  private off?: () => void;

  constructor(private zone: NgZone, private idReader: IdReaderService) {}

  async ngOnInit() {
    document.body.classList.add('scanner-mode');
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#000000' });
    } catch {}

    // Evento NFC desde MainActivity (ReaderMode)
    const handler = (e: Event) => {
      if (this.nfcLocked) return;
      this.nfcLocked = true;

      const ev = e as CustomEvent<NfcDetail>;
      const data = ev.detail;

      this.zone.run(async () => {
        this.scanning = false;      // pasar a vista resultado
        this.uid = data?.uid || ''; // mostrar SOLO UID
        this.detail = undefined;
        this.raw = undefined;
        try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
        document.body.classList.remove('scanner-mode');
        console.log('[NFC] tag:', data);
      });
    };

    window.addEventListener('nfc:tag', handler as EventListener);
    this.off = () => window.removeEventListener('nfc:tag', handler as EventListener);
  }

  ngOnDestroy(): void {
    if (this.off) this.off();
    this.stopQrWeb();
    document.body.classList.remove('scanner-mode');
  }

  reset(): void {
    // Volver a modo escaneo
    this.scanning = true;
    this.nfcLocked = false;
    this.uid = '';
    this.detail = undefined;
    this.raw = undefined;
    this.qrBusy = false;
    this.qrMsg = '';
    this.qrWeb = false;
    this.stopQrWeb();
    document.body.classList.add('scanner-mode');

    // Opcional: rearmar nativo sin salir de la Activity
    try { (window as any).NativeNfc?.restart?.(); } catch {}
  }

  // === LECTOR QR (nativo; con fallo a web sólo en PWA) ===
  async leerQr() {
    if (this.qrBusy) return;
    this.qrBusy = true;
    this.qrMsg = 'iniciando…';
    this.qrWeb = false;

    try {
      // 1) Nativo
      const id = await this.idReader.readFromQr();
      if (id) {
        this.onQrOk(this.normalize(id), 'QR(nativo)');
        return;
      }

      // 2) Fallback web si estás en PWA/navegador
      if (Capacitor.getPlatform() === 'web') {
        await this.startQrWeb();
      } else {
        this.qrMsg = 'sin lectura nativa';
      }
    } catch {
      if (Capacitor.getPlatform() === 'web') {
        await this.startQrWeb();
      } else {
        this.qrMsg = 'lector no disponible';
      }
    } finally {
      this.qrBusy = false; // 🔒 asegura que el spinner se apague
    }
  }

  private async startQrWeb() {
    try {
      this.qrMsg = 'fallback web…';
      this.qrWeb = true;
      await new Promise<void>(r => requestAnimationFrame(() => r()));

      if (!this.zxing) this.zxing = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const back = devices.find(d => /back|rear|environment/i.test(d.label || '')) || devices[0];

      await this.zxing.decodeFromVideoDevice(
        back?.deviceId,
        'qr-video',
        (result) => {
          const text = result?.getText?.();
          if (text) {
            const id = this.normalize(text);
            this.onQrOk(id, 'QR(web)');
            this.stopQrWeb();
          }
        }
      );
    } catch (e: any) {
      console.error('[QR-web] error', e);
      this.qrMsg = 'error web: ' + (e?.message || e);
      this.stopQrWeb();
    }
  }

  private stopQrWeb() {
    try {
      (this.zxing as any)?.stopContinuousDecode?.();
      (this.zxing as any)?.stopAsyncDecode?.();
      (this.zxing as any)?.stopStreams?.();
      (this.zxing as any)?.reset?.();
    } catch {}
    this.qrWeb = false;
    this.zxing = undefined;
  }

  private async onQrOk(id: string, via: 'QR(nativo)' | 'QR(web)') {
    this.qrMsg = 'ok';
    this.scanning = false;
    this.uid = id;
    this.detail = undefined;
    this.raw = { via, id };
    document.body.classList.remove('scanner-mode');
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
  }

  private normalize(raw: string): string {
    const t = (raw || '').trim();
    const m = t.match(/([A-Za-z]\d{5,})/);
    return m ? m[1] : t;
  }

  abrirEntradaManual() {
    // TODO: abre modal o ruta de entrada manual
    console.log('Abrir Entrada Manual');
  }
}
