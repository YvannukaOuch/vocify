import { useEffect, useState } from 'react';

/** The slice of Telegram's Mini App SDK (telegram-web-app.js) this app uses. */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string };
  version: string;
  colorScheme: 'light' | 'dark';
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  onEvent(event: string, handler: () => void): void;
  offEvent(event: string, handler: () => void): void;
  disableVerticalSwipes(): void;
  enableVerticalSwipes(): void;
  showConfirm(message: string, callback: (confirmed: boolean) => void): void;
  requestWriteAccess(callback: (granted: boolean) => void): void;
  shareMessage(preparedMessageId: string, callback: (sent: boolean) => void): void;
  BackButton: {
    show(): void;
    hide(): void;
    onClick(handler: () => void): void;
    offClick(handler: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

const webApp = window.Telegram?.WebApp;

/** True when opened inside Telegram (the SDK also loads in a normal browser, just without initData). */
export const inTelegram = Boolean(webApp?.initData);

export const initData = webApp?.initData ?? '';

export const startParam = webApp?.initDataUnsafe.start_param ?? null;

function supports(version: string): TelegramWebApp | null {
  return inTelegram && webApp!.isVersionAtLeast(version) ? webApp! : null;
}

export function setupTelegram() {
  if (!inTelegram) return;
  webApp!.ready();
  webApp!.expand();
  if (supports('6.1')) {
    webApp!.setHeaderColor('secondary_bg_color');
    webApp!.setBackgroundColor('secondary_bg_color');
  }
}

export const haptic = {
  tap: () => supports('6.1')?.HapticFeedback.impactOccurred('light'),
  select: () => supports('6.1')?.HapticFeedback.selectionChanged(),
  success: () => supports('6.1')?.HapticFeedback.notificationOccurred('success'),
  error: () => supports('6.1')?.HapticFeedback.notificationOccurred('error'),
};

export function confirmDialog(message: string): Promise<boolean> {
  const app = supports('6.2');
  if (!app) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => app.showConfirm(message, resolve));
}

/** Asks the user to let the bot message them (needed if they never pressed Start). */
export function requestWriteAccess(): Promise<boolean> {
  const app = supports('6.9');
  if (!app) return Promise.resolve(false);
  return new Promise((resolve) => app.requestWriteAccess(resolve));
}

export const canShareMessages = Boolean(supports('8.0'));

/** Opens Telegram's "send to…" picker for a message the bot prepared. Resolves true if it was sent. */
export function shareMessage(preparedMessageId: string): Promise<boolean> {
  const app = supports('8.0');
  if (!app) return Promise.resolve(false);
  return new Promise((resolve) => app.shareMessage(preparedMessageId, resolve));
}

/** Telegram's own header back button; falls back to nothing outside Telegram (the page shows its own). */
export function useBackButton(onBack: (() => void) | null) {
  useEffect(() => {
    const app = supports('6.1');
    if (!app) return;
    if (!onBack) {
      app.BackButton.hide();
      return;
    }
    app.BackButton.onClick(onBack);
    app.BackButton.show();
    return () => app.BackButton.offClick(onBack);
  }, [onBack]);
}

/** Stops the swipe-down-to-close gesture while the user is scrubbing sliders. */
export function useNoVerticalSwipes() {
  useEffect(() => {
    const app = supports('7.7');
    if (!app) return;
    app.disableVerticalSwipes();
    return () => app.enableVerticalSwipes();
  }, []);
}

function currentScheme(): 'light' | 'dark' {
  if (inTelegram) return webApp!.colorScheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Follows Telegram's theme (or the OS theme in a browser) and keeps the `dark` class in sync. */
export function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState(currentScheme);

  useEffect(() => {
    const update = () => setScheme(currentScheme());
    if (inTelegram) {
      webApp!.onEvent('themeChanged', update);
      return () => webApp!.offEvent('themeChanged', update);
    }
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', scheme === 'dark');
  }, [scheme]);

  return scheme;
}
