import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, output, signal } from '@angular/core';
import { errorMessage } from '../services/errors';
import { Hours, ShiftChange, TeamApi } from '../services/team';
import { MyTimeOffApi, TimeOff, window } from '../services/time-off';
import { Confirm } from './confirm';
import { Toasts } from './toast';

/** One of the student's requests: time off or a shift change, shown the same way. */
interface RequestLine {
  key: string;
  what: string;
  detail: string;
  note: string | null;
  reviewNote: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
  submittedAt: string;
  withdraw: () => Promise<unknown>;
}

/**
 * A student's requests to change when they work, newest first: time off and shift changes in one
 * list, with what the admins said, and Withdraw while they're waiting. Used on the Schedule and
 * Team pages; reload() after sending a new one. (pending) reports how many are waiting.
 */
@Component({
  selector: 'app-my-requests',
  imports: [DatePipe],
  template: `
    @if (loaded() && lines().length === 0) {
      <p class="mt-2 text-sm text-slate-600">None yet. Use “Ask for a change” for time off or different hours.</p>
    }
    <ul class="mt-2 space-y-2">
      @for (line of lines(); track line.key) {
        <li class="rounded-2xl border border-white/50 bg-white/40 p-3 text-sm">
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-medium text-slate-900">{{ line.what }}</p>
              <p class="text-slate-700">{{ line.detail }}</p>
              @if (line.note) { <p class="mt-1 text-xs text-slate-500">“{{ line.note }}”</p> }
              @if (line.reviewNote) { <p class="mt-1 text-xs text-slate-600">Admin: “{{ line.reviewNote }}”</p> }
              <p class="mt-1 text-xs text-slate-400">Asked {{ line.submittedAt | date: 'MMM d, h:mm a' }}</p>
            </div>
            <span class="badge shrink-0" [class]="line.status === 'PENDING' ? 'bg-amber-100 text-amber-900' : line.status === 'APPROVED' ? 'bg-teal-100 text-teal-900' : 'bg-slate-200 text-slate-700'">
              {{ line.status === 'PENDING' ? 'Waiting' : line.status === 'APPROVED' ? 'Approved' : line.status === 'DECLINED' ? 'Declined' : 'Withdrawn' }}
            </span>
          </div>
          @if (line.status === 'PENDING') {
            <button type="button" class="btn btn-quiet mt-2 px-2.5 py-1 text-xs" (click)="withdraw(line)">Withdraw</button>
          }
        </li>
      }
    </ul>
  `,
})
export class MyRequests implements OnInit {
  private readonly team = inject(TeamApi);
  private readonly timeOffApi = inject(MyTimeOffApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  readonly pending = output<number>();

  private readonly timeOff = signal<TimeOff[]>([]);
  private readonly changes = signal<ShiftChange[]>([]);
  protected readonly loaded = signal(false);

  protected readonly lines = computed<RequestLine[]>(() => [
    ...this.timeOff().map((t) => ({
      key: `off-${t.id}`, what: `Time off · ${this.day(t.date)}`, detail: window(t), note: t.reason, reviewNote: t.reviewNote,
      status: t.status, submittedAt: t.submittedAt, withdraw: () => this.timeOffApi.withdraw(t.id),
    })),
    ...this.changes().map((c) => ({
      key: `change-${c.id}`,
      what: c.scope === 'ONE_DAY' ? `Different hours · ${this.day(c.date)} only` : `Different hours · every ${this.weekday(c.date)} from ${this.day(c.date)}`,
      // "now" only means something while it's waiting; once approved, now is the new hours
      detail: c.status === 'PENDING' ? `${hoursText(c.hours)} (now ${hoursText(c.currentHours)})` : hoursText(c.hours),
      note: c.note, reviewNote: c.reviewNote,
      status: c.status, submittedAt: c.submittedAt, withdraw: () => this.team.withdrawChange(c.id),
    })),
  ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    try {
      const [timeOff, changes] = await Promise.all([this.timeOffApi.list(), this.team.changes()]);
      this.timeOff.set(timeOff);
      this.changes.set(changes);
      this.pending.emit(this.lines().filter((line) => line.status === 'PENDING').length);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loaded.set(true);
    }
  }

  protected async withdraw(line: RequestLine): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Withdraw this request?', message: 'You can ask again later.', confirmLabel: 'Withdraw' }))) {
      return;
    }
    try {
      await line.withdraw();
      await this.reload();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private day(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  private weekday(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  }
}

function hoursText(hours: Hours[]): string {
  return hours.length ? hours.map((h) => `${h.start}–${h.end}`).join(', ') : 'not working';
}
