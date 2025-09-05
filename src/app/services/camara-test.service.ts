import { Injectable } from '@angular/core';
import { Camera, CameraResultType } from '@capacitor/camera';
import { registerPlugin } from '@capacitor/core';

// Declaración robusta del plugin (evita errores de tipos)
type ScanResult = { barcodes?: any[] } | any;
type ScanFn = (opts?: any) => Promise<ScanResult>;

const Barcode = registerPlugin<any>('BarcodeScanner');

@Injectable({ providedIn: 'root' })
export class CamaraTestService {

  // Prueba 1: abre la cámara nativa (foto) sólo para validar permisos/hardware
  async abrirCamaraSistema(): Promise<void> {
    const perm = await Camera.checkPermissions();
    if (perm.camera !== 'granted') {
      const req = await Camera.requestPermissions({ permissions: ['camera'] });
      if (req.camera !== 'granted') { alert('Permiso de cámara denegado.'); return; }
    }

    await Camera.getPhoto({
      quality: 50,
      resultType: CameraResultType.Uri,
      saveToGallery: false,
    });

    alert('Cámara del sistema abierta correctamente.');
  }

  // Prueba 2: abre la UI del escáner oficial solo para confirmar que la cámara abre
  async abrirEscanerSoloUi(): Promise<void> {
    // opciones mínimas; ajustaremos después
    const opts = {
      hint: 'ALL',
      scanInstructions: 'Alinea el código en el recuadro',
      android: { scanningLibrary: 'zxing' },
    };

    // Compatibilidad: usa el nombre que exista en tu build
    const scanFn: ScanFn =
      (Barcode as any).scan ??
      (Barcode as any).scanBarcode;

    if (!scanFn) {
      alert('No encontré scan()/scanBarcode() en el plugin. (Versión o typings).');
      return;
    }

    try {
      await scanFn(opts); // solo abrir; ignoramos resultado
      alert('Escáner abierto (resultado ignorado).');
    } catch (e: any) {
      console.error(e);
      alert('No se pudo abrir el escáner: ' + (e?.message || e));
    }
  }
}
