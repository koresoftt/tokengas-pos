// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { activationGuard } from './guards/activation.guard';

export const routes: Routes = [
  // Arrancamos en Activación mientras probamos el activador
  {
    path: '',
    loadComponent: () =>
      import('./pages/activacion/activacion.page').then(m => m.ActivacionPage),
  },
  // Terminal (protegido) para después
  {
    path: 'terminal',
    canMatch: [activationGuard],
    loadComponent: () =>
      import('./pages/terminal/terminal.page').then(m => m.TerminalPage),
  },
  { path: '**', redirectTo: '' },
];
