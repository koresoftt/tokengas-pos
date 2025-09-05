import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { Camera } from '@capacitor/camera';

type ScanFn = (opts?: any) => Promise<any>;
const Barcode = registerPlugin<any>('CapacitorBarcodeScanner'); // 👈 nombre correcto

@Injectable({ providedIn: 'root' })
export class IdReaderService {
  async readFromQr(): Promise<string | null> {
    const scanFn: ScanFn = (Barcode as any).scanBarcode ?? (Barcode as any).scan;
    if (!scanFn) throw new Error('qr_native_unavailable');

    // Permisos de cámara (algunos Android no muestran el diálogo si no lo pides antes)
    try {
      const perm = await Camera.checkPermissions();
      if (perm.camera !== 'granted') {
        await Camera.requestPermissions({ permissions: ['camera'] });
      }
    } catch {}

    const opts = {
      hint: 'QR_CODE',
      scanInstructions: 'Alinea el código dentro del recuadro',
      android: { scanningLibrary: 'mlkit' }, // si prefieres: 'zxing'
    };

    try {
      const result = await scanFn(opts);
      const text =
        result?.ScanResult ??
        result?.barcodes?.[0]?.rawValue ??
        result?.barcodes?.[0]?.displayValue ??
        result?.content?.rawValue ??
        result?.content?.text ??
        result?.text ??
        (Array.isArray(result?.barcodes) ? String(result?.barcodes?.[0]) : null);

      return (typeof text === 'string' && text.trim()) ? text.trim() : null;
    } catch (e: any) {
      const msg = (e?.message || '').toLowerCase();
      if (msg.includes('cancel')) return null;
      throw new Error('qr_native_unavailable');
    }
  }
}
