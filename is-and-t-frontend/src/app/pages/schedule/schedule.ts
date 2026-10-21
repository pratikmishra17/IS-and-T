import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Semester } from '../../services/calendar';
import { errorMessage } from '../../services/errors';
import { MyScheduleApi, StudentSchedule, TimeBlock, WEEKDAYS, dayName, totalHours } from '../../services/schedule';
import { TimeBlocksEditor } from '../../ui/time-blocks-editor';

/**
 * User portal: My schedule (/schedule). The student enters class times and the hours they'd like
 * to work, submits them, and sees the shifts an admin approved.
 */
@Component({
  selector: 'app-schedule',
  imports: [DatePipe, FormsModule, RouterLink, TimeBlocksEditor],
  templateUrl: './schedule.html',
})
export class Schedule implements OnInit {
  private readonly api = inject(MyScheduleApi);
  protected readonly auth = inject(Auth);

  protected readonly semesters = signal<Semester[]>([]);
  protected readonly semesterId = signal<number | null>(null);
  protected readonly schedule = signal<StudentSchedule | null>(null);
  protected readonly classes = signal<TimeBlock[]>([]);
  protected readonly preferred = signal<TimeBlock[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Approved shifts grouped by weekday, for the "Your shifts" list. */
  protected readonly shiftsByDay = computed(() => WEEKDAYS
    .map((day) => ({ day: dayName(day), blocks: (this.schedule()?.shifts ?? []).filter((block) => block.day === day) }))
    .filter((group) => group.blocks.length > 0));
  protected readonly preferredHours = computed(() => Math.round(totalHours(this.preferred()) * 10) / 10);

  async ngOnInit(): Promise<void> {
    if (this.auth.isAdmin()) {
      this.loading.set(false);
      return; // admins plan everyone's shifts in the admin portal instead
    }
    try {
      const semesters = await this.api.semesters();
      this.semesters.set(semesters);
      const first = semesters.find((semester) => semester.current) ?? semesters[0];
      if (first) {
        await this.load(first.id);
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async load(semesterId: number): Promise<void> {
    this.semesterId.set(semesterId);
    this.message.set(null);
    this.error.set(null);
    this.show(await this.api.get(semesterId));
  }

  protected async save(submit: boolean): Promise<void> {
    const semesterId = this.semesterId();
    if (semesterId === null) {
      return;
    }
    this.busy.set(true);
    this.message.set(null);
    this.error.set(null);
    try {
      let schedule = await this.api.saveAvailability(semesterId, this.classes(), this.preferred());
      if (submit) {
        schedule = await this.api.submit(semesterId);
      }
      this.show(schedule);
      this.message.set(submit ? 'Submitted. An admin will review your hours, and you’ll get an email when they’re approved.' : 'Saved.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private show(schedule: StudentSchedule): void {
    this.schedule.set(schedule);
    this.classes.set(schedule.classes);
    this.preferred.set(schedule.preferred);
  }
}
