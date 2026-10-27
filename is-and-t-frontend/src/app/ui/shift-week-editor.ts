import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, effect, input, model, signal, viewChild } from '@angular/core';
import { Day, TimeBlock, WEEKDAYS, addOnDays, clock, dayName, mergeShifts, minutes, overlaps, totalHours } from '../services/schedule';
import { remembered } from '../services/remember';

/** Each row of the grid is half an hour; dragging snaps to it. */
const SLOT = 30;
/** Height of one half-hour row, in pixels. */
const ROW_PX = 22;

/** What a drag in progress is doing. Times are minutes after midnight. */
type Drag =
  | { mode: 'paint'; day: Day; anchor: number; current: number }
  | { mode: 'move' | 'top' | 'bottom'; index: number; originY: number; from: number; to: number; start: number; end: number; moved: boolean };

/**
 * A student's regular weekly shifts, in two tabs:
 * - Calendar: a week grid (Mon–Fri, half-hour rows) to paint on. Drag down an empty column to add
 *   a shift, drag a shift to move it, drag its top or bottom edge to resize it. Clicking shifts
 *   selects them (several at once); every selected shift is listed underneath to edit or delete.
 *   The student's classes (hatched) and the hours they asked for (amber) are drawn underneath, so
 *   shifts can be painted around them.
 * - Type: pick several days and one time range to add them all at once, and edit every shift as a row.
 *
 * Two-way bound like TimeBlocksEditor: [(blocks)]="shifts". Every change goes through
 * mergeShifts, so overlapping or touching shifts on a day become one.
 */
