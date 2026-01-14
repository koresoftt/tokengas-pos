// src/app/pages/activacion/activacion.page.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';

import {
  IonContent,
  IonButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonList,
  IonItem,
  IonLabel,
  IonText,
  IonSpinner,
  IonAlert,
} from '@ionic/angular/standalone';

import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { Clipboard } from '@capacitor/clipboard';

import { LoadingController, ToastController } from '@ionic/angular';

import {
  TerminalStateService,
  ActivationRequestPayload,
} from 'src/app/core/services/terminal-state.service';

type ActivationUiStatus = 'IDLE' | 'PENDING' | 'ERROR';

@Component({
  selector: 'app-activacion',
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonButton,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonText,
    IonSpinner,
    IonAlert,
  ],
  templateUrl: './activacion.page.html',
  styleUrls: ['./activacion.page.scss'],
})
export class ActivacionPage implements OnInit {
  // --- Estado de carga/errores ---
  loadingDevice = signal<boolean>(true);
  loadingGeo = signal<boolean>(true);
  errorDevice = signal<string | null>(null);
  errorGeo = signal<string | null>(null);

  // --- Datos del dispositivo ---
  deviceId = signal<string>('');
  model = signal<string>('');
  platform = signal<string>('');
  osVersion = signal<string>('');

  // --- Geolocalización ---
  lat = signal<number | null>(null);
  lon = signal<number | null>(null);
  accuracy = signal<number | null>(null);

  // --- Panel técnico (triple-tap) ---
  showVerifier = signal<boolean>(false);

  // --- Vista del JSON que se envía (debug) ---
  showJson = signal<boolean>(false);
  jsonStr = signal<string>('');

  // --- Estado de envío ---
  sending = signal<boolean>(false);

  // 🔒 LOCK anti-doble envío (clave)
  private sendingLock = false;

  // --- Estado de activación en la UI ---
  activationRequested = signal<boolean>(false);
  activationStatus = signal<ActivationUiStatus>('IDLE');
  activationMessage = signal<string | null>(null);

  // --- App Version ---
  private appVersion = signal<string>('1.0.0');

  // --- Triple tap ---
  private tapCount = 0;
  private lastTapTime = 0;
  private readonly TAP_WINDOW_MS = 450;
  private readonly TAPS_REQUIRED = 3;

  // --- IonAlert (standalone) ---
  showOperatorPrompt = signal<boolean>(false);

  operatorAlertInputs = [
    { name: 'operatorId', type: 'text', placeholder: 'Ej. HUMAYA' },
  ];

  operatorAlertButtons = [
    {
      text: 'Cancelar',
      role: 'cancel',
      handler: () => {
        this.showOperatorPrompt.set(false);
        return true;
      },
    },
    {
      text: 'Continuar',
      role: 'confirm',
      handler: (data: any) => {
        const operatorId = String(data?.operatorId || '').trim();
        console.log('[ACTIVACION] operatorId=', operatorId);

        if (!operatorId) {
          void this.showToast('Debes capturar el operador.', 'warning');
          return false; // NO cierra el alert
        }

        this.showOperatorPrompt.set(false);
        void this.sendActivationRequest(operatorId);
        return true;
      },
    },
  ];

