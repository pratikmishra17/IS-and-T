import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';

const STORAGE_KEY = 'isandt.theme';

/** Elements with a pointer-following glass light (see "Liquid-glass hover" in styles.css). */
const GLASS_SELECTOR = [
  'button', 'a[href]', 'summary', '[role="button"]', '[role="tab"]', '.glass-hover', '.glass-panel',
  'div[class*="rounded-"][class*="bg-white/"]', 'section[class*="rounded-"][class*="bg-white/"]', 'li[class*="rounded-"][class*="bg-white/"]',
].join(', ');

/**
 * Light or dark mode, and which portal's colours to use. Both are attributes on <html>
 * (data-theme, data-portal) that styles.css reads; public/theme-init.js sets them before the app
 * starts, and this service changes them afterwards.
 *
 * Until someone flips the switch, the theme follows the device's setting (and changes with it);
 * once they choose, the choice is remembered in this browser.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private started = false;

  readonly dark = signal(this.document.documentElement.getAttribute('data-theme') === 'dark');

  toggle(): void {
    this.apply(!this.dark(), true);
  }

  /** Each portal's layout calls this, so its accent colour and backdrop apply. */
  setPortal(portal: 'user' | 'admin'): void {
    this.document.documentElement.setAttribute('data-portal', portal);
  }

  /** Called once when the app starts in the browser (app.config.ts). */
  start(): void {
    if (!this.browser || this.started) {
      return;
    }
    this.started = true;

    // Follow the device's light/dark setting while the person hasn't chosen one here.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      if (!this.stored()) {
        this.apply(event.matches, false);
      }
    });

    // The glass sheen follows the pointer: keep --mx/--my (the pointer's position inside the
    // element under it) up to date, at most once per frame.
    let frame = 0;
    let latest: PointerEvent | null = null;
    this.document.addEventListener('pointermove', (event) => {
      latest = event;
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          // The button under the pointer, and the card and panel around it, each get their own position.
          let target = latest?.target instanceof Element ? latest.target.closest<HTMLElement>(GLASS_SELECTOR) : null;
          for (let depth = 0; target && latest && depth < 4; depth++) {
            const box = target.getBoundingClientRect();
            target.style.setProperty('--mx', `${latest.clientX - box.left}px`);
            target.style.setProperty('--my', `${latest.clientY - box.top}px`);
            target = target.parentElement?.closest<HTMLElement>(GLASS_SELECTOR) ?? null;
          }
        });
      }
    }, { passive: true });
  }

  private apply(dark: boolean, remember: boolean): void {
    const root = this.document.documentElement;
    // Fade the colours across for a moment instead of an abrupt flash
    const fade = this.browser && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (fade) {
      root.classList.add('theme-fade');
      setTimeout(() => root.classList.remove('theme-fade'), 320);
    }
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    this.dark.set(dark);
    if (remember) {
      try {
        localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
      } catch {
        // storage blocked: the choice lasts until the page is reloaded
      }
    }
  }

  private stored(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}

/** Starts the theme in the browser only (app.config.ts). */
export function startTheme(): void {
  inject(Theme).start();
}