@Component({
  selector: 'app-shift-week-editor',
  imports: [NgTemplateOutlet],
  template: `
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div role="tablist" aria-label="How to set shifts" class="inline-flex gap-1 rounded-2xl border border-white/60 bg-white/30 p-1">
        <button type="button" role="tab" class="rounded-xl px-4 py-1.5 text-sm font-medium" [class.nav-item-active]="mode() === 'calendar'" [class.text-slate-700]="mode() !== 'calendar'"
          [attr.aria-selected]="mode() === 'calendar'" (click)="mode.set('calendar')">Calendar</button>
        <button type="button" role="tab" class="rounded-xl px-4 py-1.5 text-sm font-medium" [class.nav-item-active]="mode() === 'type'" [class.text-slate-700]="mode() !== 'type'"
          [attr.aria-selected]="mode() === 'type'" (click)="mode.set('type')">Type</button>
      </div>
      <p class="text-sm" [class.text-amber-800]="overLimit()" [class.text-slate-700]="!overLimit()">
        <span class="font-semibold">{{ hours() }} h</span> a week@if (limit()) { <span class="text-slate-500"> of {{ limit() }} h</span> }
      </p>
    </div>

    @if (mode() === 'calendar') {
      <p class="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500" aria-hidden="true">
        <span class="flex items-center gap-1"><span class="shift-block inline-block size-3 rounded"></span> Shift</span>
        <span class="flex items-center gap-1"><span class="shift-class inline-block size-3 rounded"></span> Class</span>
        <span class="flex items-center gap-1"><span class="inline-block size-3 rounded border border-dashed border-amber-500 bg-amber-200/40"></span> Asked for</span>
        <span class="ml-auto">Every week, all semester</span>
      </p>

      <!-- The grid: a fixed height that scrolls, with the day names kept in view -->
      <div class="mt-2 select-none rounded-2xl border border-white/70 bg-white/40">
        <div class="grid grid-cols-[2.6rem_repeat(5,minmax(0,1fr))] gap-x-1 border-b border-slate-200/70 px-2 pt-2">
          <div></div>
          @for (day of days; track day) {
            <div class="pb-1.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">{{ short(day) }}</div>
          }
        </div>
        <div #scroller class="max-h-[26rem] overflow-y-auto px-2 pb-2 pt-2">
          <div class="grid grid-cols-[2.6rem_repeat(5,minmax(0,1fr))] gap-x-1">
            <div class="relative" [style.height.px]="height()" aria-hidden="true">
              @for (hour of hourMarks(); track hour) {
                <span class="absolute right-1.5 -translate-y-1/2 text-[0.65rem] tabular-nums text-slate-500" [style.top.px]="y(hour)">{{ hourLabel(hour) }}</span>
              }
            </div>

            @for (day of days; track day) {
              <div #column class="shift-column relative cursor-crosshair rounded-lg" [style.height.px]="height()"
                [style.background-size]="'100% ' + rowPx * 2 + 'px'"
                (pointerdown)="paintStart($event, day, column)" (pointermove)="pointerMove($event, column)"
                (pointerup)="pointerUp()" (pointercancel)="drag.set(null)">
                @for (block of on(classes(), day); track $index) {
                  <div class="shift-class pointer-events-none absolute inset-x-0.5 rounded-md" [style.top.px]="y(block.start)" [style.height.px]="span(block)"
                    [title]="'Class ' + block.start + '–' + block.end"></div>
                }
                @for (block of on(preferred(), day); track $index) {
                  <div class="pointer-events-none absolute inset-x-0.5 rounded-md border border-dashed border-amber-500 bg-amber-200/30" [style.top.px]="y(block.start)" [style.height.px]="span(block)"></div>
                }
                @for (item of shown(); track item.index) {
                  @if (item.block.day === day) {
                    <button type="button" data-shift class="shift-block absolute inset-x-1 overflow-hidden rounded-lg px-1.5 text-left text-[0.7rem] font-semibold leading-[1.35rem] text-white"
                      [class.clash]="item.clash" [class.is-selected]="item.selected"
                      [style.top.px]="y(item.block.start)" [style.height.px]="span(item.block)"
                      [attr.aria-label]="label(item.block.day) + ' shift, ' + item.block.start + ' to ' + item.block.end + (item.clash ? ', overlaps a class' : '')"
                      [attr.aria-pressed]="item.selected"
                      (pointerdown)="grab($event, item.index, 'move', column)" (click)="toggle(item.index)"
                      (keydown.delete)="remove([item.index])" (keydown.backspace)="remove([item.index])">
                      <span class="absolute inset-x-2 top-0 h-2 cursor-ns-resize" (pointerdown)="grab($event, item.index, 'top', column)"></span>
                      {{ item.block.start }}–{{ item.block.end }}
                      <span class="absolute inset-x-2 bottom-0 h-2 cursor-ns-resize" (pointerdown)="grab($event, item.index, 'bottom', column)"></span>
                    </button>
                  }
                }
                @if (painting(); as paint) {
                  @if (paint.day === day) {
                    <div class="pointer-events-none absolute inset-x-1 rounded-lg border-2 border-dashed border-teal-600 bg-teal-200/40 px-1.5 text-[0.7rem] font-semibold leading-[1.35rem] text-teal-950"
                      [style.top.px]="y(paint.start)" [style.height.px]="(paint.end - paint.start) / slot * rowPx">{{ time(paint.start) }}–{{ time(paint.end) }}</div>
                  }
                }
              </div>
            }
          </div>
        </div>
      </div>
      <p class="mt-1.5 text-xs text-slate-500">Drag down a day to add a shift · drag a shift to move it, its edges to resize · click shifts to select them (several at once) to edit or delete.</p>

      <!-- Everything selected: exact times, or delete -->
      @if (selectedRows().length > 0) {
        <div class="mt-3 rounded-2xl border border-white/70 bg-white/40 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-semibold text-slate-900">{{ selectedRows().length }} shift{{ selectedRows().length === 1 ? '' : 's' }} selected</p>
            <div class="flex gap-2">
              <button type="button" class="btn btn-quiet px-3 py-1.5" (click)="points.set([])">Clear selection</button>
              <button type="button" class="btn btn-quiet px-3 py-1.5 text-rose-800" (click)="removeSelected()">Delete selected</button>
            </div>
          </div>
          <ng-container *ngTemplateOutlet="rowsTemplate; context: { $implicit: selectedRows() }" />
        </div>
      }
    } @else {
      <!-- Typing: the same hours on several days, and every shift as a row -->
      <div class="mt-3 rounded-2xl border border-white/70 bg-white/40 p-3">
        <p class="text-sm font-medium text-slate-700">Add the same hours on several days</p>
        <div class="mt-2 flex flex-wrap gap-1" role="group" aria-label="Days">
          @for (day of days; track day) {
            <button type="button" class="btn px-3 py-1.5" [class.badge-solid]="picked().includes(day)" [class.btn-quiet]="!picked().includes(day)"
              [attr.aria-pressed]="picked().includes(day)" (click)="toggleDay(day)">{{ short(day) }}</button>
          }
          <button type="button" class="text-glass ml-1 text-sm font-medium text-teal-900" (click)="picked.set(picked().length === days.length ? [] : days.slice())">
            {{ picked().length === days.length ? 'None' : 'All weekdays' }}
          </button>
        </div>
        <div class="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label for="quick-start" class="field-label">From</label>
            <input id="quick-start" type="time" step="900" class="glass-input w-32 rounded-xl px-2 py-1.5 text-sm" [value]="quickStart()" (change)="quickStart.set($any($event.target).value)" />
          </div>
          <div>
            <label for="quick-end" class="field-label">To</label>
            <input id="quick-end" type="time" step="900" class="glass-input w-32 rounded-xl px-2 py-1.5 text-sm" [value]="quickEnd()" (change)="quickEnd.set($any($event.target).value)" />
          </div>
          <button type="button" class="btn btn-quiet py-1.5" (click)="addQuick()">Add</button>
        </div>
      </div>

      <div class="mt-3 rounded-2xl border border-white/70 bg-white/40 p-3">
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-medium text-slate-700">Weekly shifts</p>
          @if (blocks().length > 0) {
            <button type="button" class="text-glass text-sm font-medium text-rose-800" (click)="clearAll()">Clear all</button>
          }
        </div>
        @if (blocks().length === 0) {
          <p class="mt-1 text-sm text-slate-500">No shifts yet. Add some above.</p>
        }
        <ng-container *ngTemplateOutlet="rowsTemplate; context: { $implicit: allRows() }" />
      </div>
    }
    @if (error()) { <p role="alert" class="mt-2 text-sm text-rose-800">{{ error() }}</p> }

    <!-- One editable row per shift: day, start, end, delete -->
    <ng-template #rowsTemplate let-rows>
      <ul class="mt-2 space-y-1.5">
        @for (row of rows; track row.index) {
          <li class="flex flex-wrap items-center gap-2">
            <span class="w-24 text-sm font-medium text-slate-900">{{ label(row.block.day) }}</span>
            <label class="sr-only" [for]="'shift-start-' + row.index">{{ label(row.block.day) }} start</label>
            <input [id]="'shift-start-' + row.index" type="time" step="900" class="glass-input w-32 rounded-xl px-2 py-1.5 text-sm" [value]="row.block.start" (change)="edit(row.index, 'start', $any($event.target).value)" />
            <span class="text-slate-400" aria-hidden="true">–</span>
            <label class="sr-only" [for]="'shift-end-' + row.index">{{ label(row.block.day) }} end</label>
            <input [id]="'shift-end-' + row.index" type="time" step="900" class="glass-input w-32 rounded-xl px-2 py-1.5 text-sm" [value]="row.block.end" (change)="edit(row.index, 'end', $any($event.target).value)" />
            @if (row.clash) { <span class="badge bg-rose-100 text-rose-900">Overlaps a class</span> }
            <button type="button" class="icon-button ml-auto" [attr.aria-label]="'Delete ' + label(row.block.day) + ' ' + row.block.start" (click)="remove([row.index])">✕</button>
          </li>
        }
      </ul>
    </ng-template>
  `,
})
export class ShiftWeekEditor {
  readonly blocks = model.required<TimeBlock[]>();
  /** The student's classes, drawn hatched; shifts overlapping one turn red. */
  readonly classes = input<TimeBlock[]>([]);
  /** The hours the student asked for, drawn in amber. */
  readonly preferred = input<TimeBlock[]>([]);
  /** The semester's weekly hour limit, if any. */
  readonly limit = input<number | null>(null);

