import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/terminal/terminal.page').then(m => m.TerminalPage),
  },
  { path: '**', redirectTo: '' },
];
