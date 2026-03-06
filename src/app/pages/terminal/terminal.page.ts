import { BrowserMultiFormatReader } from '@zxing/browser';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App } from '@capacitor/app';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

import { Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonHeader, IonToolbar, IonContent, IonSpinner,
  IonModal, IonItem, IonInput, IonLabel, IonButton,
  IonAlert
} from '@ionic/angular/standalone';

import { IdReaderService } from '../../services/id-reader.service';
import { AppPosService } from 'src/app/core/services/app-pos.service';
import { AppBootstrapService } from 'src/app/core/services/app-bootstrap.service';

type NfcRecord = { tnf: number; type: string; payloadHex: string; payloadText?: string };
type NfcDetail = { uid: string; tech: string[]; records: NfcRecord[] };

type ViewState = 'SCAN' | 'FUELS' | 'AUTHORIZED' | 'DONE' | 'ERROR';
type FuelItem = { code: number; label: string; price: number };

type PromptKey =
  | 'primary_pin'
  | 'secondary_pin'
  | 'odometer'
  | 'vehicle_id'
  | 'driver_id'
  | 'engine_hours'
  | 'truck_unit_number'
  | 'miscellaneous'
  | string;

function nowEpochSec(): number {
  return Math.floor(Date.now() / 1000);
}

function opId(): string {
  const anyCrypto: any = crypto as any;
  if (typeof anyCrypto.randomUUID === 'function') return anyCrypto.randomUUID();
  return `op_${nowEpochSec()}_${Math.floor(Math.random() * 1e9)}`;
}

@Component({
  selector: 'app-terminal',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonContent, IonSpinner,
    IonModal, IonItem, IonInput, IonLabel, IonButton,
    IonAlert
  ],
  templateUrl: './terminal.page.html',
  styleUrls: ['./terminal.page.scss']
})
export class TerminalPage implements OnInit, OnDestroy {
  // ===== Assets =====
  phoneArt = 'assets/brand/phone.png';
  cardArt = 'assets/brand/card.png';
  logoArt = 'assets/brand/tokengas-logo.png';

  // ===== View =====
  view: ViewState = 'SCAN';

  // ===== Overlay/Toast =====
  busy = false;
  busyText = 'Procesando…';
  toast = '';

  // ===== QR =====
  qrBusy = false;
  qrMsg = '';
  qrWeb = false;
  private zxing?: BrowserMultiFormatReader;

  // ===== NFC lock =====
  private nfcLocked = false;
  private offNfc?: () => void;

  // ===== Back/appstate listeners =====
  private offBack?: () => void;
  private offState?: () => void;

  // ===== Exit alert =====
  exitAlertOpen = false;
  exitAlertButtons = [
    {
      text: 'NO',
      role: 'cancel',
      handler: () => { this.exitAlertOpen = false; }
    },
    {
      text: 'SI, CANCELAR',
      role: 'destructive',
      handler: async () => {
        this.exitAlertOpen = false;
        await this.resetToScan(true);
      }
    }
  ];

  // ===== Menu provisional (engrane) =====
  menuOpen = false;
  openMainMenu() { this.menuOpen = true; }
  closeMainMenu() { this.menuOpen = false; }
  menuAction(action: string) {
    this.menuOpen = false;
    this.toast = `Pendiente: ${action}`;
  }

  // ===== TX =====
  terminal_id = '';
  operation_id = '';
  tx_token = '';
  authorization_code = '';
  uid_track = '';

  // ===== Fuels =====
  fuels: FuelItem[] = [
    { code: 10100, label: 'Magna', price: 24.99 },
    { code: 10300, label: 'Premium', price: 25.99 },
    { code: 10400, label: 'Diesel', price: 25.49 },
  ];
  selectedFuel?: FuelItem;

  // ===== Authorized =====
  authorized_amount = 0; // preauth_max_amount
  amountToCharge = 0;
  doneAmount = 0;

  // ===== Prompt chain =====
  promptOpen = false;
  requiredFields: PromptKey[] = [];
  promptIndex = 0;
  promptValue = '';
  promptError = '';
  inputs: Record<string, any> = {};
  inputArmed = false; // evita teclado automático en no-pin

  // ===== Settings modal =====
  settingsOpen = false;

  constructor(
    private zone: NgZone,
    private idReader: IdReaderService,
    private appPos: AppPosService,
    private bootstrap: AppBootstrapService,
  ) {}

  // ======================
  // Lifecycle
  // ======================
  async ngOnInit() {
    try {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#f7f7f8' });
    } catch {}

    try { await this.appPos.ensureKeys(); } catch {}

    this.terminal_id = await this.bootstrap.getDeviceUid();
    await this.loadFuels();

    this.setupNfcListener();
    await this.setupBackAndAppState();

    this.resetSoft();
  }

