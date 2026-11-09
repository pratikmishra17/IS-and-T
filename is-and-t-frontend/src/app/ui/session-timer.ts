import { isPlatformBrowser } from '@angular/common';
import { Component, ElementRef, Injectable, PLATFORM_ID, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Auth, EndReason } from '../services/auth';

/** What the warning dialog shows: why the session is ending and how many seconds are left. */
export interface SessionWarning {
  kind: 'idle' | 'max';
  secondsLeft: number;
}

/** Warn this long before the session ends. */
const WARN_MS = 60_000;

/** While someone is active, ping the backend at most this often so the session doesn't time out. */
const KEEP_ALIVE_MS = 60_000;

/**
 * Signs people out of a session they've walked away from, and when it reaches its maximum length.
 *
 * The backend ends a session after N minutes without a request (15 for admins, 30 for students),
 * and 12 hours after login regardless. This mirrors those clocks in the browser, so the person
 * gets a warning a minute before and the page doesn't sit there showing data after the session
 * has gone. It also tells the two apart:
 * - someone working on a page that makes no requests (typing a long form) is active, so the
 *   session is kept alive with a quiet ping;
 * - someone who stopped touching the page gets the "Still there?" warning, then is signed out.
 * Other tabs of the app share their activity and logouts through localStorage.
 */
@Injectable({ providedIn: 'root' })
export class SessionTimer {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  readonly warning = signal<SessionWarning | null>(null);

  private lastActivity = Date.now();
  private maxWarningSeen = false;
  private pinging = false;
  private signingOut = false;
  private started = false;

  /** Called once when the app starts in the browser (app.config.ts). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const active = () => (this.lastActivity = Date.now());
    for (const type of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
      document.addEventListener(type, active, { passive: true, capture: true });
    }
    window.addEventListener('storage', (event) => {
      if (this.auth.fromOtherTab(event)) {
        this.auth.clear();
        this.warning.set(null);
        void this.router.navigate([this.loginPath()]);
      }
    });
    setInterval(() => this.check(), 1000);
  }

  /** "Stay signed in": any request restarts the backend's idle timer. */
  async stay(): Promise<void> {
    this.warning.set(null);
    this.lastActivity = Date.now();
    await this.ping();
  }

  /** "Got it" on the maximum-length warning: no way to extend it, but stop covering the page. */
  dismissMaxWarning(): void {
    this.maxWarningSeen = true;
    this.warning.set(null);
  }

  async signOut(reason: EndReason | null): Promise<void> {
    if (this.signingOut) {
      return;
    }
    this.signingOut = true;
    const path = this.loginPath();
    this.warning.set(null);
    try {
      await this.auth.endSession();
      await this.router.navigate([path], reason ? { queryParams: { ended: reason } } : {});
    } finally {
      this.signingOut = false;
    }
  }

  /** Runs every second while the app is open. */
  private check(): void {
    const session = this.auth.session();
    if (!session || this.signingOut) {
      this.warning.set(null);
      this.maxWarningSeen = false;
      return;
    }
    const now = Date.now();
    const idleLeft = this.auth.lastContact + session.idleTimeoutSeconds * 1000 - now;
    const maxLeft = session.expiresAt ? new Date(session.expiresAt).getTime() - now : Infinity;

    if (maxLeft <= 0) {
      void this.signOut('max');
      return;
    }
    if (idleLeft <= 0) {
      void this.signOut('idle');
      return;
    }

    // Active since the last request, but the page itself isn't making any: keep the session alive.
    const idleWarningOpen = this.warning()?.kind === 'idle';
    if (!idleWarningOpen && this.lastActivity > this.auth.lastContact && now - this.auth.lastContact > KEEP_ALIVE_MS) {
      void this.ping();
    }

    if (idleLeft <= WARN_MS && idleLeft < maxLeft) {
      this.warning.set({ kind: 'idle', secondsLeft: Math.ceil(idleLeft / 1000) });
    } else if (maxLeft <= WARN_MS && !this.maxWarningSeen) {
      this.warning.set({ kind: 'max', secondsLeft: Math.ceil(maxLeft / 1000) });
    } else if (this.warning()) {
      this.warning.set(null);
    }
  }

  /** Touches the session; if the backend says it's already gone, sign out. */
  private async ping(): Promise<void> {
    if (this.pinging) {
      return;
    }
    this.pinging = true;
    try {
      await this.auth.loadSession();
      if (!this.auth.isLoggedIn()) {
        await this.signOut('ended');
      }
    } catch {
      // offline: try again on the next check
    } finally {
      this.pinging = false;
    }
  }

  private loginPath(): string {
    return this.router.url.startsWith('/admin') ? '/admin/login' : '/login';
  }
}

/** Starts the timer in the browser only (not during server-side rendering, which has no user). */
export function startSessionTimer(): void {
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    inject(SessionTimer).start();
  }
}

/**
 * The warning, placed once in the root component. A native <dialog> opened with showModal(), so
 * it covers the page and keeps keyboard focus; Esc counts as the friendly choice (stay / got it).
 */
@Component({
  selector: 'app-session-warning',
  template: `
    <dialog #dialog class="app-dialog w-[min(28rem,calc(100vw-2rem))] rounded-3xl p-0" aria-labelledby="session-warning-title"
      aria-describedby="session-warning-text" (cancel)="$event.preventDefault(); escape()">
      @if (timer.warning(); as warning) {
        <div class="p-6">
          @if (warning.kind === 'idle') {
            <h2 id="session-warning-title" class="text-lg font-semibold text-slate-900">Still there?</h2>
            <p id="session-warning-text" class="mt-2 text-sm leading-6 text-slate-600">
              For your security, you’ll be signed out in <strong class="tabular-nums" role="timer">{{ clock(warning.secondsLeft) }}</strong>
              because there’s been no activity.
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="btn btn-quiet" (click)="timer.signOut(null)">Log out</button>
              <button type="button" class="btn submit-button text-white" (click)="timer.stay()">Stay signed in</button>
            </div>
          } @else {
            <h2 id="session-warning-title" class="text-lg font-semibold text-slate-900">Your session is ending</h2>
            <p id="session-warning-text" class="mt-2 text-sm leading-6 text-slate-600">
              Sessions last at most 12 hours. You’ll be signed out in <strong class="tabular-nums" role="timer">{{ clock(warning.secondsLeft) }}</strong>,
              so save anything you’re working on, then log in again.
            </p>
            <div class="mt-6 flex justify-end gap-2">
              <button type="button" class="btn btn-quiet" (click)="timer.signOut(null)">Log out now</button>
              <button type="button" class="btn submit-button text-white" (click)="timer.dismissMaxWarning()">Got it</button>
            </div>
          }
        </div>
      }
    </dialog>
  `,
})
export class SessionWarningDialog {
  protected readonly timer = inject(SessionTimer);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Keep the <dialog> open exactly while there is a warning.
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.timer.warning() && !dialog.open) {
        dialog.showModal();
      } else if (!this.timer.warning() && dialog.open) {
        dialog.close();
      }
    });
  }

  protected escape(): void {
    if (this.timer.warning()?.kind === 'idle') {
      void this.timer.stay();
    } else {
      this.timer.dismissMaxWarning();
    }
  }

  /** 75 → "1:15" */
  protected clock(seconds: number): string {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
}
