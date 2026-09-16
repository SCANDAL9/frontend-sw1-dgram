import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  avatar_url?: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private http = inject(HttpClient);
  private tokenKey = 'dgram_auth_token';
  private userKey = 'dgram_auth_user';

  private _token = signal<string | null>(this.getStoredToken());
  private _currentUser = signal<User | null>(this.getStoredUser());

  showAuthModal = signal(false);

  readonly token = this._token.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token() && !!this._currentUser());

  constructor() {
    // Si tenemos token guardado, intentar refrescar el perfil
    if (this._token()) {
      this.getMe().subscribe({
        error: () => this.logout(),
      });
    }
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(this.tokenKey);
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
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email, password }).pipe(
      tap((res) => {
        this.setSession(res.access_token, res.user);
      })
    );
  }

  register(email: string, full_name: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, { email, full_name, password }).pipe(
      tap((res) => {
        this.setSession(res.access_token, res.user);
      })
    );
  }

  getMe(): Observable<User> {
    return this.http.get<User>(`${environment.apiUrl}/auth/me`).pipe(
      tap((user) => {
        this._currentUser.set(user);
        try {
          localStorage.setItem(this.userKey, JSON.stringify(user));
        } catch {}
      })
    );
  }

  logout(): void {
    this._token.set(null);
    this._currentUser.set(null);
    try {
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.userKey);
    } catch {}
  }

  private setSession(token: string, user: User): void {
    this._token.set(token);
    this._currentUser.set(user);
    try {
      localStorage.setItem(this.tokenKey, token);
      localStorage.setItem(this.userKey, JSON.stringify(user));
    } catch {}
  }
}