  ngOnDestroy(): void {
    this.offNfc?.();
    this.offBack?.();
    this.offState?.();
    this.stopQrWeb();
  }

  // ======================
  // NFC
  // ======================
  private setupNfcListener() {
    const handler = (e: Event) => {
      if (this.nfcLocked) return;
      this.nfcLocked = true;

      const ev = e as CustomEvent<NfcDetail>;
      const data = ev.detail;

      this.zone.run(async () => {
        const id = (data?.uid || '').trim();
        try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}

        if (!id) {
          this.toast = 'No se pudo leer el dispositivo';
          this.nfcLocked = false;
          return;
        }
        await this.onTrackRead(id, 'NFC');
      });
    };

    window.addEventListener('nfc:tag', handler as EventListener);
    this.offNfc = () => window.removeEventListener('nfc:tag', handler as EventListener);
  }

  // ======================
  // Back + background
  // ======================
  private async setupBackAndAppState() {
    const backSub = await App.addListener('backButton', async () => {
      if (this.hasCancelableTx()) {
        this.exitAlertOpen = true;
        return;
      }
      if (this.view !== 'SCAN') {
        await this.resetToScan(false);
        return;
      }
      App.exitApp();
    });
    this.offBack = () => backSub.remove();

    const stateSub = await App.addListener('appStateChange', async (st) => {
      if (!st.isActive && this.hasCancelableTx()) {
        await this.cancelIfActive();
      }
    });
    this.offState = () => stateSub.remove();
  }

  // ======================
  // Helpers
  // ======================
  private resetSoft() {
    this.view = 'SCAN';
    this.busy = false;
    this.busyText = 'Procesando…';
    this.toast = '';

    this.qrBusy = false;
    this.qrMsg = '';
    this.qrWeb = false;
    this.stopQrWeb();

    this.nfcLocked = false;

    this.operation_id = '';
    this.tx_token = '';
    this.authorization_code = '';
    this.uid_track = '';

    this.selectedFuel = undefined;

    this.authorized_amount = 0;
    this.amountToCharge = 0;
    this.doneAmount = 0;

    this.promptOpen = false;
    this.requiredFields = [];
    this.promptIndex = 0;
    this.promptValue = '';
    this.promptError = '';
    this.inputs = {};
    this.inputArmed = false;

    this.menuOpen = false;

    try { (window as any).NativeNfc?.restart?.(); } catch {}
  }

  private normalizeTrack(raw: string): string {
    const t = (raw || '').trim();
    const m = t.match(/([A-Za-z]\d{5,})/);
    return m ? m[1] : t;
  }

  private hasCancelableTx(): boolean {
    return !!this.operation_id && !!this.tx_token && !!this.authorization_code &&
      (this.view === 'FUELS' || this.view === 'AUTHORIZED' || this.promptOpen);
  }

  // ======================
  // QR
  // ======================
  async leerQr() {
    if (this.qrBusy) return;
    this.qrBusy = true;
    this.qrMsg = 'Iniciando…';
    this.qrWeb = false;
    this.toast = '';

    try {
      const id = await this.idReader.readFromQr();
      if (id) {
        await this.onTrackRead(this.normalizeTrack(id), 'QR(nativo)');
        return;
      }

      if (Capacitor.getPlatform() === 'web') {
        await this.startQrWeb();
      } else {
        this.qrMsg = 'Lector no disponible';
      }
    } catch {
      if (Capacitor.getPlatform() === 'web') {
        await this.startQrWeb();
      } else {
        this.qrMsg = 'Lector no disponible';
      }
    } finally {
      this.qrBusy = false;
    }
  }

  private async startQrWeb() {
    try {
      this.qrMsg = 'Apunta al QR…';
      this.qrWeb = true;
      await new Promise<void>(r => requestAnimationFrame(() => r()));

      if (!this.zxing) this.zxing = new BrowserMultiFormatReader();
      const devices = await BrowserMultiFormatReader.listVideoInputDevices();
      const back = devices.find(d => /back|rear|environment/i.test(d.label || '')) || devices[0];

      await this.zxing.decodeFromVideoDevice(
        back?.deviceId,
        'qr-video',
        async (result) => {
          const text = result?.getText?.();
          if (text) {
            this.stopQrWeb();
            await this.onTrackRead(this.normalizeTrack(text), 'QR(web)');
          }
        }
      );
    } catch {
      this.qrMsg = 'Error cámara';
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

  abrirEntradaManual() {
    this.toast = 'Entrada manual: pendiente';
  }

  // ======================
  // Track read => FUELS
  // ======================
  private async onTrackRead(track: string, _via: string) {
    this.uid_track = track;
    this.toast = '';
    this.qrMsg = '';
    this.nfcLocked = false;

    this.operation_id = opId();
    this.inputs = {};
    this.requiredFields = [];
    this.promptIndex = 0;
    this.promptValue = '';
    this.promptError = '';
    this.promptOpen = false;
    this.inputArmed = false;

    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}

    this.view = 'FUELS';
  }

  // ======================
  // Fuels storage (por terminal)
  // ======================
  private fuelsKey(): string {
    return `tg_fuels_v1_${this.terminal_id}`;
  }

  private async loadFuels() {
    try {
      const { value } = await Preferences.get({ key: this.fuelsKey() });
      if (!value) return;

      const arr = JSON.parse(value);
      if (!Array.isArray(arr)) return;

      const map = new Map<number, FuelItem>();
      for (const f of this.fuels) map.set(f.code, { ...f });

      for (const x of arr) {
        const code = Number(x?.code);
        const price = Number(x?.price);
        const label = String(x?.label || '');
        if (map.has(code) && price > 0) {
          const cur = map.get(code)!;
          map.set(code, { ...cur, price, label: label || cur.label });
        }
      }
      this.fuels = Array.from(map.values());
    } catch {}
  }

  private async saveFuels() {
    try {
      await Preferences.set({ key: this.fuelsKey(), value: JSON.stringify(this.fuels) });
    } catch {}
  }

  // ======================
  // Settings modal
  // ======================
  openSettings() {
    this.settingsOpen = true;
  }
  closeSettings() {
    this.settingsOpen = false;
  }

  updateFuelPrice(code: number, rawValue: any) {
    let s = String(rawValue ?? '').trim();
    s = s.replace(/[^\d.,]/g, '');
    s = s.replace(',', '.');

    const parts = s.split('.');
    if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');

    const [i, d] = s.split('.');
    if (d != null) s = `${i}.${d.slice(0, 3)}`;

    const p = Number(s);
    if (!(p > 0)) return;

    this.fuels = this.fuels.map(f => (f.code === code ? { ...f, price: p } : f));
  }

  async saveSettings() {
    await this.saveFuels();
    this.settingsOpen = false;
    this.toast = 'Precios guardados';
  }

  // ======================
  // Fuel selection => PREAUTH
  // ======================
  async selectFuel(f: FuelItem) {
    this.selectedFuel = f;
    this.toast = '';
    await this.runPreauth();
  }

  private async runPreauth() {
    if (!this.uid_track || !this.selectedFuel) return;

    this.busy = true;
    this.busyText = 'Autorizando…';
    this.toast = '';

    try {
      const body: any = {
        terminal_id: this.terminal_id,
        operation_id: this.operation_id,
        pump_number: null,
        primary_track: this.uid_track,
        product_code: this.selectedFuel.code,
        product_unit_price: Number(this.selectedFuel.price),
        product_amount: 0,
        ...this.inputs,
      };

      const r = await this.appPos.preauth(body);
      const resp = r?.resp || {};

      this.tx_token = resp?.tx_token || this.tx_token || '';
      this.authorization_code =
        resp?.authorization_code ||
        resp?.atio?.AuthorizationCode ||
        this.authorization_code ||
        '';

      const required: string[] = Array.isArray(resp?.required_fields) ? resp.required_fields : [];
      const rc = String(resp?.atio?.ResponseCode || '');
      const rt = String(resp?.atio?.ResponseText || resp?.atio?.ResponseMessage || resp?.message || '');

      this.authorized_amount = Number(resp?.preauth_max_amount ?? 0) || 0;

      if (required.length || rc.startsWith('405')) {
        this.openPrompt(required);
        this.view = 'FUELS';
        return;
      }

      if (rc === '00000' || String(resp?.status || '') === 'PREAUTH_OK') {
        try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
        this.amountToCharge = 0;
        this.view = 'AUTHORIZED';
        return;
      }

      this.view = 'ERROR';
      this.toast = rt || rc || 'No se pudo autorizar';
      try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    } catch (e: any) {
      const err = this.appPos.error$.value;
      this.view = 'ERROR';
      this.toast = err?.message || err?.code || e?.message || 'Error';
      try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    } finally {
      this.busy = false;
    }
  }

  // ======================
  // Amount input
  // ======================
  onAmountToChargeInput(raw: any) {
    let s = String(raw ?? '').trim();
    s = s.replace(/[^\d.,]/g, '');
    s = s.replace(',', '.');

    const parts = s.split('.');
    if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');

    const [i, d] = s.split('.');
    if (d != null) s = `${i}.${d.slice(0, 2)}`; // monto a 2 decimales

    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) return;
    this.amountToCharge = n;
  }

  // ======================
  // Prompt chain
  // ======================
  private openPrompt(required: string[]) {
    const list = (Array.isArray(required) && required.length) ? required : ['primary_pin'];
    this.requiredFields = list as PromptKey[];

    this.promptIndex = 0;
    this.promptValue = '';
    this.promptError = '';
    this.promptOpen = true;
    this.inputArmed = false;

    try { Haptics.impact({ style: ImpactStyle.Light }); } catch {}
  }

  get currentField(): PromptKey {
    return this.requiredFields[this.promptIndex] || '';
  }

  isPinField(field: string): boolean {
    const f = String(field || '').toLowerCase();
    return f === 'primary_pin' || f === 'secondary_pin' || f.includes('pin');
  }

  isOdometerField(field: string): boolean {
    const f = String(field || '').toLowerCase();
    return f === 'odometer' || f.includes('odometer') || f.includes('kilomet');
  }

  get isPinPrompt(): boolean {
    return this.isPinField(String(this.currentField));
  }

  get promptInputMode(): string {
    const k = String(this.currentField || '').toLowerCase();
    if (this.isPinField(k)) return 'numeric';
    if (this.isOdometerField(k)) return 'numeric'; // KILOMETRAJE SIEMPRE NUMÉRICO
    if (k === 'engine_hours') return 'numeric';
    return 'text';
  }

  get promptMaxLen(): number {
    const k = String(this.currentField || '').toLowerCase();
    if (this.isPinField(k)) return 4;
    if (this.isOdometerField(k)) return 9;
    if (k === 'engine_hours') return 7;
    if (k === 'vehicle_id') return 10;
    return 32;
  }

  get promptTitle(): string {
    const k = String(this.currentField || '');
    const map: Record<string, string> = {
      primary_pin: 'CAPTURA NIP',
      secondary_pin: 'CAPTURA NIP SECUNDARIO',
      odometer: 'CAPTURA KILOMETRAJE',
      vehicle_id: 'CAPTURA PLACA',
      driver_id: 'CAPTURA OPERADOR',
      engine_hours: 'CAPTURA HORAS MOTOR',
      truck_unit_number: 'CAPTURA UNIDAD',
    };
    return map[k] || `CAPTURA ${k.replace(/_/g, ' ').toUpperCase()}`;
  }

  get promptHint(): string {
    const k = String(this.currentField || '');
    const map: Record<string, string> = {
      primary_pin: 'Ingresa 4 dígitos',
      secondary_pin: 'Ingresa 4 dígitos',
      odometer: 'Solo números (ej: 123456)',
      vehicle_id: 'Sin guiones (ej: ABC123)',
      driver_id: 'Ejemplo: 000123',
      engine_hours: 'Solo números (ej: 1540)',
      truck_unit_number: 'Ejemplo: 12',
    };
    return map[k] || 'Toca para escribir';
  }

  // Iconos por campo
  get promptIcon(): 'pin' | 'keypad' | 'speed' | 'plate' | 'user' | 'clock' | 'truck' | 'edit' {
    const k = String(this.currentField || '').toLowerCase();
    if (k.includes('pin')) return 'pin';
    if (this.isOdometerField(k)) return 'speed';
    if (k === 'vehicle_id' || k.includes('vehicle')) return 'plate';
    if (k.includes('driver')) return 'user';
    if (k.includes('engine')) return 'clock';
    if (k.includes('truck')) return 'truck';
    return 'keypad';
  }

  get promptIconSrc(): string {
  const k = String(this.promptIcon || '');
  const map: Record<string, string> = {
    pin: 'assets/icons/pin.svg',
    keypad: 'assets/icons/keypad.svg',
    speed: 'assets/icons/speed.svg',
    plate: 'assets/icons/plate.svg',
    user: 'assets/icons/user.svg',
    clock: 'assets/icons/clock.svg',
    truck: 'assets/icons/truck.svg',
    edit: 'assets/icons/keypad.svg',
  };
  return map[k] || 'assets/icons/keypad.svg';
}

  armInput() {
    if (!this.isPinPrompt) this.inputArmed = true;
  }

  onPromptInput(ev: any) {
    let v = (ev?.detail?.value ?? ev?.target?.value ?? '').toString();

    const field = String(this.currentField || '').toLowerCase();

    if (this.isPinPrompt) {
      v = v.replace(/\D+/g, '').slice(0, 4);
      this.promptValue = v;

      if (v.length === 4) {
        try { Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        this.onPromptOk();
      }
      return;
    }

    // kilometraje SIEMPRE numérico
    if (this.isOdometerField(field) || field === 'engine_hours') {
      v = v.replace(/\D+/g, '');
    }

    // placa SIN guiones/espacios
    if (field === 'vehicle_id') {
      v = v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    }

    this.promptValue = v;
  }

  async onPromptOk() {
    const fieldRaw = String(this.currentField || '');
    const field = fieldRaw.toLowerCase();
    const v = (this.promptValue ?? '').toString().trim();

    this.promptError = '';

    if (!fieldRaw) {
      this.promptOpen = false;
      return;
    }

    if (this.isPinField(fieldRaw)) {
      if (!/^\d{4}$/.test(v)) {
        this.promptError = 'NIP inválido';
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        return;
      }
      this.inputs[fieldRaw] = v;
    } else if (this.isOdometerField(field) || field === 'engine_hours') {
      if (!/^\d+$/.test(v)) {
        this.promptError = 'Solo números';
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        return;
      }
      this.inputs[fieldRaw] = v;
    } else if (field === 'vehicle_id') {
  // permitir 1..10 (porque el backend a veces pide solo “algo” y no queremos bloquear)
  if (!/^[A-Z0-9]{1,10}$/.test(v.toUpperCase())) {
    this.promptError = 'Placa inválida (sin guiones)';
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    return;
  }
  this.inputs[fieldRaw] = v.toUpperCase();
} else {
      if (!v) {
        this.promptError = 'Campo requerido';
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        return;
      }
      this.inputs[fieldRaw] = v;
    }

    // siguiente
    this.promptValue = '';
    this.inputArmed = false;
    this.promptIndex++;

    if (this.promptIndex < this.requiredFields.length) {
      try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
      return;
    }

    this.promptOpen = false;
    await this.runPreauth();
  }

  async promptChangeFuel() {
    await this.cancelIfActive();
    this.inputs = {};
    this.requiredFields = [];
    this.promptIndex = 0;
    this.promptValue = '';
    this.promptError = '';
    this.promptOpen = false;
    this.inputArmed = false;
    this.view = 'FUELS';
  }

  async promptScanAgain() {
    await this.resetToScan(true);
  }

  // ======================
  // Completion
  // ======================
  async complete() {
    if (!this.tx_token || !this.authorization_code || !this.operation_id) {
      this.toast = 'Falta autorización';
      return;
    }

    const amount = Number(this.amountToCharge || 0);
    if (!(amount > 0)) {
      this.toast = 'Captura la cantidad';
      return;
    }

    if (this.authorized_amount > 0 && amount > this.authorized_amount) {
      this.toast = 'Excede el saldo autorizado';
      return;
    }

    this.busy = true;
    this.busyText = 'Completando…';
    this.toast = '';

    try {
      const resp = await this.appPos.completion({
        terminal_id: this.terminal_id,
        operation_id: this.operation_id,
        authorization_code: this.authorization_code,
        product_amount: amount,
        tx_token: this.tx_token,
      });

      const rc = String(resp?.ui?.response_code || resp?.atio?.ResponseCode || resp?.status || '');
      const rt = String(resp?.ui?.response_text || resp?.message || '');

      if (rc && rc !== '00000' && rc !== 'COMPLETED') {
        this.toast = rt || 'No se pudo completar';
        return;
      }

      this.doneAmount = amount;
      this.view = 'DONE';
      try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
    } catch (e: any) {
      const err = this.appPos.error$.value;
      this.toast = err?.message || err?.code || e?.message || 'Error al completar';
      this.view = 'AUTHORIZED';
      try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    } finally {
      this.busy = false;
    }
  }

  // ======================
  // Cancel + Reset
  // ======================
  async cancelIfActive() {
    if (!this.tx_token || !this.authorization_code || !this.operation_id) return;
    try {
      await this.appPos.cancel({
        terminal_id: this.terminal_id,
        operation_id: this.operation_id,
        authorization_code: this.authorization_code,
        tx_token: this.tx_token,
      });
    } catch {}
  }

  confirmExitToScan() {
    if (this.hasCancelableTx()) {
      this.exitAlertOpen = true;
      return;
    }
    this.resetToScan(false);
  }

  async resetToScan(shouldCancel: boolean) {
    if (shouldCancel) await this.cancelIfActive();
    this.resetSoft();
  }
}