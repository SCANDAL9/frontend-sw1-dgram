import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError, switchMap } from 'rxjs';
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
        const url = req.url;
        const isAuthEndpoint =
          url.includes('/auth/login') ||
          url.includes('/auth/register') ||
          url.includes('/auth/refresh');

        // Si tenemos refresh token y el error no fue en un endpoint de autenticación directa, intentar renovar
        if (!isAuthEndpoint && authService.refreshTokenValue()) {
          return authService.refreshToken().pipe(
            switchMap((newSession) => {
              const retryRequest = req.clone({
                setHeaders: {
                  Authorization: `Bearer ${newSession.access_token}`,
                },
              });
              return next(retryRequest);
            }),
            catchError((refreshErr) => {
              authService.logout();
              authService.showAuthModal.set(true);
              return throwError(() => refreshErr);
            })
          );
        }

        // Si no se puede renovar o falló el login
        if (!isAuthEndpoint) {
          if (authService.token()) {
            authService.logout();
          }
          authService.showAuthModal.set(true);
        }
      }
      return throwError(() => err);
    })
  );
};
