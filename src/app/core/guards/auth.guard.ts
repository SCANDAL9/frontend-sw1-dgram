import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../workspace/authentication/services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Si no está autenticado, abrir modal de login y permitir acceso o redirigir
  authService.showAuthModal.set(true);
  // Permitir la navegación si es un tablero compartido o modo offline,
  // pero garantizando que el modal de login se abra para identificarse.
  return true;
};
