import { Component, Injectable, inject, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'warning' | 'error';
  text: string;
}

/**
 * Short notices that pop up in the corner and disappear by themselves:
 *   toasts.success('Sam was added.');   toasts.warning('Sam isn't on shift then.');   toasts.error('Something went wrong.');
 */
@Injectable({ providedIn: 'root' })
export class Toasts {
  private nextId = 0;
  readonly items = signal<Toast[]>([]);

  success(text: string): void {
    this.show('success', text, 4000);
  }

  /** Done, but with something to know (amber). Stays as long as an error. */
  warning(text: string): void {
    this.show('warning', text, 8000);
  }

  /** Errors stay longer, so there's time to read them. */
  error(text: string): void {
    this.show('error', text, 8000);
  }

  dismiss(id: number): void {
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  private show(kind: Toast['kind'], text: string, milliseconds: number): void {
    const id = ++this.nextId;
    this.items.update((items) => [...items, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), milliseconds);
  }
}

/** Where toasts appear. aria-live makes screen readers announce them. Placed once in the layout. */
@Component({
  selector: 'app-toaster',
  template: `
    <div class="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto" aria-live="polite">
      @for (toast of toasts.items(); track toast.id) {
        <div class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur-xl"
          [class]="toast.kind === 'success' ? 'border-teal-200 bg-teal-50/95 text-teal-950' : toast.kind === 'warning' ? 'border-amber-200 bg-amber-50/95 text-amber-950' : 'border-rose-200 bg-rose-50/95 text-rose-950'"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'">
          <span class="flex-1 leading-6">{{ toast.text }}</span>
          <button type="button" class="icon-button size-6 shrink-0" aria-label="Dismiss" (click)="toasts.dismiss(toast.id)">✕</button>
        </div>
      }
    </div>
  `,
})
export class Toaster {
  protected readonly toasts = inject(Toasts);
}
