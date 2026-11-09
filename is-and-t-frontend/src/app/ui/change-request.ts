import { Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../services/errors';
import { PortalApi } from '../services/portal';
import { minutes } from '../services/schedule';
import { Hours, TeamApi } from '../services/team';
import { MyTimeOffApi } from '../services/time-off';
import { SidePanel } from './side-panel';
import { Toasts } from './toast';

/** What the student is asking for: time off, different hours that day, or different hours every week. */
export type ChangeKind = 'off' | 'day' | 'week';

interface Draft {
  date: string;
  kind: ChangeKind;
  /** Time off: the whole day, one of that day's shifts, or some hours. */
  offKind: 'day' | 'shift' | 'hours';
  shift: string;
  offStart: string;
  offEnd: string;
  /** Different hours: the hours they'd work that day (none = not working). */
  hours: Hours[];
  note: string;
  /** What that day has now. */
  current: Hours[];
  /** The hours were typed or picked by hand, so changing the date leaves them alone. */
  hoursEdited: boolean;
}

/**
 * "Ask for a change": the one form a student uses to change when they work, from the Schedule page
 * or the Team page. Time off becomes a time-off request; different hours become a shift change
 * (that day only, or every week from then on). Both go to the admins' Student requests list, and
 * both show in the student's My requests. open(date) shows it; (sent) fires after a request is sent.
 */
@Component({
  selector: 'app-change-request',
  imports: [FormsModule, SidePanel],
  template: `
    <app-side-panel [open]="!!draft()" title="Ask for a change" (closed)="draft.set(null)">
      @if (draft(); as d) {
        <form class="space-y-4 text-sm" (ngSubmit)="send()" (input)="error.set(null)" (change)="error.set(null)">
          <div>
            <label class="block font-medium text-slate-900" for="change-date">Day</label>
            <input id="change-date" type="date" class="glass-input mt-1 rounded-xl px-3 py-2" [min]="today" [ngModel]="d.date" name="date" (ngModelChange)="dateChanged($event)" />
            <p class="mt-1 text-xs text-slate-500">{{ loadingDay() ? 'Checking that day…' : d.current.length ? 'You work ' + hoursText(d.current) + ' that day now.' : 'You’re not working that day now.' }}</p>
          </div>

          <fieldset>
            <legend class="font-medium text-slate-900">What do you need?</legend>
            <div class="mt-1.5 space-y-1.5">
              @for (option of kinds(d); track option.id) {
                <label class="flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2" [class]="d.kind === option.id ? 'border-teal-700 bg-teal-50/80' : 'border-white/80 bg-white/40'" [class.opacity-50]="option.disabled">
                  <input type="radio" name="kind" class="mt-0.5" [attr.data-option]="option.id" [value]="option.id" [disabled]="option.disabled" [(ngModel)]="d.kind" />
                  <span><span class="block font-medium text-slate-900">{{ option.label }}</span><span class="block text-xs text-slate-600">{{ option.help }}</span></span>
                </label>
              }
            </div>
          </fieldset>

          @if (d.kind === 'off') {
            <fieldset>
              <legend class="font-medium text-slate-900">How much?</legend>
              <div class="mt-1.5 grid grid-cols-3 gap-2">
                @for (option of offKinds; track option.id) {
                  <label class="flex cursor-pointer items-center justify-center rounded-xl border px-2 py-2 text-center font-medium" [class]="d.offKind === option.id ? 'border-teal-700 bg-teal-50 text-teal-950' : 'border-white/80 bg-white/50 text-slate-700'">
                    <input type="radio" name="off-kind" class="sr-only" [attr.data-option]="option.id" [value]="option.id" [(ngModel)]="d.offKind" />{{ option.label }}
                  </label>
                }
              </div>
            </fieldset>
            @if (d.offKind === 'shift') {
              <div>
                <label for="off-shift" class="block font-medium text-slate-900">Which shift</label>
                @if (d.current.length === 0) {
                  <p id="off-shift" class="mt-1 text-slate-500">You have no shifts that day.</p>
                } @else {
                  <select id="off-shift" class="glass-input mt-1 w-full rounded-xl px-3 py-2" [(ngModel)]="d.shift" name="shift">
                    @for (shift of d.current; track shift.start) { <option [value]="shift.start + '-' + shift.end">{{ shift.start }}–{{ shift.end }}</option> }
                  </select>
                }
              </div>
            }
            @if (d.offKind === 'hours') {
              <div class="grid grid-cols-2 gap-2 sm:w-72">
                <div><label for="off-start" class="block font-medium text-slate-900">From</label><input id="off-start" type="time" class="glass-input mt-1 w-full rounded-xl px-3 py-2" [(ngModel)]="d.offStart" name="offStart" /></div>
                <div><label for="off-end" class="block font-medium text-slate-900">To</label><input id="off-end" type="time" class="glass-input mt-1 w-full rounded-xl px-3 py-2" [(ngModel)]="d.offEnd" name="offEnd" /></div>
              </div>
            }
          } @else {
            <div>
              <p class="font-medium text-slate-900">Hours you’d work {{ d.kind === 'week' ? 'every ' + weekday(d.date) : 'that day' }}</p>
              @for (h of d.hours; track $index; let i = $index) {
                <div class="mt-1.5 flex items-center gap-2">
                  <input type="time" class="glass-input rounded-xl px-2 py-1.5" [attr.aria-label]="'Start ' + (i + 1)" [(ngModel)]="h.start" (ngModelChange)="d.hoursEdited = true" [name]="'start' + i" />
                  <span aria-hidden="true">–</span>
                  <input type="time" class="glass-input rounded-xl px-2 py-1.5" [attr.aria-label]="'End ' + (i + 1)" [(ngModel)]="h.end" (ngModelChange)="d.hoursEdited = true" [name]="'end' + i" />
                  <button type="button" class="icon-button" [attr.aria-label]="'Remove time ' + (i + 1)" (click)="removeHours(i)">✕</button>
                </div>
              }
              @if (d.hours.length === 0) { <p class="mt-1.5 text-slate-600">Not working that day.</p> }
              <button type="button" class="btn btn-quiet mt-2 px-2.5 py-1 text-xs" (click)="addHours()">+ Add a time</button>
            </div>
          }

          <div>
            <label class="block font-medium text-slate-900" for="change-note">Why (optional)</label>
            <textarea id="change-note" rows="2" maxlength="500" class="glass-input mt-1 w-full rounded-xl px-3 py-2" [(ngModel)]="d.note" name="note" placeholder="Exam, doctor’s appointment…"></textarea>
          </div>
          <p class="text-xs text-slate-500">An admin approves or declines it, and you get an email. If you won’t be working when you have a task, it goes to someone else who is.</p>
          @if (error()) { <p class="rounded-2xl bg-rose-50/90 px-4 py-3 text-rose-900" role="alert">{{ error() }}</p> }
          <button type="submit" class="btn submit-button text-white" [disabled]="busy() || loadingDay()">{{ busy() ? 'Sending…' : 'Send to the admins' }}</button>
        </form>
      }
    </app-side-panel>
  `,
})
export class ChangeRequestPanel {
  private readonly portal = inject(PortalApi);
  private readonly team = inject(TeamApi);
  private readonly timeOff = inject(MyTimeOffApi);
  private readonly toasts = inject(Toasts);

  readonly sent = output<void>();

  protected readonly today = new Date().toLocaleDateString('en-CA');
  protected readonly draft = signal<Draft | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly loadingDay = signal(false);
  protected readonly offKinds = [{ id: 'day', label: 'Whole day' }, { id: 'shift', label: 'One shift' }, { id: 'hours', label: 'Some hours' }] as const;

  /**
   * Opens the form on a date. With picked hours (dragged across your own row on the Team page), it
   * starts as "different hours that day": what you work now plus the time picked.
   */
  async open(date: string, picked?: Hours, kind: ChangeKind = 'off'): Promise<void> {
    this.error.set(null);
    this.draft.set({
      date, kind: picked ? 'day' : kind, offKind: 'day', shift: '', offStart: '09:00', offEnd: '12:00',
      hours: [], note: '', current: [], hoursEdited: !!picked,
    });
    await this.loadDay(date, picked);
  }

  protected async dateChanged(date: string): Promise<void> {
    this.draft.update((d) => d && { ...d, date, kind: d.kind === 'week' && isWeekend(date) ? 'day' : d.kind });
    await this.loadDay(date);
  }

  protected kinds(d: Draft): { id: ChangeKind; label: string; help: string; disabled: boolean }[] {
    return [
      { id: 'off', label: 'Time off', help: 'Not working some or all of that day.', disabled: false },
      { id: 'day', label: 'Different hours that day', help: `Only on ${this.dateText(d.date)}.`, disabled: false },
      {
        id: 'week', label: `Different hours every ${this.weekday(d.date)}`,
        help: isWeekend(d.date) ? 'Weekly shifts are Monday to Friday.' : `From ${this.dateText(d.date)} on. Earlier weeks stay as they were.`,
        disabled: isWeekend(d.date),
      },
    ];
  }

  protected addHours(): void {
    this.draft.update((d) => d && { ...d, hoursEdited: true, hours: [...d.hours, { start: '13:00', end: '15:00' }] });
  }

  protected removeHours(index: number): void {
    this.draft.update((d) => d && { ...d, hoursEdited: true, hours: d.hours.filter((_, i) => i !== index) });
  }

  protected weekday(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  }

  protected hoursText(hours: Hours[]): string {
    return hours.map((h) => `${h.start}–${h.end}`).join(', ');
  }

  protected async send(): Promise<void> {
    const d = this.draft();
    if (!d) {
      return;
    }
    if (!d.date) {
      this.error.set('Choose a day first.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      if (d.kind === 'off') {
        let start: string | null = null;
        let end: string | null = null;
        if (d.offKind === 'shift') {
          [start, end] = d.shift ? d.shift.split('-') : [null, null];
        } else if (d.offKind === 'hours') {
          [start, end] = [d.offStart, d.offEnd];
        }
        if (d.offKind !== 'day' && (!start || !end)) {
          throw new Error('Choose the shift or the hours you need off.');
        }
        await this.timeOff.request(d.date, start, end, d.note);
      } else {
        if (d.hours.some((h) => !h.start || !h.end || minutes(h.end) <= minutes(h.start))) {
          throw new Error('Each time needs an end after its start.');
        }
        await this.team.requestChange({ scope: d.kind === 'week' ? 'EVERY_WEEK' : 'ONE_DAY', date: d.date, hours: d.hours, note: d.note });
      }
      this.toasts.success('Sent. You’ll see the answer under My requests.');
      this.draft.set(null);
      this.sent.emit();
    } catch (error) {
      this.error.set(error instanceof Error && !('status' in error) ? error.message : errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Fetches what the student works on that date. Unless they've typed their own hours, the hours
   * start as that day's (so switching from Monday to Thursday shows Thursday's, not Monday's).
   */
  private async loadDay(date: string, picked?: Hours): Promise<void> {
    if (!date) {
      return;
    }
    this.loadingDay.set(true);
    try {
      const week = await this.portal.week(date);
      const current = (week.days.find((day) => day.date === date)?.shifts ?? []).map((s) => ({ start: s.start, end: s.end }));
      this.draft.update((d) => {
        if (!d || d.date !== date) {
          return d; // the date changed again meanwhile
        }
        const hours = picked ? join([...current, picked]) : d.hoursEdited ? d.hours : current.map((h) => ({ ...h }));
        return { ...d, current, hours, shift: current[0] ? `${current[0].start}-${current[0].end}` : '' };
      });
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loadingDay.set(false);
    }
  }

  private dateText(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/** Joins overlapping or touching times: 9–12 and 11–14 become 9–14. */
export function join(hours: Hours[]): Hours[] {
  const sorted = [...hours].sort((a, b) => minutes(a.start) - minutes(b.start));
  const joined: Hours[] = [];
  for (const h of sorted) {
    const last = joined.at(-1);
    if (last && minutes(h.start) <= minutes(last.end)) {
      if (minutes(h.end) > minutes(last.end)) {
        last.end = h.end;
      }
    } else {
      joined.push({ ...h });
    }
  }
  return joined;
}
