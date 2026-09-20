import { Component, output, input, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type AuthTab = 'login' | 'register' | 'forgot_password' | 'reset_password';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-modal.component.html',
})
export class AuthModalComponent implements OnInit {
  loading = input<boolean>(false);
  errorMsg = input<string | null>(null);
  successMsg = input<string | null>(null);
  initialResetToken = input<string | null>(null);

  loginSubmitted = output<{ email: string; password: string }>();
  registerSubmitted = output<{ email: string; fullName: string; password: string }>();
  forgotPasswordSubmitted = output<string>();
  resetPasswordSubmitted = output<{ token: string; newPassword: string }>();
  closed = output<void>();

  activeTab = signal<AuthTab>('login');
  localError = signal<string | null>(null);
  displayError = computed(() => this.localError() || this.errorMsg());

  loginEmail = '';
  loginPassword = '';

  regFullName = '';
  regEmail = '';
  regPassword = '';
  regConfirmPassword = '';

  forgotEmail = '';

  resetTokenInput = '';
  resetNewPassword = '';
  resetConfirmPassword = '';

  ngOnInit(): void {
    const token = this.initialResetToken();
    if (token) {
      this.resetTokenInput = token;
      this.activeTab.set('reset_password');
    }
  }

  setTab(tab: AuthTab): void {
    this.activeTab.set(tab);
    this.localError.set(null);
  }

  close(): void {
    this.closed.emit();
  }

  isPasswordValid(pw: string): boolean {
    return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
  }

  handleLogin(): void {
    if (!this.loginEmail || !this.loginPassword) {
      this.localError.set('Por favor completa todos los campos');
      return;
    }
    this.localError.set(null);
    this.loginSubmitted.emit({
      email: this.loginEmail,
      password: this.loginPassword,
    });
  }

  handleRegister(): void {
    if (!this.regEmail || !this.regFullName || !this.regPassword || !this.regConfirmPassword) {
      this.localError.set('Por favor completa todos los campos');
      return;
    }

    if (!this.isPasswordValid(this.regPassword)) {
      this.localError.set('La contraseña debe tener al menos 8 caracteres, incluyendo letras y números');
      return;
    }

    if (this.regPassword !== this.regConfirmPassword) {
      this.localError.set('Las contraseñas no coinciden');
      return;
    }

    this.localError.set(null);
    this.registerSubmitted.emit({
      email: this.regEmail,
      fullName: this.regFullName,
      password: this.regPassword,
    });
  }

  handleForgotPassword(): void {
    if (!this.forgotEmail) {
      this.localError.set('Ingresa tu correo electrónico');
      return;
    }

    this.localError.set(null);
    this.forgotPasswordSubmitted.emit(this.forgotEmail);
  }

  handleResetPassword(): void {
    if (!this.resetTokenInput || !this.resetNewPassword || !this.resetConfirmPassword) {
      this.localError.set('Por favor completa todos los campos');
      return;
    }

    if (!this.isPasswordValid(this.resetNewPassword)) {
      this.localError.set('La nueva contraseña debe tener al menos 8 caracteres, incluyendo letras y números');
      return;
    }

    if (this.resetNewPassword !== this.resetConfirmPassword) {
      this.localError.set('Las contraseñas no coinciden');
      return;
    }

    this.localError.set(null);
    this.resetPasswordSubmitted.emit({
      token: this.resetTokenInput,
      newPassword: this.resetNewPassword,
    });
  }
}
