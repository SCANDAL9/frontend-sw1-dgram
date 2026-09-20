import { Component, output, input, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User } from '../../models/auth.models';

@Component({
  selector: 'app-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-modal.component.html',
})
export class ProfileModalComponent {
  currentUser = input<User | null>(null);
  loading = input<boolean>(false);
  errorMsg = input<string | null>(null);
  successMsg = input<string | null>(null);

  updateProfileSubmitted = output<{ fullName: string; avatarUrl?: string }>();
  changePasswordSubmitted = output<{ currentPassword: string; newPassword: string }>();
  logout = output<void>();
  closed = output<void>();

  activeSection = signal<'profile' | 'password'>('profile');
  localError = signal<string | null>(null);
  displayError = computed(() => this.localError() || this.errorMsg());

  fullName = '';
  avatarUrl = '';

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';

  readonly avatarPresets = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=Arch',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Neo',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Oracle',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Trinity',
    'https://api.dicebear.com/7.x/bottts/svg?seed=Morpheus',
  ];

  constructor() {
    effect(() => {
      const user = this.currentUser();
      if (user) {
        this.fullName = user.full_name;
        this.avatarUrl = user.avatar_url || '';
      }
    });
  }

  setSection(sec: 'profile' | 'password'): void {
    this.activeSection.set(sec);
    this.localError.set(null);
  }

  selectPreset(url: string): void {
    this.avatarUrl = url;
  }

  close(): void {
    this.closed.emit();
  }

  isPasswordValid(pw: string): boolean {
    return pw.length >= 8 && /[a-zA-Z]/.test(pw) && /\d/.test(pw);
  }

  handleUpdateProfile(): void {
    if (!this.fullName.trim()) {
      this.localError.set('El nombre completo es requerido');
      return;
    }

    this.localError.set(null);
    this.updateProfileSubmitted.emit({
      fullName: this.fullName.trim(),
      avatarUrl: this.avatarUrl.trim() || undefined,
    });
  }

  handleChangePassword(): void {
    if (!this.currentPassword || !this.newPassword || !this.confirmNewPassword) {
      this.localError.set('Completa todos los campos para cambiar la contraseña');
      return;
    }

    if (!this.isPasswordValid(this.newPassword)) {
      this.localError.set('La nueva contraseña debe tener al menos 8 caracteres, letras y números');
      return;
    }

    if (this.newPassword !== this.confirmNewPassword) {
      this.localError.set('Las nuevas contraseñas no coinciden');
      return;
    }

    this.localError.set(null);
    this.changePasswordSubmitted.emit({
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
    });
  }

  handleLogout(): void {
    this.logout.emit();
    this.close();
  }
}
