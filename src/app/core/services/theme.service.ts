import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'dgram_theme_preference';
  readonly theme = signal<Theme>(this.getInitialTheme());

  constructor() {
    effect(() => {
      const current = this.theme();
      this.applyTheme(current);
      try {
        localStorage.setItem(this.storageKey, current);
      } catch {}
    });
  }

  private getInitialTheme(): Theme {
    try {
      const saved = localStorage.getItem(this.storageKey) as Theme | null;
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'dark';
  }

  private applyTheme(t: Theme): void {
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
    }
  }

  toggleTheme(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  setTheme(t: Theme): void {
    this.theme.set(t);
  }

  isDark(): boolean {
    return this.theme() === 'dark';
  }
}
