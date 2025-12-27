// src/app/guards/activation.guard.ts
import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { App } from '@capacitor/app';

// ✅ OJO: tu servicio está aquí
import { TerminalStateService } from '../core/services/terminal-state.service';

export const activationGuard: CanMatchFn = async () => {
  const router = inject(Router);

  // ✅ Tipado explícito para evitar "unknown"
  const terminalState = inject<TerminalStateService>(TerminalStateService);

  try {
    const info = await App.getInfo();
    const appVersion = info.version || '1.0.0';

    const r = await terminalState.checkTerminalStatus(appVersion);

    if (r.status === 'ACTIVATED') return true;
    if (r.status === 'PENDING') return router.parseUrl('/waiting-activation');

    return router.parseUrl('/activacion');
  } catch {
    return router.parseUrl('/activacion');
  }
};
