import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonButton, IonList, IonItem,
  IonLabel, IonInput, IonText, IonToggle
} from '@ionic/angular/standalone';

import { FuelConfigService, Fuel } from 'src/app/core/services/fuel-config.service';
import { UiThemeService, TgTheme } from 'src/app/core/services/ui-theme.service';

type DismissReason = 'saved' | 'closed';

@Component({
  selector: 'app-settings-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonButton,
    IonList, IonItem, IonLabel, IonInput,
    IonText, IonToggle
  ],
  templateUrl: './settings.modal.html',
  styleUrls: ['./settings.modal.scss']
})
export class SettingsModalComponent implements OnInit {
  @Output() dismissed = new EventEmitter<DismissReason>();

  fuels: Fuel[] = [];
  saving = false;
  msg = '';

  theme: TgTheme = 'dark';

  constructor(
    private fuelCfg: FuelConfigService,
    private uiTheme: UiThemeService
  ) {}

  async ngOnInit() {
    this.theme = this.uiTheme.get();
    await this.load();
  }

  async load() {
    this.msg = '';
    this.fuels = await this.fuelCfg.getFuels();
  }

  close() {
    this.dismissed.emit('closed');
  }

  async toggleExteriorMode(ev: any) {
    const checked = !!ev?.detail?.checked;
    this.theme = checked ? 'light' : 'dark';
    await this.uiTheme.set(this.theme);
  }

  private normPrice(v: any): number {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    return Math.round(n * 1000) / 1000;
  }

  async save() {
    this.msg = '';
    this.saving = true;

    try {
      for (const f of this.fuels) {
        const p = this.normPrice((f as any).price);
        if (p <= 0) {
          this.msg = `Precio inválido en ${f.label}`;
          this.saving = false;
          return;
        }
        (f as any).price = p;
      }

      await this.fuelCfg.setFuels(this.fuels);
      this.dismissed.emit('saved');
    } catch (e: any) {
      this.msg = e?.message || 'No se pudo guardar';
      this.saving = false;
    }
  }

  async resetDefaults() {
    this.saving = true;
    try {
      await this.fuelCfg.resetDefaults();
      this.fuels = await this.fuelCfg.getFuels();
      this.msg = 'Restablecido a valores por defecto';
    } finally {
      this.saving = false;
    }
  }
}