  protected readonly days = WEEKDAYS;
  protected readonly slot = SLOT;
  protected readonly rowPx = ROW_PX;
  protected readonly label = dayName;
  protected readonly time = clock;

  /** Which tab: paint on the calendar, or type. */
  protected readonly mode = remembered<'calendar' | 'type'>('shifts.mode', 'calendar', { allowed: ['calendar', 'type'] });
  /**
   * What's selected, remembered as moments ("Monday at 9:00") rather than list positions: a shift
   * is selected if it contains one. That way the selection survives merging, moving and re-sorting.
   */
  protected readonly points = signal<Point[]>([]);
  protected readonly drag = signal<Drag | null>(null);
  protected readonly picked = signal<Day[]>([]);
  protected readonly quickStart = signal('09:00');
  protected readonly quickEnd = signal('12:00');
  protected readonly error = signal<string | null>(null);

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  /** Whether the grid has been scrolled to the working hours since it appeared. */
  private scrolled = false;

  constructor() {
    // When the grid appears, scroll it to the first shift (or 8 AM), not 7 AM.
    effect(() => {
      const scroller = this.scroller()?.nativeElement;
      if (scroller && !this.scrolled) {
        this.scrolled = true;
        const first = Math.min(8 * 60, ...this.blocks().map((block) => minutes(block.start)));
        scroller.scrollTop = Math.max(0, this.y(first) - ROW_PX);
      } else if (!scroller) {
        this.scrolled = false;
      }
    });
  }

