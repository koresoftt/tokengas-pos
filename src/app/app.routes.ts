import { Routes } from '@angular/router';

import { TerminalPage } from './pages/terminal/terminal.page';
import { ActivacionPage } from './pages/activacion/activacion.page';
import { StartupPage } from './pages/startup/startup.page';
import { LoadingPage } from './pages/loading/loading.page';

export const routes: Routes = [

  // 👉 Arranque REAL de la app
  { path: '', redirectTo: 'loading', pathMatch: 'full' },

  // 👉 Pantalla que decide hacia dónde ir
  { path: 'loading', component: LoadingPage },

  // 👉 Si ya está activa → se mostrará inmediatamente esta
  { path: 'terminal', component: TerminalPage },

  // 👉 Si NO está activa → sale esta
  { path: 'activacion', component: ActivacionPage },


  // (StartupPage ya no se usa como entrada, solo la dejamos por si la ocupas después)
  { path: 'startup', component: StartupPage },

  { path: '**', redirectTo: 'loading' },
];
