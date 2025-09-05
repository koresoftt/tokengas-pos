import { Component } from '@angular/core';
import { IdReaderService } from '../../../services/id-reader.service';
import { SaldoSimService, SaldoSim } from '../../../services/saldo-sim.service';
import { AlertController } from '@ionic/angular';

@Component({
  selector: 'app-lector',
  templateUrl: './lector.page.html',
})
export class LectorPage {
  ultimo?: SaldoSim;

  constructor(
    private idReader: IdReaderService,
    private saldoSim: SaldoSimService,
    private alertCtrl: AlertController,
  ) {}

  // === NFC existente ===
  async leerNfc() {
    const id = await this.idReader.readFromNfc();
    if (!id) return this.msg('No se detectó NFC');
    this.onCodeReceived(id); // <-- MISMO handler
  }

  // === NUEVO: QR ===
  async leerQr() {
    const id = await this.idReader.readFromQr();
    if (!id) return this.msg('No se detectó QR');
    this.onCodeReceived(id); // <-- MISMO handler (simulación de saldo)
  }

  // === Handler unificado NFC/QR ===
  onCodeReceived(id: string) {
    // Aquí no cambiamos nada: el mismo flujo que ya tenías con NFC.
    // 1) normalizas/validas ID (ya viene normalizado desde el servicio)
    // 2) calculas/obtienes el saldo simulado
    this.ultimo = this.saldoSim.calcularDesdeId(id);

    // 3) (si ya hacías más cosas con NFC, déjalas igual: navegar, llamar API, etc.)
    console.log('ID:', id, 'SaldoSim:', this.ultimo);
  }

  private async msg(text: string) {
    const a = await this.alertCtrl.create({ message: text, buttons: ['OK'] });
    await a.present();
  }
}
