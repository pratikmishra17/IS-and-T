import { Component, computed, effect, input, output, signal } from '@angular/core';

/** How busy a day is: shown as small counts on the month. */
export interface DayCount {
  tasks: number;
  unassigned: number;
}

/** "YYYY-MM-DD" date helpers, at noon so time zones never shift the day. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return addDays(date, -((d.getDay() + 6) % 7));
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

function addMonths(first: string, months: number): string {
  const d = new Date(`${first}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return firstOfMonth(d.toLocaleDateString('en-CA'));
}

/**
 * A month at a glance, to jump around the Planner: each row is a week (Mon–Sun). Click a day to
 * go to its week with that day highlighted, or the "Week" button at the start of a row to go to
 * that week. Days show how many tasks they have (unassigned ones in amber), when counts are given.
 */
@Component({
  selector: 'app-month-picker',
  template: `
    <div class="flex items-center justify-between gap-2">
      <button type="button" class="icon-button" aria-label="Previous month" (click)="move(-1)">‹</button>
      <p class="text-sm font-semibold text-slate-900" aria-live="polite">{{ title() }}</p>
      <button type="button" class="icon-button" aria-label="Next month" (click)="move(1)">›</button>
    </div>

    <table class="mt-2 w-full table-fixed border-separate border-spacing-0.5 text-center text-sm">
      <thead>
        <tr class="text-[0.7rem] uppercase tracking-wider text-slate-500">
          <th scope="col" class="w-14 py-1 font-semibold"><span class="sr-only">Week</span></th>
          @for (name of dayNames; track name) { <th scope="col" class="py-1 font-semibold">{{ name }}</th> }
        </tr>
      </thead>
      <tbody>
        @for (week of weeks(); track week.monday) {
          <tr>
            <td>
              <button type="button" class="w-full rounded-lg px-1 py-2 text-[0.7rem] font-semibold text-teal-900"
                [class.nav-item-active]="week.monday === selectedWeek()"
                [attr.aria-label]="'Week of ' + week.label" [attr.aria-pressed]="week.monday === selectedWeek()"
                (click)="pick.emit({ date: week.monday, whole: 'week' })">Week</button>
            </td>
            @for (day of week.days; track day.date) {
              <td>
                <button type="button" class="flex h-12 w-full flex-col items-center justify-start rounded-lg pt-1.5"
                  [class.nav-item-active]="week.monday === selectedWeek()"
                  [class.text-slate-400]="!day.inMonth" [class.text-slate-800]="day.inMonth"
                  [attr.aria-label]="day.label + (day.count ? ', ' + day.count.tasks + ' tasks' : '')"
                  (click)="pick.emit({ date: day.date, whole: 'day' })">
                  <span class="flex size-6 items-center justify-center rounded-full text-xs font-semibold" [class.badge-solid]="day.date === today()">{{ day.number }}</span>
                  @if (day.count && day.count.tasks > 0) {
                    <span class="mt-0.5 text-[0.65rem] font-semibold leading-none" [class.text-amber-700]="day.count.unassigned > 0" [class.text-slate-500]="day.count.unassigned === 0">
                      {{ day.count.tasks }} task{{ day.count.tasks === 1 ? '' : 's' }}
                    </span>
                  }
                </button>
              </td>
            }
          </tr>
        }
      </tbody>
    </table>
    <p class="mt-2 text-xs text-slate-500">Click a day to see its week, or “Week” for the whole week. <span class="text-amber-700">Amber</span>: has unassigned tasks.</p>
  `,
})
export class MonthPicker {
  /** The Monday of the week on screen. */
  readonly selectedWeek = input.required<string>();
  readonly today = input(new Date().toLocaleDateString('en-CA'));
  /** Tasks per date, for the month shown. */
  readonly counts = input<Record<string, DayCount>>({});

  /** A day or a week was clicked. */
  readonly pick = output<{ date: string; whole: 'day' | 'week' }>();
  /** The month shown changed (its first day): the parent can load its counts. */
  readonly monthShown = output<string>();

  protected readonly dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly month = signal(firstOfMonth(new Date().toLocaleDateString('en-CA')));

  constructor() {
    // Open on the month of the week being looked at.
    effect(() => this.month.set(firstOfMonth(addDays(this.selectedWeek(), 3))));
    effect(() => this.monthShown.emit(this.month()));
  }

  protected readonly title = computed(() =>
    new Date(`${this.month()}T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));

  /** The weeks (Mon–Sun) that cover the month. */
  protected readonly weeks = computed(() => {
    const month = this.month().slice(0, 7);
    const lastDay = addDays(addMonths(this.month(), 1), -1);
    const weeks = [];
    for (let monday = mondayOf(this.month()); monday <= lastDay; monday = addDays(monday, 7)) {
      const days = [0, 1, 2, 3, 4, 5, 6].map((i) => {
        const date = addDays(monday, i);
        return {
          date,
          number: Number(date.slice(8)),
          inMonth: date.slice(0, 7) === month,
          label: new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
          count: this.counts()[date] as DayCount | undefined,
        };
      });
      weeks.push({ monday, days, label: days[0].label });
    }
    return weeks;
  });

  protected move(months: number): void {
    this.month.set(addMonths(this.month(), months));
  }
}
