import { Injectable } from '@angular/core';

export interface SaldoSim {
  id: string;
  saldo: number;
  moneda: 'MXN';
  actualizadoA: string;
}

@Injectable({ providedIn: 'root' })
export class SaldoSimService {
  // Simulación determinística a partir del ID (igual que la que ya usas con NFC)
  calcularDesdeId(id: string): SaldoSim {
    // ejemplo: hash simple para reproducibilidad
    let acc = 0; for (const c of id) acc = (acc * 31 + c.charCodeAt(0)) >>> 0;
    const saldo = Number((acc % 50000) / 100).toFixed(2); // $0.00 a $500.00
    return {
      id,
      saldo: Number(saldo),
      moneda: 'MXN',
      actualizadoA: new Date().toISOString(),
    };
  }
}