  constructor(
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  get canActivate(): boolean {
    return (
      !!this.deviceId() &&
      this.lat() !== null &&
      this.lon() !== null &&
      !this.loadingDevice() &&
      !this.loadingGeo()
    );
  }

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize() {
    try {
      console.log('[ACTIVACION] initialize: ensureAppKeys...');
      await this.terminalState.ensureAppKeys();
      console.log('[ACTIVACION] initialize: ensureAppKeys OK');
    } catch (e) {
      console.warn('[ACTIVACION] ensureAppKeys failed (ignored)', e);
    }

    await this.loadAppVersion();
    await this.initDevice();
    await this.initGeo();
    await this.restoreActivationState();
  }

  private async loadAppVersion() {
    try {
      const info = await App.getInfo();
      this.appVersion.set(info.version || '1.0.0');
    } catch {
      this.appVersion.set('1.0.0');
    }
  }

  private getAppVersionSafe(): string {
    return this.appVersion() || '1.0.0';
  }

  // === Device ===
  private async initDevice() {
    try {
      this.loadingDevice.set(true);
      this.errorDevice.set(null);

      const info = await Device.getInfo();
      const uid = await this.terminalState.getDeviceUid();

      this.deviceId.set(uid);
      this.model.set(info.model || '');
      this.platform.set(info.platform || '');
      this.osVersion.set(info.osVersion || '');
    } catch (err) {
      console.error('Device error:', err);
      this.errorDevice.set('No se pudo obtener el ID del dispositivo.');
    } finally {
      this.loadingDevice.set(false);
    }
  }

  // === Geo ===
  private async initGeo() {
    try {
      this.loadingGeo.set(true);
      this.errorGeo.set(null);

      const current = await Geolocation.checkPermissions();
      if (current.location !== 'granted') {
        const req = await Geolocation.requestPermissions();
        if (req.location !== 'granted') {
          this.errorGeo.set('Permiso de ubicación no concedido.');
          return;
        }
      }

      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });

      this.lat.set(pos.coords.latitude);
      this.lon.set(pos.coords.longitude);
      this.accuracy.set(pos.coords.accuracy ?? null);
    } catch (err) {
      console.error('Geo error:', err);
      this.errorGeo.set('No se pudo obtener la ubicación (revisa permisos y GPS).');
    } finally {
      this.loadingGeo.set(false);
    }
  }

  private async ensureData(): Promise<boolean> {
    let ok = true;

    if (!this.deviceId()) {
      await this.initDevice();
      ok = ok && !!this.deviceId();
    }

    if (this.lat() === null || this.lon() === null) {
      await this.initGeo();
      ok = ok && this.lat() !== null && this.lon() !== null;
    }

    return ok;
  }

  private async restoreActivationState() {
    try {
      const result = await this.terminalState.checkTerminalStatus();

      if (result.status === 'ACTIVE') {
        await this.terminalState.clearPending();
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      if (result.status === 'PENDING') {
        await this.terminalState.markPending();
        this.activationRequested.set(true);
        this.activationStatus.set('PENDING');
        this.activationMessage.set(
          'Tu solicitud de activación está en proceso. Cuando el administrador la apruebe, podrás usar esta terminal.'
        );
        return;
      }

      // NOT_REGISTERED / ERROR => dejar UI libre
      await this.terminalState.clearPending();
      this.activationRequested.set(false);
      this.activationStatus.set('IDLE');
      this.activationMessage.set(null);
    } catch (err) {
      console.error('[ACTIVACION] Error restaurando estado:', err);
      this.activationStatus.set('ERROR');
      this.activationMessage.set('No se pudo verificar el estado de la terminal.');
    }
  }

  // === Triple tap logo ===
  onLogoTap() {
    const now = Date.now();
    this.tapCount = now - this.lastTapTime <= this.TAP_WINDOW_MS ? this.tapCount + 1 : 1;
    this.lastTapTime = now;

    if (this.tapCount >= this.TAPS_REQUIRED) {
      this.tapCount = 0;
      this.showVerifier.set(!this.showVerifier());
    }
  }

  // === Botón Activar ===
  async onActivateClick() {
    if (this.sending()) return;

    console.log('[ACTIVACION] CLICK botón Activar');

    if (this.activationRequested()) {
      await this.showToast('Esta terminal ya tiene una solicitud registrada. Espera la activación.', 'warning');
      return;
    }

    const ready = await this.ensureData();
    if (!ready) {
      await this.showToast('Necesitamos ubicación para activar. Revisa permisos/GPS.', 'warning');
      return;
    }

    this.showOperatorPrompt.set(true);
  }

  onOperatorDismiss(_ev: any) {
    this.showOperatorPrompt.set(false);
  }

  // === Enviar solicitud vía BFF ===
  private async sendActivationRequest(operatorId: string) {
    if (this.sendingLock) {
      console.warn('[ACTIVACION] sendActivationRequest bloqueado');
      return;
    }
    this.sendingLock = true;

    const payload: ActivationRequestPayload = {
      app_version: this.getAppVersionSafe(),
      modelo: this.model() || 'UNKNOWN',
      operator_id: operatorId,
      geo_lat: this.lat() ?? 0,
      geo_lon: this.lon() ?? 0,
    };

    console.log('[ACTIVACION] sending payload', payload);

    this.jsonStr.set(JSON.stringify(payload, null, 2));
    this.showJson.set(true);
    this.sending.set(true);

    // ✅ 1) DISPARA EL REQUEST INMEDIATO
    console.log('[ACTIVACION] FIRE REQUEST -> createActivationRequest');
    const reqPromise = this.terminalState.createActivationRequest(payload);

    // ✅ 2) Overlay NO BLOQUEANTE (si falla, no importa)
    let loading: any = null;
    this.loadingCtrl
      .create({ message: 'Enviando solicitud…' })
      .then((l: any) => {
        loading = l;
        return l.present();
      })
      .catch((e: any) => console.warn('[ACTIVACION] loading overlay failed (ignored)', e));

    try {
      // ✅ 3) Espera el resultado del request
      const resp = await reqPromise;
      console.log('[ACTIVACION] resp=', resp);

      if (resp?.ok) {
        this.activationRequested.set(true);
        this.activationStatus.set('PENDING');
        this.activationMessage.set(
          'Solicitud enviada. En cuanto el administrador la apruebe, esta terminal quedará lista.'
        );
        await this.showToast('Solicitud enviada correctamente.', 'success');
        return;
      }

      const pending = await this.terminalState.isEnrollPending();
      if (pending) {
        this.activationRequested.set(true);
        this.activationStatus.set('PENDING');
        this.activationMessage.set(resp?.message || 'Ya existe una solicitud registrada. Espera la activación.');
        await this.showToast(this.activationMessage()!, 'warning');
      } else {
        this.activationStatus.set('ERROR');
        this.activationMessage.set(resp?.message || 'No se pudo crear la solicitud. Revisa la conexión.');
        await this.showToast(this.activationMessage()!, 'danger');
      }
    } catch (err) {
      console.error('[ACTIVACION] request error:', err);
      this.activationStatus.set('ERROR');
      this.activationMessage.set('Error al enviar la solicitud.');
      await this.showToast('Error al enviar la solicitud.', 'danger');
    } finally {
      this.sending.set(false);
      this.sendingLock = false;

      try {
        await loading?.dismiss?.();
      } catch {}
    }
  }

  // === Botón "Revisar estado" ===
  async onCheckStatusClick() {
    const loading = await this.loadingCtrl.create({ message: 'Revisando estado de activación…' });
    await loading.present();

    try {
      const result = await this.terminalState.checkTerminalStatus();

      if (result.status === 'ACTIVE') {
        await this.terminalState.clearPending();
        await this.showToast('Terminal activa. Cargando menú principal…', 'success');
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      if (result.status === 'PENDING') {
        await this.terminalState.markPending();
        this.activationRequested.set(true);
        this.activationStatus.set('PENDING');
        this.activationMessage.set('Tu solicitud de activación sigue en proceso. Intenta de nuevo más tarde.');
        await this.showToast('La solicitud sigue en proceso.', 'warning');
        return;
      }

      // NOT_REGISTERED
      await this.terminalState.clearPending();
      this.activationRequested.set(false);
      this.activationStatus.set('IDLE');
      this.activationMessage.set('No hay solicitud registrada para este dispositivo. Vuelve a enviar la activación.');
      await this.showToast('No hay solicitud registrada aún.', 'warning');
    } catch (err) {
      console.error('[ACTIVACION] Error revisando estado:', err);
      await this.showToast('Error al consultar el estado. Revisa la conexión.', 'danger');
    } finally {
      try {
        await loading.dismiss();
      } catch {}
    }
  }

  async resetStorage() {
    await this.terminalState.clearPending();
    window.location.reload();
  }

  // === Panel técnico ===
  closeVerifier() {
    this.showVerifier.set(false);
  }

  async copyId() {
    const id = this.deviceId();
    if (!id) {
      alert('Aún no se ha obtenido el Device ID.');
      return;
    }
    try {
      await Clipboard.write({ string: id });
    } catch {}
    alert('ID copiado al portapapeles.');
  }

  retryDevice() {
    void this.initDevice();
  }

  retryGeo() {
    void this.initGeo();
  }

  private async showToast(message: string, color: string = 'dark') {
    const toast = await this.toastCtrl.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
  }
}


