import { DatePipe } from '@angular/common';
import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../../services/errors';
import { PendingRequest } from '../../../services/schedule';
import { AdminTimeOffApi, TimeOff, window } from '../../../services/time-off';
import { Toasts } from '../../../ui/toast';

/**
 * The Planner's "waiting for you" views: hours students submitted for approval (requests), and
 * time-off requests to approve or decline. The Planner loads both lists (it shows their counts on
 * the tabs) and reloads them when (changed) fires.
 */
@Component({
  selector: 'app-planner-inbox',
  imports: [DatePipe, FormsModule],
  templateUrl: './inbox.html',
})
export class PlannerInbox {
  private readonly timeOffApi = inject(AdminTimeOffApi);
  private readonly toasts = inject(Toasts);

  readonly mode = input.required<'requests' | 'timeoff'>();
  readonly requests = input<PendingRequest[]>([]);
  readonly timeOff = input<TimeOff[]>([]);
  /** Open a request in the schedule panel to approve it. */
  readonly review = output<PendingRequest>();
  /** Something was approved or declined. */
  readonly changed = output<void>();

  protected readonly window = window;
  /** Notes typed per request before approving/declining. */
  protected reviewNotes: Record<number, string> = {};
  /** What happened when a request was approved: where tasks went, and which ones nobody could take. */
  protected readonly lastOutcome = signal<{ title: string; lines: string[] } | null>(null);
  protected readonly reviewingId = signal<number | null>(null);

  protected async approve(request: TimeOff): Promise<void> {
    await this.reviewTimeOff(request, async () => {
      const saved = await this.timeOffApi.approve(request.id, this.reviewNotes[request.id] ?? '');
      this.lastOutcome.set({ title: `Approved for ${request.studentName}`, lines: saved.warnings });
      const stuck = saved.warnings.filter((w) => w.includes('couldn’t be given') || w.includes("couldn't be given")).length;
      if (stuck > 0) {
        this.toasts.error(`${stuck} task${stuck === 1 ? '' : 's'} couldn’t be reassigned and ${stuck === 1 ? 'is' : 'are'} now unassigned.`);
      } else {
        this.toasts.success(`Approved. ${request.studentName.split(' ')[0]} was emailed.`);
      }
    });
  }

  protected async decline(request: TimeOff): Promise<void> {
    await this.reviewTimeOff(request, async () => {
      await this.timeOffApi.decline(request.id, this.reviewNotes[request.id] ?? '');
      this.toasts.success(`Declined. ${request.studentName.split(' ')[0]} was emailed.`);
    });
  }

  private async reviewTimeOff(request: TimeOff, action: () => Promise<void>): Promise<void> {
    this.reviewingId.set(request.id);
    try {
      await action();
      this.changed.emit();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.reviewingId.set(null);
    }
  }
}
