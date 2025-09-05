import { Component } from '@angular/core';
import { CamaraTestService } from '../../services/camara-test.service';

@Component({
  selector: 'app-qr-test',
  templateUrl: './qr-test.page.html',
  styleUrls: ['./qr-test.page.scss'],
})
export class QrTestPage {
  constructor(private svc: CamaraTestService) {}
  abrirCamaraSistema() { this.svc.abrirCamaraSistema(); }
  abrirEscanerSoloUi() { this.svc.abrirEscanerSoloUi(); }
}
