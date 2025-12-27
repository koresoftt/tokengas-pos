import { Routes } from '@angular/router';

import { TerminalPage } from './pages/terminal/terminal.page';
import { ActivacionPage } from './pages/activacion/activacion.page';
import { StartupPage } from './pages/startup/startup.page';
import { LoadingPage } from './pages/loading/loading.page';

export const routes: Routes = [
  { path: '', redirectTo: 'loading', pathMatch: 'full' },

  { path: 'loading', component: LoadingPage },
  { path: 'terminal', component: TerminalPage },
  { path: 'activacion', component: ActivacionPage },

  { path: 'startup', component: StartupPage }, // opcional
  { path: '**', redirectTo: 'loading' },
];
