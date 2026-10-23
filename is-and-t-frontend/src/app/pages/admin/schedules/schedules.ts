import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../../services/errors';
import { AdminScheduleApi, PendingRequest } from '../../../services/schedule';
import { AdminTimeOffApi, TimeOff, window } from '../../../services/time-off';
import { StudentSchedulePanel } from '../../../ui/student-schedule-panel';
import { Toasts } from '../../../ui/toast';

/**
 * Admin portal: Schedules (/admin/schedules). What students are waiting on: hours they submitted
 * for approval, and time-off requests. Everyone's week (and editing anyone's shifts) is on the Planner.
 */
@Component({
  selector: 'app-admin-schedules',
  imports: [DatePipe, FormsModule, RouterLink, StudentSchedulePanel],
  templateUrl: './schedules.html',
})
export class AdminSchedules implements OnInit {
  private readonly api = inject(AdminScheduleApi);
  private readonly toasts = inject(Toasts);
  private readonly timeOffApi = inject(AdminTimeOffApi);
  protected readonly schedulePanel = viewChild.required(StudentSchedulePanel);

  protected readonly tab = signal<'requests' | 'timeoff'>('requests');
  protected readonly timeOff = signal<TimeOff[]>([]);
  protected readonly window = window;
  /** Notes typed per request before approving/declining. */
  protected reviewNotes: Record<number, string> = {};
  /** What happened when a request was approved: where tasks went, and which ones nobody could take. */
  protected readonly lastOutcome = signal<{ title: string; lines: string[] } | null>(null);
  protected readonly reviewingId = signal<number | null>(null);
  protected readonly requests = signal<PendingRequest[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      const [requests, timeOff] = await Promise.all([this.api.requests(), this.timeOffApi.pending()]);
      this.requests.set(requests);
      this.timeOff.set(timeOff);
      // Open on Time off when only time off is waiting
      if (requests.length === 0 && timeOff.length > 0) {
        this.tab.set('timeoff');
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected review(request: PendingRequest): void {
    void this.schedulePanel().open(request.studentId, request.studentName, request.semesterId, request.id);
  }

  // ---- Time off ----

  protected async approve(request: TimeOff): Promise<void> {
    await this.reviewTimeOff(request, async () => {
      const saved = await this.timeOffApi.approve(request.id, this.reviewNotes[request.id] ?? '');
      this.lastOutcome.set({ title: `Approved for ${request.studentName}`, lines: saved.warnings });
      const stuck = saved.warnings.filter((w) => w.includes('couldn’t be given') || w.includes("couldn't be given")).length;
      if (stuck > 0) {
        this.toasts.error(`${stuck} task${stuck === 1 ? '' : 's'} couldn’t be reassigned and ${stuck === 1 ? 'is' : 'are'} now unassigned. See the Tasks page.`);
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
      this.timeOff.set(await this.timeOffApi.pending());
      await this.refresh();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.reviewingId.set(null);
    }
  }

  protected async refresh(): Promise<void> {
    this.requests.set(await this.api.requests());
  }
}
