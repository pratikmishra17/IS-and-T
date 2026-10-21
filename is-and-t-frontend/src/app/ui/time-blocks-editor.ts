import { Component, computed, input, model } from '@angular/core';
import { ALL_DAYS, Day, TimeBlock, WEEKDAYS, dayName, totalHours } from '../services/schedule';

/**
 * Edits a list of weekly time blocks (day, start, end), with a running total of hours.
 * Two-way bound with model(): the parent writes [(blocks)]="shifts" and both always hold the
 * same list. Each change creates a new list, so signals and computed() values notice it.
 */
@Component({
  selector: 'app-time-blocks-editor',
  template: `
    <div class="space-y-2">
      @for (block of blocks(); track $index; let i = $index) {
        <div class="flex items-center gap-2">
          <label class="sr-only" [for]="idPrefix() + '-day-' + i">Day</label>
          <select [id]="idPrefix() + '-day-' + i" class="glass-input min-w-0 flex-1 rounded-xl px-2 py-2 text-sm" [value]="block.day" (change)="update(i, 'day', $any($event.target).value)">
            @for (day of days(); track day) { <option [value]="day">{{ label(day) }}</option> }
          </select>
          <label class="sr-only" [for]="idPrefix() + '-start-' + i">Start</label>
          <input [id]="idPrefix() + '-start-' + i" type="time" class="glass-input w-28 rounded-xl px-2 py-2 text-sm" [value]="block.start" (change)="update(i, 'start', $any($event.target).value)" />
          <span class="text-slate-400" aria-hidden="true">–</span>
          <label class="sr-only" [for]="idPrefix() + '-end-' + i">End</label>
          <input [id]="idPrefix() + '-end-' + i" type="time" class="glass-input w-28 rounded-xl px-2 py-2 text-sm" [value]="block.end" (change)="update(i, 'end', $any($event.target).value)"
            [attr.aria-invalid]="block.end <= block.start" />
          <button type="button" class="icon-button shrink-0" [attr.aria-label]="'Remove ' + label(block.day) + ' ' + block.start" (click)="remove(i)">✕</button>
        </div>
      }
      @if (blocks().length === 0) { <p class="text-sm text-slate-500">{{ emptyText() }}</p> }
    </div>
    <div class="mt-2 flex items-center justify-between">
      <button type="button" class="text-sm font-medium text-teal-900 hover:underline" (click)="add()">+ {{ addLabel() }}</button>
      @if (showTotal() && blocks().length > 0) { <span class="text-sm text-slate-600">{{ hours() }} h a week</span> }
    </div>
  `,
})
export class TimeBlocksEditor {
  readonly blocks = model.required<TimeBlock[]>();
  readonly weekdaysOnly = input(false);
  readonly addLabel = input('Add a time');
  readonly emptyText = input('Nothing yet.');
  readonly showTotal = input(true);
  /** Makes each input's id unique when several editors are on one page. */
  readonly idPrefix = input('block');

  protected readonly days = computed<Day[]>(() => (this.weekdaysOnly() ? WEEKDAYS : ALL_DAYS));
  protected readonly hours = computed(() => Math.round(totalHours(this.blocks()) * 10) / 10);
  protected readonly label = dayName;

  protected add(): void {
    const last = this.blocks().at(-1);
    this.blocks.set([...this.blocks(), last ? { ...last } : { day: 'MONDAY', start: '09:00', end: '12:00' }]);
  }

  protected remove(index: number): void {
    this.blocks.set(this.blocks().filter((_, i) => i !== index));
  }

  protected update(index: number, field: keyof TimeBlock, value: string): void {
    this.blocks.set(this.blocks().map((block, i) => (i === index ? { ...block, [field]: value } : block)));
  }
}
