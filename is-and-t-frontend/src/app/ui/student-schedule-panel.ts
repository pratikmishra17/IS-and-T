import { DatePipe } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CalendarApi, Semester } from '../services/calendar';
import { errorMessage } from '../services/errors';
import { AdminScheduleApi, ShiftChange, StudentSchedule, TimeBlock, WEEKDAYS, dayName, mergeShifts, totalHours } from '../services/schedule';
import { ShiftWeekEditor } from './shift-week-editor';
import { SidePanel } from './side-panel';
import { Toasts } from './toast';

/**
 * One student's schedule in a side panel: their classes and requested hours, the weekly shift
 * editor, and one-off changes. Used by the Planner (the ✎ Schedule button) and the Schedules page
 * (reviewing a request). Open it with open(...); (changed) fires after anything is saved.
 */
@Component({
  selector: 'app-student-schedule-panel',
  imports: [DatePipe, FormsModule, SidePanel, ShiftWeekEditor],
  templateUrl: './student-schedule-panel.html',
})
export class StudentSchedulePanel {
  private readonly api = inject(AdminScheduleApi);
  private readonly calendar = inject(CalendarApi);
  private readonly toasts = inject(Toasts);

  /** Something was saved: the parent page should reload what it shows. */
  readonly changed = output<void>();

  protected readonly semesters = signal<Semester[]>([]);
  protected readonly student = signal<{ id: number; name: string } | null>(null);
  protected readonly semesterId = signal<number | null>(null);
  /** Set while reviewing a student's request: saving approves it. */
  protected readonly requestId = signal<number | null>(null);
  protected readonly panel = signal<StudentSchedule | null>(null);
  protected readonly shifts = signal<TimeBlock[]>([]);
  protected readonly warnings = signal<string[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected change = this.emptyChange();

  protected readonly shiftHours = computed(() => Math.round(totalHours(this.shifts()) * 10) / 10);
  protected readonly dayName = dayName;

  /** Opens a student's schedule, for a semester (the current one by default), optionally to review a request. */
  async open(id: number, name: string, semesterId?: number, requestId?: number): Promise<void> {
    if (this.semesters().length === 0) {
      try {
        this.semesters.set(await this.calendar.semesters());
      } catch (error) {
        this.toasts.error(errorMessage(error));
        return;
      }
    }
    const semester = semesterId ?? this.semesters().find((s) => s.current)?.id ?? this.semesters()[0]?.id;
    if (!semester) {
      this.toasts.error('Add a semester on the Calendar page first.');
      return;
    }
    this.student.set({ id, name });
    this.requestId.set(requestId ?? null);
    this.warnings.set([]);
    this.error.set(null);
    this.change = this.emptyChange();
    await this.load(semester);
  }

  protected async load(semesterId: number): Promise<void> {
    const student = this.student();
    if (!student) {
      return;
    }
    this.semesterId.set(semesterId);
    this.panel.set(null);
    try {
      const schedule = await this.api.student(student.id, semesterId);
      this.panel.set(schedule);
      // Reviewing a request with no shifts yet: start from what the student asked for.
      const reviewing = this.requestId() !== null && schedule.shifts.length === 0;
      this.shifts.set(reviewing ? this.weekdays(schedule.preferred) : schedule.shifts);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected close(): void {
    this.student.set(null);
    this.panel.set(null);
  }

  /** Copies the hours the student asked for into the shift editor (weekdays only: shifts are Mon–Fri). */
  protected usePreferred(): void {
    this.shifts.set(this.weekdays(this.panel()?.preferred ?? []));
  }

  protected async saveShifts(): Promise<void> {
    const student = this.student();
    const semesterId = this.semesterId();
    if (!student || semesterId === null) {
      return;
    }
    const approving = this.requestId();
    this.saving.set(true);
    this.error.set(null);
    try {
      const saved = await this.api.setShifts(student.id, semesterId, this.shifts(), approving ?? undefined);
      this.panel.set(saved.result);
      this.shifts.set(saved.result.shifts);
      this.warnings.set(saved.warnings);
      this.requestId.set(null);
      this.toasts.success(approving ? `${student.name}’s hours were approved and they were emailed their shifts.` : `${student.name}’s shifts were saved.`);
      this.changed.emit();
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async addChange(form: NgForm): Promise<void> {
    const student = this.student();
    if (!student || form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const extra = this.change.type !== 'CANCEL'; // extra shifts and time off both have times
      const saved = await this.api.addChange(student.id, {
        date: this.change.date, type: this.change.type, reason: this.change.reason || null,
        start: extra ? this.change.start : null, end: extra ? this.change.end : null,
      });
      this.warnings.set(saved.warnings);
      this.change = this.emptyChange();
      form.resetForm(this.change);
      await this.load(this.semesterId()!);
      this.changed.emit();
      this.toasts.success('The change was saved.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteChange(change: ShiftChange): Promise<void> {
    try {
      await this.api.deleteChange(change.id);
      await this.load(this.semesterId()!);
      this.changed.emit();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private weekdays(blocks: TimeBlock[]): TimeBlock[] {
    return mergeShifts(blocks.filter((block) => WEEKDAYS.includes(block.day)));
  }

  private emptyChange(): { date: string; type: 'CANCEL' | 'EXTRA' | 'OFF'; start: string; end: string; reason: string } {
    return { date: '', type: 'CANCEL', start: '09:00', end: '12:00', reason: '' };
  }
}
