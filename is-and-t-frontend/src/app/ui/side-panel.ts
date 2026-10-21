import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

let nextId = 0;

/**
 * A panel that slides in from the right, used for add and edit forms so the list stays visible.
 * Usage: <app-side-panel [open]="editing()" title="Add student" (closed)="editing.set(false)"> ...form... </app-side-panel>
 * Like ConfirmDialog it is a native <dialog>, so Esc and the backdrop behave as expected.
 */
@Component({
  selector: 'app-side-panel',
  template: `
    <dialog #dialog class="app-dialog side-panel p-0" [attr.aria-labelledby]="titleId" (close)="closed.emit()">
      <div class="flex h-full flex-col">
        <header class="flex items-center justify-between border-b border-slate-200/70 px-6 py-4">
          <h2 [id]="titleId" class="text-lg font-semibold text-slate-900">{{ title() }}</h2>
          <button type="button" class="icon-button" aria-label="Close" (click)="dialog.close()">✕</button>
        </header>
        <div class="flex-1 overflow-y-auto px-6 py-5">
          <ng-content />
        </div>
      </div>
    </dialog>
  `,
})
export class SidePanel {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly closed = output<void>();
  protected readonly titleId = `side-panel-title-${++nextId}`;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      if (this.open() && !dialog.open) {
        dialog.showModal();
      } else if (!this.open() && dialog.open) {
        dialog.close();
      }
    });
  }
}