  protected readonly hours = computed(() => Math.round(totalHours(this.blocks()) * 10) / 10);
  protected readonly overLimit = computed(() => this.limit() !== null && this.hours() > this.limit()!);

  /** The hours the grid shows: 7:00–22:00, stretched to fit anything earlier or later. */
  protected readonly range = computed(() => {
    const all = [...this.blocks(), ...this.classes(), ...this.preferred()].filter((block) => WEEKDAYS.includes(block.day));
    const first = Math.min(7 * 60, ...all.map((block) => minutes(block.start)));
    const last = Math.max(22 * 60, ...all.map((block) => minutes(block.end)));
    return { start: Math.floor(first / 60) * 60, end: Math.ceil(last / 60) * 60 };
  });
  protected readonly height = computed(() => ((this.range().end - this.range().start) / SLOT) * ROW_PX);
  protected readonly hourMarks = computed(() => {
    const marks: number[] = [];
    for (let at = this.range().start; at < this.range().end; at += 60) {
      marks.push(at);
    }
    return marks;
  });

  /** Every shift as a row: its position in the list, whether it overlaps a class, whether it's selected. */
  protected readonly allRows = computed(() => this.blocks().map((block, index) => ({
    block, index,
    clash: this.classes().some((lesson) => overlaps(lesson, block)),
    selected: this.points().some((point) => contains(block, point)),
  })));

  protected readonly selectedRows = computed(() => this.allRows().filter((row) => row.selected));

  /** The shifts to draw, with the one being dragged shown where it's going. */
  protected readonly shown = computed(() => {
    const drag = this.drag();
    return this.allRows().map((row) => {
      if (!drag || drag.mode === 'paint' || drag.index !== row.index) {
        return row;
      }
      const block = { ...row.block, start: clock(drag.start), end: clock(drag.end) };
      return { ...row, block, clash: this.classes().some((lesson) => overlaps(lesson, block)) };
    });
  });

  /** The shift being painted, while dragging on an empty spot. */
  protected readonly painting = computed(() => {
    const drag = this.drag();
    if (drag?.mode !== 'paint') {
      return null;
    }
    return { day: drag.day, start: Math.min(drag.anchor, drag.current), end: Math.max(drag.anchor, drag.current) + SLOT };
  });

  // ---- Drawing helpers ----

  /** Pixels from the top of the grid for a time ("09:30" or minutes). */
  protected y(time: string | number): number {
    return (((typeof time === 'string' ? minutes(time) : time) - this.range().start) / SLOT) * ROW_PX;
  }

  protected span(block: TimeBlock): number {
    return ((minutes(block.end) - minutes(block.start)) / SLOT) * ROW_PX;
  }

  protected on(blocks: TimeBlock[], day: Day): TimeBlock[] {
    return blocks.filter((block) => block.day === day);
  }

  protected short(day: Day): string {
    return dayName(day).slice(0, 3);
  }

