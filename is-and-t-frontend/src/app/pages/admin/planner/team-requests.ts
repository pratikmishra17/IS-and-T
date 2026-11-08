import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../../services/errors';
import { AdminTeamApi, Hours, Offer, ShiftChange } from '../../../services/team';
import { AdminTimeOffApi, TimeOff, window } from '../../../services/time-off';
import { Toasts } from '../../../ui/toast';

/**
 * The Planner's Student requests tab, first part: changes to when students work (time off and
 * shift changes, in one list by date, as students ask for them with "Ask for a change") and offers
 * to take someone's task ("I can do this"). Approving time off moves the student's tasks in that
 * time to others; approving a shift change applies it; accepting an offer gives the student the
 * task. The Planner loads the lists (for the tab's number) and reloads them when (changed) fires.
 */
@Component({
  selector: 'app-team-requests',
  imports: [DatePipe, FormsModule],
  template: `
    <section aria-labelledby="changes-title">
      <h2 id="changes-title" class="text-lg font-semibold text-slate-900">Time off and shift changes</h2>
      @if (lastOutcome(); as outcome) {
        <div role="status" class="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-sm">
          <div class="flex items-start justify-between gap-3">
            <p class="font-semibold text-slate-900">{{ outcome.title }}</p>
            <button type="button" class="icon-button size-6" aria-label="Dismiss" (click)="lastOutcome.set(null)">✕</button>
          </div>
          @if (outcome.lines.length === 0) { <p class="mt-1 text-slate-600">No tasks were affected.</p> }
          <ul class="mt-1 space-y-1">
            @for (line of outcome.lines; track $index) {
              <li [class.text-rose-900]="line.includes('couldn')" [class.font-medium]="line.includes('couldn')" [class.text-slate-700]="!line.includes('couldn')">{{ line.includes('couldn') ? '⚠ ' : '✓ ' }}{{ line }}</li>
            }
          </ul>
        </div>
      }
      @if (byDate().length === 0) {
        <p class="mt-2 text-sm text-slate-600">None waiting. Students ask with “Ask for a change” on their Schedule or Team page.</p>
      }
      <ul class="mt-3 space-y-3">
        @for (entry of byDate(); track entry.key) {
          @if (entry.timeOff; as request) {
            <li class="rounded-2xl border border-white/70 bg-white/50 p-4" [attr.data-timeoff]="request.id">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-semibold text-slate-900">{{ request.studentName }} <span class="badge ml-1 bg-slate-200/80 text-slate-700">Time off</span></p>
                  <p class="text-sm text-slate-700">{{ request.date | date: 'EEEE, MMM d' }} · {{ window(request) }}</p>
                  @if (request.reason) { <p class="mt-1 text-sm text-slate-600">“{{ request.reason }}”</p> }
                </div>
                <p class="text-xs text-slate-500">asked {{ request.submittedAt | date: 'MMM d, h:mm a' }}</p>
              </div>
              @if (request.affectedTasks.length > 0) {
                <div class="mt-3 rounded-xl bg-amber-50/80 px-3 py-2 text-sm text-amber-950">
                  <p class="font-medium">Approving moves {{ request.affectedTasks.length === 1 ? 'this task' : 'these tasks' }} to someone else on shift:</p>
                  <ul class="mt-1">
                    @for (task of request.affectedTasks; track task.id) { <li>• {{ task.startTime }}–{{ task.endTime }} {{ task.title }}</li> }
                  </ul>
                </div>
              } @else {
                <p class="mt-2 text-xs text-slate-500">No tasks in that time.</p>
              }
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <label class="sr-only" [for]="'off-note-' + request.id">Note to {{ request.studentName }}</label>
                <input [id]="'off-note-' + request.id" class="glass-input w-full rounded-xl px-3 py-2 text-sm sm:w-64" placeholder="Note (optional)" maxlength="500" [(ngModel)]="offNotes[request.id]" />
                <button type="button" class="btn submit-button text-white" [disabled]="busyId() === 'off-' + request.id" (click)="answerTimeOff(request, true)">Approve</button>
                <button type="button" class="btn btn-quiet" [disabled]="busyId() === 'off-' + request.id" (click)="answerTimeOff(request, false)">Decline</button>
              </div>
            </li>
          } @else if (entry.change; as change) {
            <li class="rounded-2xl border border-white/70 bg-white/50 p-4" [attr.data-change]="change.id">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="font-semibold text-slate-900">{{ change.studentName }} <span class="badge ml-1 bg-teal-100/80 text-teal-900">Different hours</span></p>
                  <p class="text-sm text-slate-700">
                    @if (change.scope === 'ONE_DAY') { {{ change.date | date: 'EEEE, MMM d' }} only }
                    @else { Every {{ weekday(change.date) }}, from {{ change.date | date: 'MMM d' }} (earlier weeks stay as they were) }
                  </p>
                  <p class="mt-1 text-sm"><span class="text-slate-500">Now:</span> {{ hours(change.currentHours) }} <span aria-hidden="true">→</span> <span class="font-semibold text-slate-900">{{ hours(change.hours) }}</span></p>
                  @if (change.note) { <p class="mt-1 text-sm text-slate-600">“{{ change.note }}”</p> }
                </div>
                <p class="text-xs text-slate-500">asked {{ change.submittedAt | date: 'MMM d, h:mm a' }}</p>
              </div>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <label class="sr-only" [for]="'change-note-' + change.id">Note to {{ change.studentName }}</label>
                <input [id]="'change-note-' + change.id" class="glass-input w-full rounded-xl px-3 py-2 text-sm sm:w-64" placeholder="Note (optional)" [(ngModel)]="notes[change.id]" />
                <button type="button" class="btn submit-button text-white" [disabled]="busyId() === 'change-' + change.id" (click)="answerChange(change, true)">Approve</button>
                <button type="button" class="btn btn-quiet" [disabled]="busyId() === 'change-' + change.id" (click)="answerChange(change, false)">Decline</button>
              </div>
            </li>
          }
        }
      </ul>
    </section>

    <section class="mt-8" aria-labelledby="offers-title">
      <h2 id="offers-title" class="text-lg font-semibold text-slate-900">Offers to take a task</h2>
      @if (offers().length === 0) {
        <p class="mt-2 text-sm text-slate-600">None waiting. Students offer with “I can do this” on someone else’s task.</p>
      }
      <ul class="mt-3 space-y-3">
        @for (offer of offers(); track offer.id) {
          <li class="rounded-2xl border border-white/70 bg-white/50 p-4" [attr.data-offer]="offer.id">
            <div class="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p class="font-semibold text-slate-900">{{ offer.studentName }} <span class="font-normal text-slate-600">can do</span> {{ offer.taskTitle }}</p>
                <p class="text-sm text-slate-700">{{ offer.date | date: 'EEE MMM d' }}, {{ offer.startTime }}–{{ offer.endTime }}@if (offer.currentAssignee) { · now {{ offer.currentAssignee }}’s }</p>
                <p class="mt-1 text-xs font-semibold" [class.text-teal-800]="offer.available" [class.text-amber-800]="!offer.available">
                  {{ offer.available ? 'On shift and free then' : 'Heads up: ' + (offer.availabilityNote ?? 'not free then') }}
                </p>
                @if (offer.note) { <p class="mt-1 text-sm text-slate-600">“{{ offer.note }}”</p> }
              </div>
              <p class="text-xs text-slate-500">offered {{ offer.createdAt | date: 'MMM d, h:mm a' }}</p>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" class="btn submit-button text-white" [disabled]="busyId() === 'offer-' + offer.id" (click)="answerOffer(offer, true)">Give it to {{ offer.studentName.split(' ')[0] }}</button>
              <button type="button" class="btn btn-quiet" [disabled]="busyId() === 'offer-' + offer.id" (click)="answerOffer(offer, false)">Decline</button>
            </div>
          </li>
        }
      </ul>
    </section>
  `,
})
export class TeamRequests {
  private readonly api = inject(AdminTeamApi);
  private readonly timeOffApi = inject(AdminTimeOffApi);
  private readonly toasts = inject(Toasts);

