import { Component, inject, input } from '@angular/core';
import { Theme } from '../services/theme';

/**
 * The dark mode switch: a glass pill with a sliding knob (sun for light, moon for dark).
 * Used in the user portal's top bar, the admin sidebar and on the login pages.
 */
@Component({
  selector: 'app-theme-toggle',
  template: `
    <button type="button" role="switch" [attr.aria-checked]="theme.dark()" (click)="theme.toggle()"
      class="glass-hover flex cursor-pointer items-center gap-3 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
      [class.w-full]="label()" [class.px-3]="label()" [class.py-2]="label()" [attr.title]="label() ? null : 'Dark mode'">
      <span class="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors duration-300"
        [class]="theme.dark() ? 'border-white/10 bg-teal-200/25' : 'border-white bg-slate-300/40'">
        <span class="brand-mark flex size-6 items-center justify-center rounded-full transition-transform duration-300 motion-reduce:transition-none"
          [class.translate-x-5]="theme.dark()">
          @if (theme.dark()) {
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-teal-800"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          } @else {
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" class="text-amber-600"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          }
        </span>
      </span>
      <span [class]="label() ? 'sidebar-label text-sm font-medium text-slate-700' : 'sr-only'">Dark mode</span>
    </button>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(Theme);

  /** Show "Dark mode" next to the switch (the admin sidebar); otherwise it's only for screen readers. */
  readonly label = input(false);
}
