import { Component, ElementRef, Injectable, effect, inject, signal, viewChild } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  /** Red confirm button, for actions that can't be undone. */
  danger?: boolean;
}

/**
 * Asks the user to confirm something and waits for the answer:
 *   if (await confirm.ask({ title: 'Remove Sam?', ... })) { ...remove... }
 * Replaces the browser's plain confirm() popup with a styled dialog (ConfirmDialog, placed once in the layout).
 */
@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly current = signal<(ConfirmRequest & { resolve: (ok: boolean) => void }) | null>(null);

  ask(request: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => this.current.set({ ...request, resolve }));
  }

  answer(ok: boolean): void {
    const request = this.current();
    this.current.set(null);
    request?.resolve(ok);
  }
}

/**
 * The dialog itself. The native <dialog> element, opened with showModal(), gives a backdrop,
 * keeps keyboard focus inside, and closes on Esc (which counts as "Cancel").
 */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog #dialog class="app-dialog w-[min(28rem,calc(100vw-2rem))] rounded-3xl p-0" aria-labelledby="confirm-title" (close)="confirm.answer(false)">
      @if (confirm.current(); as request) {
        <div class="p-6">
          <h2 id="confirm-title" class="text-lg font-semibold text-slate-900">{{ request.title }}</h2>
          <p class="mt-2 text-sm leading-6 text-slate-600">{{ request.message }}</p>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="btn btn-quiet" (click)="confirm.answer(false)">Cancel</button>
            <button type="button" class="btn text-white" [class.submit-button]="!request.danger" [class.danger-button]="request.danger" (click)="confirm.answer(true)">{{ request.confirmLabel }}</button>
          </div>
        </div>
      }
    </dialog>
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // Keep the <dialog> open exactly while there is a question waiting.
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.confirm.current() && !dialog.open) {
        dialog.showModal();
      } else if (!this.confirm.current() && dialog.open) {
        dialog.close();
      }
    });
  }
}