  readonly changes = input<ShiftChange[]>([]);
  readonly offers = input<Offer[]>([]);
  readonly timeOff = input<TimeOff[]>([]);
  readonly changed = output<void>();

  protected readonly window = window;
  protected notes: Record<number, string> = {};
  protected offNotes: Record<number, string> = {};
  /** Which request is being answered ("off-3", "change-5", "offer-7"). */
  protected readonly busyId = signal<string | null>(null);
  /** What approving time off did: where tasks went, and which ones nobody could take. */
  protected readonly lastOutcome = signal<{ title: string; lines: string[] } | null>(null);

  /** Time off and shift changes together, by the day they're about. */
  protected readonly byDate = computed(() => [
    ...this.timeOff().map((timeOff) => ({ key: `off-${timeOff.id}`, date: timeOff.date, timeOff, change: null })),
    ...this.changes().map((change) => ({ key: `change-${change.id}`, date: change.date, timeOff: null, change })),
  ].sort((a, b) => a.date.localeCompare(b.date)));

  protected hours(hours: Hours[]): string {
    return hours.length ? hours.map((h) => `${h.start}–${h.end}`).join(', ') : 'not working';
  }

  protected weekday(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
  }

  protected async answerTimeOff(request: TimeOff, approve: boolean): Promise<void> {
    await this.run(`off-${request.id}`, async () => {
      const first = request.studentName.split(' ')[0];
      if (!approve) {
        await this.timeOffApi.decline(request.id, this.offNotes[request.id] ?? '');
        this.toasts.success(`Declined. ${first} was emailed.`);
        return;
      }
      const saved = await this.timeOffApi.approve(request.id, this.offNotes[request.id] ?? '');
      this.lastOutcome.set({ title: `Time off approved for ${request.studentName}`, lines: saved.warnings });
      const stuck = saved.warnings.filter((w) => w.includes('couldn’t be given') || w.includes("couldn't be given")).length;
      if (stuck > 0) {
        this.toasts.error(`${stuck} task${stuck === 1 ? '' : 's'} couldn’t be reassigned and ${stuck === 1 ? 'is' : 'are'} now unassigned.`);
      } else {
        this.toasts.success(`Approved. ${first} was emailed.`);
      }
    });
  }

  protected async answerChange(change: ShiftChange, approve: boolean): Promise<void> {
    await this.run(`change-${change.id}`, async () => {
      await this.api.answerChange(change.id, approve, this.notes[change.id] ?? '');
      this.toasts.success(approve ? `Approved: ${change.studentName}’s shifts are changed.` : `Declined ${change.studentName}’s request.`);
    });
  }

  protected async answerOffer(offer: Offer, accept: boolean): Promise<void> {
    await this.run(`offer-${offer.id}`, async () => {
      await this.api.answerOffer(offer.id, accept);
      this.toasts.success(accept ? `“${offer.taskTitle}” is now ${offer.studentName}’s.` : `Declined ${offer.studentName}’s offer.`);
    });
  }

  private async run(id: string, action: () => Promise<void>): Promise<void> {
    this.busyId.set(id);
    try {
      await action();
      this.changed.emit();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }
}
