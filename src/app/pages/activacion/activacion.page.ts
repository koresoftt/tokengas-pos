import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

import {
  IonContent, IonButton,
  IonCard, IonCardHeader, IonCardTitle, IonCardContent,
  IonList, IonItem, IonLabel, IonText, IonSpinner
} from '@ionic/angular/standalone';

import { Device } from '@capacitor/device';
import { Geolocation } from '@capacitor/geolocation';
import { Clipboard } from '@capacitor/clipboard';

@Component({
  selector: 'app-activacion',
  standalone: true,
  imports: [
    CommonModule,
    IonContent, IonButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonText, IonSpinner
  ],
  templateUrl: './activacion.page.html',
  styleUrls: ['./activacion.page.scss']
})
export class ActivacionPage implements OnInit {

  // --- Estado de carga/errores ---
  loadingDevice = signal<boolean>(true);
  loadingGeo    = signal<boolean>(true);
  errorDevice   = signal<string | null>(null);
  errorGeo      = signal<string | null>(null);

  // --- Datos del dispositivo ---
  deviceId  = signal<string>('');
  model     = signal<string>('');
  platform  = signal<string>('');
  osVersion = signal<string>('');

  // --- Geolocalización ---
  lat      = signal<number | null>(null);
  lon      = signal<number | null>(null);
  accuracy = signal<number | null>(null);

  // --- Panel técnico (triple-tap) ---
  showVerifier = signal<boolean>(false);

  // --- Vista del JSON simulado ---
  showJson = signal<boolean>(false);
  jsonStr  = signal<string>('');

  // --- Detección de triple-tap ---
  private tapCount = 0;
  private lastTapTime = 0;
  private readonly TAP_WINDOW_MS = 450;
  private readonly TAPS_REQUIRED = 3;

  get canActivate(): boolean {
    return !!this.deviceId() &&
           this.lat() !== null &&
           this.lon() !== null &&
           !this.loadingDevice() &&
           !this.loadingGeo();
  }

  async ngOnInit() {
    this.initDevice();
    this.initGeo();
  }

  // === Obtener ID / modelo ===
  private async initDevice() {
    try {
      this.loadingDevice.set(true);
      this.errorDevice.set(null);

      const id   = await Device.getId();      // { identifier }
      const info = await Device.getInfo();    // { model, platform, osVersion, ... }

      this.deviceId.set(id.identifier || '');
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

  // === Obtener geolocalización ===
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


  // === Triple-tap en el logo para alternar verificación manual ===
  onLogoTap() {
    const now = Date.now();
    this.tapCount = (now - this.lastTapTime <= this.TAP_WINDOW_MS) ? this.tapCount + 1 : 1;
    this.lastTapTime = now;

    if (this.tapCount >= this.TAPS_REQUIRED) {
      this.tapCount = 0;
      this.showVerifier.set(!this.showVerifier());
    }
  }

  // === Simular envío y mostrar SOLO el JSON pedido ===
async onActivar() {
  const ready = await this.ensureData();
  if (!ready) {
    alert('Necesitamos ID y ubicación para activar. Revisa permisos/GPS.');
    return;
  }

  const payload = {
    id: this.deviceId(),
    modelo: this.model(),
    geolocalizacion: { lat: this.lat(), lon: this.lon() }
  };

  this.jsonStr.set(JSON.stringify(payload, null, 2));
  this.showJson.set(true);
}
closeVerifier() {
  this.showVerifier.set(false);
}


  // Utilidades
  async copyId() {
    const id = this.deviceId();
    if (!id) return alert('Aún no se ha obtenido el Device ID.');
    try { await Clipboard.write({ string: id }); } catch {}
    alert('ID copiado al portapapeles.');
  }

  retryDevice() { this.initDevice(); }
  retryGeo()    { this.initGeo();    }
}
