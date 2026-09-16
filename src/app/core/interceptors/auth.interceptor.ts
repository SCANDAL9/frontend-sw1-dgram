import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../../workspace/authentication/services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.token();

  let request = req;
  if (token && !req.headers.has('Authorization')) {
    request = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(request).pipe(
    catchError((err: any) => {
      if (err instanceof HttpErrorResponse && err.status === 401) {
        // Token expirado o inválido: cerrar sesión y abrir modal
        authService.logout();
        authService.showAuthModal.set(true);
      }
      return throwError(() => err);
    })
  );
};
