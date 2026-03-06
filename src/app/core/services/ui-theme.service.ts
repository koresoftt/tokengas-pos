import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type TgTheme = 'dark' | 'light';
const KEY = 'tg_theme_v1';

@Injectable({ providedIn: 'root' })
export class UiThemeService {
  private current: TgTheme = 'dark';

  async loadAndApply(): Promise<TgTheme> {
    try {
      const { value } = await Preferences.get({ key: KEY });
      const t = (value === 'light' || value === 'dark') ? (value as TgTheme) : 'dark';
      this.apply(t);
      return t;
    } catch {
      this.apply('dark');
      return 'dark';
    }
  }

  get(): TgTheme {
    return this.current;
  }

  async set(theme: TgTheme): Promise<void> {
    this.apply(theme);
    await Preferences.set({ key: KEY, value: theme });
  }

  apply(theme: TgTheme) {
    this.current = theme;

    const root = document.documentElement;
    root.classList.add('tg-theme');
    root.classList.remove('tg-theme-dark', 'tg-theme-light');

    if (theme === 'light') {
      root.classList.add('tg-theme-light');
      root.style.colorScheme = 'light';
    } else {
      root.classList.add('tg-theme-dark');
      root.style.colorScheme = 'dark';
    }
  }
}