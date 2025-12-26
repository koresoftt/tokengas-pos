// src/app/pages/activacion/activacion.page.ts
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

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
} from '@ionic/angular/standalone';

import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { Clipboard } from '@capacitor/clipboard';
import {
  AlertController,
  LoadingController,
  ToastController,
} from '@ionic/angular';

import {
  TerminalStateService,
  ActivationRequestPayload,
} from 'src/app/core/services/terminal-state.service';

type ActivationUiStatus = 'IDLE' | 'PENDING' | 'ALREADY_REGISTERED' | 'ERROR';

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

  // --- Estado de activación en la UI ---
  activationRequested = signal<boolean>(false);
  activationStatus = signal<ActivationUiStatus>('IDLE');
  activationMessage = signal<string | null>(null);

  // --- Triple tap ---
  private tapCount = 0;
  private lastTapTime = 0;
  private readonly TAP_WINDOW_MS = 450;
  private readonly TAPS_REQUIRED = 3;

  constructor(
    private alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private terminalState: TerminalStateService,
    private router: Router
  ) {}

  // (Opcional, por si luego quieres usarlo en otros lados)
  get canActivate(): boolean {
    return (
      !!this.deviceId() &&
      this.lat() !== null &&
      this.lon() !== null &&
      !this.loadingDevice() &&
      !this.loadingGeo()
    );
  }

  // ⚠️ ngOnInit ya no es async para evitar errores con OnInit
  ngOnInit(): void {
    this.initialize();
  }

  private async initialize() {
    await this.initDevice();
    await this.initGeo();
    await this.restoreActivationState();
  }

  // === Device ===
  private async initDevice() {
    try {
      this.loadingDevice.set(true);
      this.errorDevice.set(null);

      const info = await Device.getInfo();
      const uid = await this.terminalState.getDeviceUid(); // 👈 mismo UID que usa el BFF

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
      this.errorGeo.set(
        'No se pudo obtener la ubicación (revisa permisos y GPS).'
      );
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

    if (result.status === 'ACTIVE' && result.config) {
      await this.showToast(
        'Terminal activa. Cargando menú principal…',
        'success'
      );
      this.router.navigateByUrl('/terminal', { replaceUrl: true });
      return;
    }

    const pending = await this.terminalState.isEnrollPending();

    // 👉 OPCIÓN: si el backend dice NOT_REGISTERED, limpiamos pending local
    if (result.status === 'NOT_REGISTERED' && pending) {
      await this.terminalState.clearEnrollPending();
    }

    const finalPending =
      result.status !== 'ACTIVE' ? await this.terminalState.isEnrollPending() : false;

    if (finalPending) {
      this.activationRequested.set(true);
      this.activationStatus.set('PENDING');
      this.activationMessage.set(
        'Tu solicitud de activación está en proceso. ' +
          'Cuando el administrador la apruebe, podrás usar esta terminal.'
      );
    } else {
      this.activationRequested.set(false);
      this.activationStatus.set('IDLE');
      this.activationMessage.set(null);
    }
  } catch (err) {
    console.error('[ACTIVACION] Error restaurando estado:', err);
    this.activationStatus.set('ERROR');
    this.activationMessage.set(
      'No se pudo verificar el estado de la terminal. Revisa tu conexión e intenta de nuevo.'
    );
  }
}


  // === Triple tap logo ===
  onLogoTap() {
    const now = Date.now();
    this.tapCount =
      now - this.lastTapTime <= this.TAP_WINDOW_MS ? this.tapCount + 1 : 1;
    this.lastTapTime = now;

    if (this.tapCount >= this.TAPS_REQUIRED) {
      this.tapCount = 0;
      this.showVerifier.set(!this.showVerifier());
    }
  }

  // === Botón Activar ===
  async onActivateClick() {
    console.log('[ACTIVACION] CLICK botón Activar', {
      deviceId: this.deviceId(),
      lat: this.lat(),
      lon: this.lon(),
      loadingDevice: this.loadingDevice(),
      loadingGeo: this.loadingGeo(),
      activationRequested: this.activationRequested(),
    });

    // Si ya hay solicitud, no dejar spamear
    if (this.activationRequested()) {
      this.showToast(
        'Esta terminal ya tiene una solicitud registrada. Espera la activación.',
        'warning'
      );
      return;
    }

    const ready = await this.ensureData();
    if (!ready) {
      this.showToast(
        'Necesitamos ID y ubicación para activar. Revisa permisos/GPS.'
      );
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Activar terminal',
      message: 'Ingresa el nombre de la estación donde se usará esta terminal.',
      inputs: [
        {
          name: 'stationName',
          type: 'text',
          placeholder: 'Ej. HUMAYA, VALLE ALTO…',
        },
      ],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Continuar', role: 'confirm' },
      ],
    });

    await alert.present();
    const { data, role } = await alert.onDidDismiss();

    if (role !== 'confirm') return;

    const stationName: string = (data?.values?.stationName || '').trim();
    if (!stationName) {
      this.showToast('Debes capturar el nombre de la estación.');
      return;
    }

    await this.sendActivationRequest(stationName);
  }

  // === Enviar solicitud vía BFF, pero sin cambiar de pantalla ===
  private async sendActivationRequest(stationName: string) {
    const deviceUid = this.deviceId();
    const payload: ActivationRequestPayload = {
      device_uid: deviceUid,
      stationName,
      modelo: this.model() || 'UNKNOWN',
      platform: this.platform() || 'unknown',
      osVersion: this.osVersion() || '1.0.0',
      geo_lat: this.lat() ?? 0,
      geo_lon: this.lon() ?? 0,
    };

    // Debug: ver JSON que se envía
    this.jsonStr.set(JSON.stringify(payload, null, 2));
    this.showJson.set(true);

    this.sending.set(true);
    const loading = await this.loadingCtrl.create({
      message: 'Enviando solicitud…',
    });
    await loading.present();

    try {
      const resp = await this.terminalState.createActivationRequest(payload);

      if (resp.ok) {
        // ✅ Nueva solicitud creada
        this.activationRequested.set(true);
        this.activationStatus.set('PENDING');
        this.activationMessage.set(
          'Solicitud enviada. En cuanto el administrador la apruebe, esta terminal quedará lista.'
        );

        await this.showToast('Solicitud enviada correctamente.', 'success');
      } else {
        // Respuesta ok=false desde el BFF
        this.activationStatus.set('ERROR');
        this.activationMessage.set(
          resp.message ||
            'No se pudo crear la solicitud. Revisa la conexión e intenta de nuevo.'
        );
        await this.showToast(this.activationMessage()!, 'danger');
      }
    } catch (err: any) {
      console.error('Error creando solicitud de activación:', err);

      let msg = 'Error al enviar la solicitud.';
      if (err.status !== undefined) {
        msg += ` (HTTP ${err.status})`;
      }
      if (err.error?.message) {
        msg += `: ${err.error.message}`;
      }

      this.activationStatus.set('ERROR');
      this.activationMessage.set(msg);
      await this.showToast(msg, 'danger');
    } finally {
      this.sending.set(false);
      try {
        await loading.dismiss();
      } catch {
        /* noop */
      }
    }
  }

  // === Botón "Revisar estado" (en esta misma pantalla) ===
  async onCheckStatusClick() {
    const loading = await this.loadingCtrl.create({
      message: 'Revisando estado de activación…',
    });
    await loading.present();

    try {
      const result = await this.terminalState.checkTerminalStatus();
      const pending = await this.terminalState.isEnrollPending();

      console.log('[ACTIVACION] check status', { result, pending });

      if (result.status === 'ACTIVE') {
        // ✅ Ya está activa: limpiamos pending y vamos al menú
        await this.terminalState.clearEnrollPending();

        await this.showToast(
          'Terminal activada. Cargando menú principal…',
          'success'
        );
        await this.router.navigateByUrl('/terminal', { replaceUrl: true });
        return;
      }

      if (result.status === 'NOT_REGISTERED') {
        if (pending) {
          // 🔄 Tenemos solicitud pendiente localmente,
          // pero el backend todavía no refleja la terminal como "ACTIVE".
          this.activationRequested.set(true);
          this.activationStatus.set('PENDING');
          this.activationMessage.set(
            'Tu solicitud de activación sigue en proceso. ' +
              'Aún no aparece como activada en el sistema.'
          );

          await this.showToast(
            'La solicitud sigue en proceso. Intenta de nuevo más tarde.',
            'warning'
          );
        } else {
          // ❌ No hay pending en storage y el backend tampoco ve terminal
          this.activationRequested.set(false);
          this.activationStatus.set('IDLE');
          this.activationMessage.set(
            'No hay solicitud registrada para este dispositivo. Vuelve a enviar la activación.'
          );
          await this.showToast('No hay solicitud registrada aún.', 'warning');
        }
        return;
      }

      // Otros estados que puedas agregar en el futuro (BLOCKED, etc.)
      await this.showToast(
        'La terminal todavía no aparece como activada. Intenta de nuevo en unos minutos.',
        'warning'
      );
    } catch (err) {
      console.error('[ACTIVACION] Error revisando estado:', err);
      await this.showToast(
        'Error al consultar el estado. Revisa la conexión.',
        'danger'
      );
    } finally {
      await loading.dismiss();
    }
  }

  async resetStorage() {
    await this.terminalState.clearTerminalData();
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
    this.initDevice();
  }

  retryGeo() {
    this.initGeo();
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
