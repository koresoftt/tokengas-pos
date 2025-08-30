import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  { path: '', redirectTo: 'terminal', pathMatch: 'full' },
  {
    path: 'terminal',
    loadComponent: () =>
      import('./pages/terminal/terminal.page').then(m => m.TerminalPage),
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
