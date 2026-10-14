import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserProfileUpdate } from '../models/auth.models';

@Injectable({
  providedIn: 'root',
})
export class AuthDialogService {
  private auth = inject(AuthService);
  private toast = inject(ToastService);

  readonly authLoading = signal(false);
  readonly authError = signal<string | null>(null);
  readonly authSuccess = signal<string | null>(null);

  readonly profileLoading = signal(false);
  readonly profileError = signal<string | null>(null);
  readonly profileSuccess = signal<string | null>(null);

  openAuth(): void {
    this.authError.set(null);
    this.authSuccess.set(null);
    this.auth.showAuthModal.set(true);
  }

  closeAuth(): void {
    this.auth.showAuthModal.set(false);
  }

  openProfile(): void {
    this.profileError.set(null);
    this.profileSuccess.set(null);
    this.auth.showProfileModal.set(true);
  }

  closeProfile(): void {
    this.auth.showProfileModal.set(false);
  }

  handleLogin(creds: { email: string; password: string }, onSuccess?: () => void): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.auth.login(creds.email, creds.password).subscribe({
      next: () => {
        this.authLoading.set(false);
        this.closeAuth();
        this.toast.success('Sesión iniciada correctamente');
        onSuccess?.();
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al iniciar sesión');
      },
    });
  }

  handleRegister(payload: { email: string; fullName: string; password: string }, onSuccess?: () => void): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.auth.register(payload.email, payload.fullName, payload.password).subscribe({
      next: () => {
        this.authLoading.set(false);
        this.closeAuth();
        this.toast.success('Cuenta creada exitosamente');
        onSuccess?.();
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al registrarse');
      },
    });
  }

  handleForgotPassword(email: string): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.authSuccess.set(null);
    this.auth.forgotPassword(email).subscribe({
      next: (res) => {
        this.authLoading.set(false);
        this.authSuccess.set(res.message);
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al solicitar recuperación');
      },
    });
  }

  handleResetPassword(payload: { token: string; newPassword: string }): void {
    this.authLoading.set(true);
    this.authError.set(null);
    this.authSuccess.set(null);
    this.auth.resetPassword(payload.token, payload.newPassword).subscribe({
      next: (res) => {
        this.authLoading.set(false);
        this.authSuccess.set(res.message);
        this.toast.success('Contraseña restablecida correctamente');
      },
      error: (err) => {
        this.authLoading.set(false);
        this.authError.set(err.error?.detail || 'Error al restablecer contraseña');
      },
    });
  }

  handleUpdateProfile(payload: { fullName: string; avatarUrl?: string }): void {
    this.profileLoading.set(true);
    this.profileError.set(null);
    this.profileSuccess.set(null);
    const updateDto: UserProfileUpdate = {
      full_name: payload.fullName,
      avatar_url: payload.avatarUrl,
    };
    this.auth.updateProfile(updateDto).subscribe({
      next: () => {
        this.profileLoading.set(false);
        this.profileSuccess.set('Perfil actualizado');
        this.toast.success('Perfil actualizado correctamente');
      },
      error: (err) => {
        this.profileLoading.set(false);
        this.profileError.set(err.error?.detail || 'Error al actualizar perfil');
      },
    });
  }

  handleChangePassword(payload: { currentPassword: string; newPassword: string }): void {
    this.profileLoading.set(true);
    this.profileError.set(null);
    this.profileSuccess.set(null);
    this.auth.changePassword(payload.currentPassword, payload.newPassword).subscribe({
      next: () => {
        this.profileLoading.set(false);
        this.profileSuccess.set('Contraseña actualizada');
        this.toast.success('Contraseña cambiada correctamente');
      },
      error: (err) => {
        this.profileLoading.set(false);
        this.profileError.set(err.error?.detail || 'Error al cambiar contraseña');
      },
    });
  }
}