  /** 13 * 60 → "1 PM" */
  protected hourLabel(at: number): string {
    const hour = at / 60;
    return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  // ---- Painting, moving and resizing ----

  /** Pressing on an empty spot starts painting a new shift. */
  protected paintStart(event: PointerEvent, day: Day, column: HTMLElement): void {
    if (event.button !== 0 || (event.target as Element).closest('[data-shift]')) {
      return;
    }
    const at = this.slotAt(event, column);
    column.setPointerCapture(event.pointerId);
    this.drag.set({ mode: 'paint', day, anchor: at, current: at });
    event.preventDefault();
  }

  /** Pressing on a shift (or one of its edges) starts moving (or resizing) it. */
  protected grab(event: PointerEvent, index: number, mode: 'move' | 'top' | 'bottom', column: HTMLElement): void {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const block = this.blocks()[index];
    column.setPointerCapture(event.pointerId);
    this.drag.set({
      mode, index, originY: event.clientY, moved: false,
      from: minutes(block.start), to: minutes(block.end), start: minutes(block.start), end: minutes(block.end),
    });
  }

  protected pointerMove(event: PointerEvent, column: HTMLElement): void {
    const drag = this.drag();
    if (!drag) {
      return;
    }
    if (drag.mode === 'paint') {
      this.drag.set({ ...drag, current: this.slotAt(event, column) });
      return;
    }
    const delta = Math.round((event.clientY - drag.originY) / ROW_PX) * SLOT;
    const { start: top, end: bottom } = this.range();
    let start = drag.from;
    let end = drag.to;
    if (drag.mode === 'move') {
      start = clamp(drag.from + delta, top, bottom - (drag.to - drag.from));
      end = start + (drag.to - drag.from);
    } else if (drag.mode === 'top') {
      start = clamp(drag.from + delta, top, drag.to - SLOT);
    } else {
      end = clamp(drag.to + delta, drag.from + SLOT, bottom);
    }
    this.drag.set({ ...drag, start, end, moved: drag.moved || delta !== 0 });
  }

  protected pointerUp(): void {
    const drag = this.drag();
    this.drag.set(null);
    if (!drag) {
      return;
    }
    if (drag.mode === 'paint') {
      // A click without dragging: clear the selection if there is one, otherwise add a one-hour shift.
      if (drag.anchor === drag.current && this.points().length > 0) {
        this.points.set([]);
        return;
      }
      const start = Math.min(drag.anchor, drag.current);
      const end = drag.anchor === drag.current
        ? Math.min(start + 60, this.range().end)
        : Math.max(drag.anchor, drag.current) + SLOT;
      this.commit([...this.blocks(), { day: drag.day, start: clock(start), end: clock(end) }]);
      this.points.update((points) => [...points, { day: drag.day, at: start }]);
    } else if (drag.moved) {
      const block = this.blocks()[drag.index];
      this.commit(this.blocks().map((b, i) => (i === drag.index ? { ...b, start: clock(drag.start), end: clock(drag.end) } : b)));
      this.repoint(block, { day: block.day, at: drag.start });
    }
  }

  // ---- Selecting and editing ----

  /** Clicking a shift adds it to the selection, or takes it out again. */
  protected toggle(index: number): void {
    const block = this.blocks()[index];
    if (this.points().some((point) => contains(block, point))) {
      this.points.update((points) => points.filter((point) => !contains(block, point)));
    } else {
      this.points.update((points) => [...points, { day: block.day, at: minutes(block.start) }]);
    }
  }

  protected edit(index: number, field: 'start' | 'end', value: string): void {
    const block = this.blocks()[index];
    if (!block || !value) {
      return;
    }
    const edited = { ...block, [field]: value };
    if (minutes(edited.end) <= minutes(edited.start)) {
      this.error.set('A shift has to end after it starts.');
      return;
    }
    this.commit(this.blocks().map((b, i) => (i === index ? edited : b)));
    this.repoint(block, { day: edited.day, at: minutes(edited.start) });
  }

  protected remove(indexes: number[]): void {
    const removed = indexes.map((index) => this.blocks()[index]);
    this.blocks.set(this.blocks().filter((_, i) => !indexes.includes(i)));
    this.points.update((points) => points.filter((point) => !removed.some((block) => block && contains(block, point))));
  }

  protected removeSelected(): void {
    this.remove(this.selectedRows().map((row) => row.index));
  }

  protected clearAll(): void {
    this.blocks.set([]);
    this.points.set([]);
  }

  protected toggleDay(day: Day): void {
    this.picked.update((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  }

  protected addQuick(): void {
    if (this.picked().length === 0) {
      this.error.set('Pick at least one day.');
      return;
    }
    if (!this.quickStart() || !this.quickEnd() || minutes(this.quickEnd()) <= minutes(this.quickStart())) {
      this.error.set('A shift has to end after it starts.');
      return;
    }
    this.error.set(null);
    this.blocks.set(addOnDays(this.blocks(), this.picked(), this.quickStart(), this.quickEnd()));
  }

  /** Saves a change, tidied by mergeShifts. */
  private commit(next: TimeBlock[]): void {
    this.blocks.set(mergeShifts(next));
    this.error.set(null);
  }

  /** A selected shift moved or changed: its selection follows it. */
  private repoint(before: TimeBlock, after: Point): void {
    if (this.points().some((point) => contains(before, point))) {
      this.points.update((points) => [...points.filter((point) => !contains(before, point)), after]);
    }
  }

  /** The half-hour row under the pointer, as minutes after midnight. */
  private slotAt(event: PointerEvent, column: HTMLElement): number {
    const rows = (this.range().end - this.range().start) / SLOT;
    const row = clamp(Math.floor((event.clientY - column.getBoundingClientRect().top) / ROW_PX), 0, rows - 1);
    return this.range().start + row * SLOT;
  }
}

/** A moment in the week: a day and minutes after midnight. */
interface Point {
  day: Day;
  at: number;
}

function contains(block: TimeBlock, point: Point): boolean {
  return block.day === point.day && minutes(block.start) <= point.at && point.at < minutes(block.end);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
