import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { ActivationService } from '../services/activation.service';

export const activationGuard: CanMatchFn = async () => {
  const activation = inject(ActivationService);
  const router = inject(Router);
  const ok = await activation.isActivated();
  // Si no está activado, manda a /activacion
  return ok || router.parseUrl('/activacion');
};
