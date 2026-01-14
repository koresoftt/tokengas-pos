// src/main.ts
import { enableProdMode, importProvidersFrom } from '@angular/core';
import { registerAppIcons } from './app/core/ui/icons';
registerAppIcons();

import { bootstrapApplication } from '@angular/platform-browser';
import {
  provideRouter,
  PreloadAllModules,
  withPreloading,
  RouteReuseStrategy,
} from '@angular/router';
import {
  provideIonicAngular,
  IonicRouteStrategy,
} from '@ionic/angular/standalone';

import { provideHttpClient } from '@angular/common/http';
import { IonicStorageModule } from '@ionic/storage-angular';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

console.log('[BUILD]', '2026-01-13-A');

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },

    // ✅ HttpClient para servicios (TerminalStateService, etc.)
    provideHttpClient(),
    

    // ✅ Storage standalone
    importProvidersFrom(IonicStorageModule.forRoot()),
  ],
  
}).catch(console.error);
