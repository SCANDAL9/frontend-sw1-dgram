import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';


@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-modal.component.html',
})
export class AuthModalComponent {
  private authService = inject(AuthService);

  @Output() closed = new EventEmitter<void>();

  activeTab = signal<'login' | 'register'>('login');
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  loginEmail = '';
  loginPassword = '';

  regFullName = '';
  regEmail = '';
  regPassword = '';

  setTab(tab: 'login' | 'register') {
    this.activeTab.set(tab);
    this.errorMsg.set(null);
  }

  close() {
    this.closed.emit();
  }

  handleLogin() {
    if (!this.loginEmail || !this.loginPassword) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    this.authService.login(this.loginEmail, this.loginPassword).subscribe({
      next: () => {
        this.loading.set(false);
        this.close();
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.detail || 'Error al iniciar sesión');
      },
    });
  }

  handleRegister() {
    if (!this.regEmail || !this.regFullName || !this.regPassword) return;
    this.loading.set(true);
    this.errorMsg.set(null);

    this.authService.register(this.regEmail, this.regFullName, this.regPassword).subscribe({
      next: () => {
        this.loading.set(false);
        this.close();
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMsg.set(err.error?.detail || 'Error al registrarse');
      },
    });
  }
}
