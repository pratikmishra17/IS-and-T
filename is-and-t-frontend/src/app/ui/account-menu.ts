import { Component, ElementRef, HostListener, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../services/auth';

let nextId = 0;

/**
 * The person's avatar, with a small menu (My account, Log out) that opens when the mouse rests on
 * it or when it's clicked or tapped. Used in both portals: the user portal's top bar and the
 * admin sidebar.
 *
 * Hover opens it for mouse users only; on touch screens a tap opens it (a tap also counts as
 * "entering", which would otherwise open and immediately close it again).
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink],
  template: `
    <div class="relative" (pointerenter)="pointerIn($event)" (pointerleave)="pointerOut($event)" (focusout)="focusOut($event)">
      <button #trigger type="button" [attr.aria-expanded]="open()" [attr.aria-controls]="menuId"
        [attr.aria-label]="'Account menu for ' + name()" [attr.title]="placement() === 'above' ? name() : null"
        [class]="placement() === 'above' ? 'nav-item w-full py-2' : 'glass-hover flex cursor-pointer items-center rounded-full focus-visible:outline-2 focus-visible:outline-teal-800'"
        (click)="toggle()">
        <span class="brand-mark flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-teal-900" aria-hidden="true">{{ initials() }}</span>
        @if (placement() === 'above') {
          <span class="sidebar-label min-w-0 flex-1 text-left">
            <span class="block truncate text-sm font-medium text-slate-900">{{ name() }}</span>
            <span class="block truncate text-xs text-slate-500">{{ auth.isAdmin() ? 'Admin' : 'Student' }}</span>
          </span>
        }
      </button>

      @if (open()) {
        <div [id]="menuId" class="glass-menu absolute z-50 w-60 rounded-2xl p-2"
          [class]="placement() === 'above' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'">
          <div class="px-3 pb-2 pt-1.5">
            <p class="truncate text-sm font-semibold text-slate-900">{{ name() }}</p>
            <p class="truncate text-xs text-slate-500">{{ auth.currentUser()?.email }}</p>
          </div>
          <div class="my-1 border-t border-slate-200/70"></div>
          <a [routerLink]="accountPath()" class="glass-link flex items-center gap-2.5" (click)="close(false)">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
            My account
          </a>
          <button type="button" class="glass-link flex w-full items-center gap-2.5 text-rose-800" (click)="logout()">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            Log out
          </button>
        </div>
      }
    </div>
  `,
})
export class AccountMenu {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');

  /** 'below' for the top bar (menu drops down), 'above' for the bottom of the sidebar (menu pops up). */
  readonly placement = input<'below' | 'above'>('below');

  protected readonly menuId = `account-menu-${nextId++}`;
  protected readonly open = signal(false);
  /** Opened by the mouse resting on it: closes again when the mouse leaves. Opened by a click: stays. */
  private openedByHover = false;
  private closeTimer?: ReturnType<typeof setTimeout>;

  protected readonly name = computed(() => `${this.auth.currentUser()?.firstName ?? ''} ${this.auth.currentUser()?.lastName ?? ''}`.trim());
  protected readonly initials = computed(() =>
    `${this.auth.currentUser()?.firstName?.charAt(0) ?? ''}${this.auth.currentUser()?.lastName?.charAt(0) ?? ''}`);
  protected readonly accountPath = computed(() => (this.router.url.startsWith('/admin') ? '/admin/account' : '/account'));

  protected pointerIn(event: PointerEvent): void {
    clearTimeout(this.closeTimer);
    if (event.pointerType === 'mouse' && !this.open()) {
      this.openedByHover = true;
      this.open.set(true);
    }
  }

  /** A short delay, so the menu doesn't vanish while the mouse crosses the gap to it. */
  protected pointerOut(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && this.openedByHover) {
      this.closeTimer = setTimeout(() => this.close(false), 250);
    }
  }

  protected toggle(): void {
    if (this.open() && !this.openedByHover) {
      this.close(false);
    } else {
      // Clicking a menu the mouse had opened "pins" it open.
      this.openedByHover = false;
      this.open.set(true);
    }
  }

  protected close(returnFocus: boolean): void {
    clearTimeout(this.closeTimer);
    this.open.set(false);
    this.openedByHover = false;
    if (returnFocus) {
      this.trigger().nativeElement.focus();
    }
  }

  /** Logs out and goes straight to the login page of the portal you were in. */
  protected async logout(): Promise<void> {
    const loginPage = this.router.url.startsWith('/admin') ? '/admin/login' : '/login';
    this.close(false);
    await this.auth.endSession();
    await this.router.navigate([loginPage]);
  }

  protected focusOut(event: FocusEvent): void {
    if (!this.host.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.close(false);
    }
  }

  @HostListener('document:click', ['$event'])
  protected clickOutside(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    if (this.open()) {
      this.close(true);
    }
  }
}
