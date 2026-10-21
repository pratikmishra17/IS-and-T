import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CalendarApi, Semester } from '../../../services/calendar';
import { errorMessage } from '../../../services/errors';
import { AdminScheduleApi, PendingRequest, ShiftChange, StudentSchedule, TimeBlock, Week, dayName, totalHours } from '../../../services/schedule';
import { SidePanel } from '../../../ui/side-panel';
import { TimeBlocksEditor } from '../../../ui/time-blocks-editor';
import { Toasts } from '../../../ui/toast';

/**
 * Admin portal: Schedules (/admin/schedules). The team's week at a glance, requests waiting for
 * approval, and one student's weekly shifts and one-off changes in a side panel.
 */
@Component({
  selector: 'app-admin-schedules',
  imports: [DatePipe, FormsModule, SidePanel, TimeBlocksEditor],
  templateUrl: './schedules.html',
})
export class AdminSchedules implements OnInit {
  private readonly api = inject(AdminScheduleApi);
  private readonly calendar = inject(CalendarApi);
  private readonly toasts = inject(Toasts);

  protected readonly tab = signal<'week' | 'requests'>('week');
  protected readonly week = signal<Week | null>(null);
  protected readonly requests = signal<PendingRequest[]>([]);
  protected readonly semesters = signal<Semester[]>([]);
  protected readonly loading = signal(true);
  protected readonly today = new Date().toLocaleDateString('en-CA');

  // The student side panel
  protected readonly panelStudent = signal<{ id: number; name: string } | null>(null);
  protected readonly panelSemesterId = signal<number | null>(null);
  protected readonly panelRequestId = signal<number | null>(null);
  protected readonly panel = signal<StudentSchedule | null>(null);
  protected readonly shifts = signal<TimeBlock[]>([]);
  protected readonly warnings = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly panelError = signal<string | null>(null);
  protected change = this.emptyChange();

  protected readonly shiftHours = computed(() => Math.round(totalHours(this.shifts()) * 10) / 10);
  protected readonly dayName = dayName;

  async ngOnInit(): Promise<void> {
    try {
      const [week, requests, semesters] = await Promise.all([this.api.week(), this.api.requests(), this.calendar.semesters()]);
      this.week.set(week);
      this.requests.set(requests);
      this.semesters.set(semesters);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  // ---- Week navigation ----

  protected async moveWeek(weeks: number): Promise<void> {
    const start = this.week()?.start;
    if (weeks === 0 || !start) {
      this.week.set(await this.api.week());
      return;
    }
    const date = new Date(`${start}T12:00:00`);
    date.setDate(date.getDate() + 7 * weeks);
    this.week.set(await this.api.week(date.toLocaleDateString('en-CA')));
  }

  protected friday(): string {
    const start = this.week()?.start;
    if (!start) {
      return '';
    }
    const date = new Date(`${start}T12:00:00`);
    date.setDate(date.getDate() + 4);
    return date.toLocaleDateString('en-CA');
  }

  // ---- Student panel ----

  /** Opens a student's schedule: from the week view (no request) or to review a request. */
  protected async openStudent(id: number, name: string, semesterId?: number, requestId?: number): Promise<void> {
    const semester = semesterId ?? this.semesters().find((s) => s.current)?.id ?? this.semesters()[0]?.id;
    if (!semester) {
      this.toasts.error('Add a semester on the Calendar page first.');
      return;
    }
    this.panelStudent.set({ id, name });
    this.panelRequestId.set(requestId ?? null);
    this.warnings.set([]);
    this.panelError.set(null);
    this.change = this.emptyChange();
    await this.loadPanel(semester);
  }

  protected async loadPanel(semesterId: number): Promise<void> {
    const student = this.panelStudent();
    if (!student) {
      return;
    }
    this.panelSemesterId.set(semesterId);
    this.panel.set(null);
    try {
      const schedule = await this.api.student(student.id, semesterId);
      this.panel.set(schedule);
      // Reviewing a request with no shifts yet: start from what the student asked for.
      const reviewing = this.panelRequestId() !== null && schedule.shifts.length === 0;
      this.shifts.set(reviewing ? schedule.preferred : schedule.shifts);
    } catch (error) {
      this.panelError.set(errorMessage(error));
    }
  }

  protected closePanel(): void {
    this.panelStudent.set(null);
    this.panel.set(null);
  }

  protected usePreferred(): void {
    this.shifts.set(this.panel()?.preferred ?? []);
  }

  protected async saveShifts(): Promise<void> {
    const student = this.panelStudent();
    const semesterId = this.panelSemesterId();
    if (!student || semesterId === null) {
      return;
    }
    const approving = this.panelRequestId();
    this.saving.set(true);
    this.panelError.set(null);
    try {
      const saved = await this.api.setShifts(student.id, semesterId, this.shifts(), approving ?? undefined);
      this.panel.set(saved.result);
      this.shifts.set(saved.result.shifts);
      this.warnings.set(saved.warnings);
      this.panelRequestId.set(null);
      this.toasts.success(approving ? `${student.name}’s hours were approved and they were emailed their shifts.` : `${student.name}’s shifts were saved.`);
      await this.refresh();
    } catch (error) {
      this.panelError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async addChange(form: NgForm): Promise<void> {
    const student = this.panelStudent();
    if (!student || form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.panelError.set(null);
    try {
      const extra = this.change.type === 'EXTRA';
      const saved = await this.api.addChange(student.id, {
        date: this.change.date, type: this.change.type, reason: this.change.reason || null,
        start: extra ? this.change.start : null, end: extra ? this.change.end : null,
      });
      this.warnings.set(saved.warnings);
      this.change = this.emptyChange();
      form.resetForm(this.change);
      await this.loadPanel(this.panelSemesterId()!);
      await this.refresh();
      this.toasts.success('The change was saved.');
    } catch (error) {
      this.panelError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteChange(change: ShiftChange): Promise<void> {
    try {
      await this.api.deleteChange(change.id);
      await this.loadPanel(this.panelSemesterId()!);
      await this.refresh();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private async refresh(): Promise<void> {
    const [week, requests] = await Promise.all([this.api.week(this.week()?.start), this.api.requests()]);
    this.week.set(week);
    this.requests.set(requests);
  }

  private emptyChange(): { date: string; type: 'CANCEL' | 'EXTRA'; start: string; end: string; reason: string } {
    return { date: '', type: 'CANCEL', start: '09:00', end: '12:00', reason: '' };
  }
}
