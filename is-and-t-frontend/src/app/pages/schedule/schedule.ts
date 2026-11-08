import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../services/auth';
import { Semester } from '../../services/calendar';
import { errorMessage } from '../../services/errors';
import { MyWeek, PortalApi } from '../../services/portal';
import { ChangeRequestPanel } from '../../ui/change-request';
import { MyRequests } from '../../ui/my-requests';
import { Confirm } from '../../ui/confirm';
import { Toasts } from '../../ui/toast';
import { MyScheduleApi, StudentSchedule, TimeBlock, WEEKDAYS, dayName, totalHours } from '../../services/schedule';
import { TimeBlocksEditor } from '../../ui/time-blocks-editor';
import { remembered } from '../../services/remember';

/**
 * User portal: My schedule (/schedule). The student sees their week, enters class times and the
 * hours they'd like to work (and submits them), and under My requests asks for a change (time off
 * or different hours) and follows the answers.
 */
@Component({
  selector: 'app-schedule',
  imports: [DatePipe, FormsModule, TimeBlocksEditor, ChangeRequestPanel, MyRequests],
  templateUrl: './schedule.html',
})
export class Schedule implements OnInit {
  private readonly api = inject(MyScheduleApi);
  private readonly portal = inject(PortalApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  protected readonly tab = remembered<'week' | 'hours' | 'timeoff'>('schedule.tab', 'week', { allowed: ['week', 'hours', 'timeoff'] });

  // My requests: the shared "Ask for a change" form and the list of what was asked
  protected readonly changePanel = viewChild.required(ChangeRequestPanel);
  protected readonly myRequests = viewChild<MyRequests>('myRequests');

  // Calendar subscription
  protected readonly calendarLink = signal<{ url: string; webcalUrl: string } | null>(null);
  protected readonly week = signal<MyWeek | null>(null);
  protected readonly semesterHours = signal<{ weekStart: string; hours: number }[]>([]);
  protected readonly today = new Date().toLocaleDateString('en-CA');
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
    try {
      this.week.set(await this.portal.week());
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
    const [schedule, hours] = await Promise.all([this.api.get(semesterId), this.portal.semesterHours(semesterId)]);
    this.show(schedule);
    this.semesterHours.set(hours);
  }

  protected async moveWeek(weeks: number): Promise<void> {
    const start = this.week()?.start;
    if (weeks === 0 || !start) {
      this.week.set(await this.portal.week());
      return;
    }
    const date = new Date(`${start}T12:00:00`);
    date.setDate(date.getDate() + 7 * weeks);
    this.week.set(await this.portal.week(date.toLocaleDateString('en-CA')));
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
      this.semesterHours.set(await this.portal.semesterHours(semesterId));
      this.message.set(submit ? 'Submitted. An admin will review your hours, and you’ll get an email when they’re approved.' : 'Saved.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Calendar subscription ----

  protected async showCalendarLink(): Promise<void> {
    try {
      this.calendarLink.set(await this.portal.calendarLink());
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  protected async copyCalendarLink(): Promise<void> {
    const link = this.calendarLink();
    if (link) {
      await navigator.clipboard.writeText(link.url);
      this.toasts.success('Link copied.');
    }
  }

  protected async newCalendarLink(): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Make a new link?',
      message: 'The current link stops working, so calendars subscribed to it stop updating. Use this if you shared the link by mistake.',
      confirmLabel: 'Make a new link',
    });
    if (ok) {
      this.calendarLink.set(await this.portal.regenerateCalendarLink());
      this.toasts.success('New link ready. Subscribe to it again in your calendar app.');
    }
  }

  private show(schedule: StudentSchedule): void {
    this.schedule.set(schedule);
    this.classes.set(schedule.classes);
    this.preferred.set(schedule.preferred);
  }

  /** Monday–Friday, plus Saturday or Sunday only when something is on them (an extra shift, a task). */
  protected shownDays(week: MyWeek): MyWeek['days'] {
    return week.days.filter((day) => {
      const weekday = new Date(`${day.date}T12:00:00`).getDay();
      return (weekday !== 0 && weekday !== 6) || day.shifts.length > 0 || day.tasks.length > 0 || day.timeOff.length > 0;
    });
  }
}
