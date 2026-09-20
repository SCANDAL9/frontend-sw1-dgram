import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, tap, catchError, throwError, of, shareReplay, finalize, map } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  User,
  AuthResponse,
  UserProfileUpdate,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  MessageResponse,
} from '../models/auth.models';
import { AuthAdapter, AuthResponseDto, UserDto } from '../adapters/auth.adapter';

export { User, AuthResponse };

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private tokenKey = 'dgram_auth_token';
  private refreshTokenKey = 'dgram_refresh_token';
  private userKey = 'dgram_auth_user';

  private _token = signal<string | null>(this.getStoredToken());
  private _refreshToken = signal<string | null>(this.getStoredRefreshToken());
  private _currentUser = signal<User | null>(this.getStoredUser());

  showAuthModal = signal(false);
  showProfileModal = signal(false);
  resetToken = signal<string | null>(null);

  readonly token = this._token.asReadonly();
  readonly refreshTokenValue = this._refreshToken.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token() && !!this._currentUser());

  constructor() {
    // Si tenemos token guardado, revalidar perfil en segundo plano tras completar la inyección de dependencias
    if (this._token()) {
      queueMicrotask(() => {
        this.getMe().subscribe({
          next: () => {},
          error: (err) => {
            // Solo intentar refrescar si fue error de autorización (401)
            if (err?.status === 401 && this._refreshToken()) {
              this.refreshToken().subscribe({
                error: (refErr) => {
                  if (refErr?.status === 401 || refErr?.status === 403) {
                    this.clearSession();
                  }
                },
              });
            }
          },
        });
      });
    }

    // Verificar si la URL trae un token de reseteo (?token=...)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      if (urlToken) {
        this.resetToken.set(urlToken);
        this.showAuthModal.set(true);
      }
    }
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(this.tokenKey);
    } catch {
      return null;
    }
  }

  private getStoredRefreshToken(): string | null {
    try {
      return localStorage.getItem(this.refreshTokenKey);
    } catch {
      return null;
    }
  }

  private getStoredUser(): User | null {
    try {
      const stored = localStorage.getItem(this.userKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponseDto>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      map((dto) => AuthAdapter.toAuthResponseModel(dto)),
      tap((res) => {
        this.setSession(res.access_token, res.refresh_token, res.user);
      })
    );
  }

  register(email: string, full_name: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponseDto>(`${environment.apiUrl}/auth/register`, { email, full_name, password }).pipe(
      map((dto) => AuthAdapter.toAuthResponseModel(dto)),
      tap((res) => {
        this.setSession(res.access_token, res.refresh_token, res.user);
      })
    );
  }

  private refreshInProgress$: Observable<AuthResponse> | null = null;

  refreshToken(): Observable<AuthResponse> {
    if (this.refreshInProgress$) {
      return this.refreshInProgress$;
    }

    const currentRefresh = this._refreshToken();
    if (!currentRefresh) {
      this.clearSession();
      return throwError(() => new Error('No refresh token available'));
    }

    this.refreshInProgress$ = this.http
      .post<AuthResponseDto>(`${environment.apiUrl}/auth/refresh`, { refresh_token: currentRefresh })
      .pipe(
        map((dto) => AuthAdapter.toAuthResponseModel(dto)),
        tap((res) => {
          this.setSession(res.access_token, res.refresh_token, res.user);
        }),
        catchError((err) => {
          if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
            this.clearSession();
          }
          return throwError(() => err);
        }),
        finalize(() => {
          this.refreshInProgress$ = null;
        }),
        shareReplay(1)
      );

    return this.refreshInProgress$;
  }

  getMe(): Observable<User> {
    return this.http.get<UserDto>(`${environment.apiUrl}/auth/me`).pipe(
      map((dto) => AuthAdapter.toUserModel(dto)),
      tap((user) => {
        this._currentUser.set(user);
        try {
          localStorage.setItem(this.userKey, JSON.stringify(user));
        } catch {}
      })
    );
  }

  updateProfile(data: UserProfileUpdate): Observable<User> {
    const payload = AuthAdapter.toProfileUpdatePayload(data);
    return this.http.put<UserDto>(`${environment.apiUrl}/auth/me`, payload).pipe(
      map((dto) => AuthAdapter.toUserModel(dto)),
      tap((updated) => {
        this._currentUser.set(updated);
        try {
          localStorage.setItem(this.userKey, JSON.stringify(updated));
        } catch {}
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<MessageResponse> {
    const payload = AuthAdapter.toChangePasswordPayload({
      current_password: currentPassword,
      new_password: newPassword,
    });
    return this.http.post<MessageResponse>(`${environment.apiUrl}/auth/change-password`, payload);
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${environment.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<MessageResponse> {
    const payload = AuthAdapter.toResetPasswordPayload({
      token,
      new_password: newPassword,
    });
    return this.http.post<MessageResponse>(`${environment.apiUrl}/auth/reset-password`, payload);
  }

  logout(): void {
    const currentRefresh = this._refreshToken();
    // Notificar al servidor para revocar el refresh token en el almacén de sesiones
    if (currentRefresh) {
      this.http
        .post<MessageResponse>(`${environment.apiUrl}/auth/logout`, { refresh_token: currentRefresh })
        .pipe(catchError(() => of(null)))
        .subscribe();
    }
    this.clearSession();
  }

  private clearSession(): void {
    this._token.set(null);
    this._refreshToken.set(null);
    this._currentUser.set(null);
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.refreshTokenKey);
      localStorage.removeItem(this.userKey);
    } catch {}
  }

  private setSession(token: string, refreshToken: string, user: User): void {
    this._token.set(token);
    this._refreshToken.set(refreshToken);
    this._currentUser.set(user);
    try {
      localStorage.setItem(this.tokenKey, token);
      localStorage.setItem(this.refreshTokenKey, refreshToken);
      localStorage.setItem(this.userKey, JSON.stringify(user));
    } catch {}
  }
}
