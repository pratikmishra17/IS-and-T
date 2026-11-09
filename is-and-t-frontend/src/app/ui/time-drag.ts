import { Directive, ElementRef, OnDestroy, inject, input, output } from '@angular/core';
import { clock } from '../services/schedule';

/** A time range picked on a horizontal timeline, in minutes after midnight. */
export interface PickedTime {
  start: number;
  end: number;
}

/** Times snap to this many minutes. */
const SNAP = 15;
/** A plain click (no drag) makes a task this long. */
const CLICK_MINUTES = 30;

/**
 * Pick a time range by dragging across a horizontal timeline, like making a meeting in Teams:
 * press on an empty spot, drag sideways, let go. A shaded band shows the times while dragging.
 * A plain click picks a 30-minute slot. Presses on a task (anything marked data-task) or a button
 * are left alone, so those stay clickable.
 *
 * Usage: <div class="relative" [appTimeDrag]="{ start: 420, end: 1140 }" (picked)="...">. Add
 * [appTimeDragOff]="true" to switch it off (for someone who may only look). The
 * element's full width is the range (7:00 to 19:00 here). On touch screens, dragging scrolls the
 * page as usual and a tap picks 30 minutes.
 */
@Directive({
  selector: '[appTimeDrag]',
  host: {
    '(pointerdown)': 'down($event)',
    '(pointermove)': 'move($event)',
    '(pointerup)': 'up()',
    '(pointercancel)': 'cancel()',
    '[class.cursor-cell]': '!off()',
  },
})
export class TimeDrag implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** The times at the element's left and right edges, in minutes after midnight. */
  readonly range = input.required<{ start: number; end: number }>({ alias: 'appTimeDrag' });
  readonly picked = output<PickedTime>();
  /** True: this timeline is only for looking; presses do nothing. */
  readonly off = input(false, { alias: 'appTimeDragOff' });

  private anchor: number | null = null;
  private current = 0;
  private preview: HTMLElement | null = null;

  protected down(event: PointerEvent): void {
    if (this.off() || event.button !== 0 || (event.target as Element).closest('[data-task], button, a')) {
      return;
    }
    this.anchor = this.current = this.timeAt(event, Math.floor);
    if (event.pointerType === 'mouse') {
      this.host.setPointerCapture(event.pointerId);
      event.preventDefault(); // no text selection while dragging
    }
    this.draw();
  }

  protected move(event: PointerEvent): void {
    if (this.anchor === null) {
      return;
    }
    this.current = this.timeAt(event, Math.round);
    this.draw();
  }

  protected up(): void {
    if (this.anchor === null) {
      return;
    }
    const { start, end } = this.selection();
    this.cancel();
    this.picked.emit({ start, end });
  }

  protected cancel(): void {
    this.anchor = null;
    this.preview?.remove();
    this.preview = null;
  }

  ngOnDestroy(): void {
    this.cancel();
  }

  /** What's selected: from the press to the pointer (either way), or 30 minutes for a click. */
  private selection(): PickedTime {
    const anchor = this.anchor ?? 0;
    const { end: last } = this.range();
    if (Math.abs(this.current - anchor) < SNAP) {
      const start = Math.min(anchor, last - CLICK_MINUTES);
      return { start, end: start + CLICK_MINUTES };
    }
    return { start: Math.min(anchor, this.current), end: Math.max(anchor, this.current) };
  }

  /** The shaded band showing the selection while the pointer is down. */
  private draw(): void {
    const { start, end } = this.selection();
    const { start: first, end: last } = this.range();
    if (!this.preview) {
      this.preview = document.createElement('div');
      this.preview.className = 'drag-preview';
      this.preview.setAttribute('aria-hidden', 'true');
      this.host.appendChild(this.preview);
    }
    this.preview.style.left = `${((start - first) / (last - first)) * 100}%`;
    this.preview.style.width = `${((end - start) / (last - first)) * 100}%`;
    this.preview.textContent = `${clock(start)}–${clock(end)}`;
  }

  /** The time under the pointer, snapped to the quarter hour. */
  private timeAt(event: PointerEvent, snap: (n: number) => number): number {
    const { start, end } = this.range();
    const box = this.host.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    return Math.min(end, Math.max(start, start + snap((ratio * (end - start)) / SNAP) * SNAP));
  }
}
