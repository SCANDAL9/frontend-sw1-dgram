import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info', duration = 3500): void {
    const id = `toast-${Date.now()}-${this.counter++}`;
    const toast: Toast = { id, message, type, duration };

    this.toasts.update((current) => [...current, toast]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
  }

  success(message: string, duration = 3500): void {
    this.show(message, 'success', duration);
  }

  info(message: string, duration = 3500): void {
    this.show(message, 'info', duration);
  }

  warning(message: string, duration = 4000): void {
    this.show(message, 'warning', duration);
  }

  error(message: string, duration = 5000): void {
    this.show(message, 'error', duration);
  }

  dismiss(id: string): void {
    this.toasts.update((current) => current.filter((t) => t.id !== id));
  }
}
