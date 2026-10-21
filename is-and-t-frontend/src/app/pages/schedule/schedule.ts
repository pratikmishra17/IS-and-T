import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../services/auth';
import { Semester } from '../../services/calendar';
import { errorMessage } from '../../services/errors';
import { MyWeek, PortalApi, ShiftView } from '../../services/portal';
import { MyTimeOffApi, TimeOff, window } from '../../services/time-off';
import { Confirm } from '../../ui/confirm';
import { Toasts } from '../../ui/toast';
import { MyScheduleApi, StudentSchedule, TimeBlock, WEEKDAYS, dayName, totalHours } from '../../services/schedule';
import { TimeBlocksEditor } from '../../ui/time-blocks-editor';

/**
 * User portal: My schedule (/schedule). The student enters class times and the hours they'd like
 * to work, submits them, and sees the shifts an admin approved.
 */
@Component({
  selector: 'app-schedule',
  imports: [DatePipe, FormsModule, TimeBlocksEditor],
  templateUrl: './schedule.html',
})
export class Schedule implements OnInit {
  private readonly api = inject(MyScheduleApi);
  private readonly portal = inject(PortalApi);
  private readonly timeOffApi = inject(MyTimeOffApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  protected readonly tab = signal<'week' | 'hours' | 'timeoff'>('week');

  // Time off
  protected readonly myTimeOff = signal<TimeOff[]>([]);
  protected readonly window = window;
  protected timeOffDraft: { date: string; kind: 'day' | 'shift' | 'hours'; shift: string; start: string; end: string; reason: string } = this.emptyTimeOff();
  /** That date's shifts, to pick "one shift" from. */
  protected readonly shiftsOnDate = signal<ShiftView[]>([]);
  protected readonly timeOffError = signal<string | null>(null);
  protected readonly sendingTimeOff = signal(false);

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
      this.myTimeOff.set(await this.timeOffApi.list());
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

  // ---- Time off ----

  /** When the date changes, fetch that day's shifts so "one shift" can offer them. */
  protected async timeOffDateChanged(date: string): Promise<void> {
    this.timeOffDraft.date = date;
    this.timeOffDraft.shift = '';
    this.shiftsOnDate.set([]);
    if (!date) {
      return;
    }
    try {
      const week = await this.portal.week(date);
      const shifts = week.days.find((day) => day.date === date)?.shifts ?? [];
      this.shiftsOnDate.set(shifts);
      this.timeOffDraft.shift = shifts[0] ? `${shifts[0].start}-${shifts[0].end}` : '';
    } catch (error) {
      this.timeOffError.set(errorMessage(error));
    }
  }

  protected async requestTimeOff(): Promise<void> {
    const draft = this.timeOffDraft;
    let start: string | null = null;
    let end: string | null = null;
    if (draft.kind === 'shift') {
      [start, end] = draft.shift.split('-');
    } else if (draft.kind === 'hours') {
      start = draft.start;
      end = draft.end;
    }
    if (!draft.date || (draft.kind !== 'day' && (!start || !end))) {
      this.timeOffError.set('Choose a date, and the shift or hours you need off.');
      return;
    }
    this.sendingTimeOff.set(true);
    this.timeOffError.set(null);
    try {
      await this.timeOffApi.request(draft.date, start, end, draft.reason);
      this.timeOffDraft = this.emptyTimeOff();
      this.shiftsOnDate.set([]);
      this.myTimeOff.set(await this.timeOffApi.list());
      this.toasts.success('Sent. An admin will approve or decline it, and you’ll get an email.');
    } catch (error) {
      this.timeOffError.set(errorMessage(error));
    } finally {
      this.sendingTimeOff.set(false);
    }
  }

  protected async withdrawTimeOff(request: TimeOff): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Withdraw this request?', message: 'You can ask again later.', confirmLabel: 'Withdraw' }))) {
      return;
    }
    try {
      await this.timeOffApi.withdraw(request.id);
      this.myTimeOff.set(await this.timeOffApi.list());
    } catch (error) {
      this.toasts.error(errorMessage(error));
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

  private emptyTimeOff(): { date: string; kind: 'day' | 'shift' | 'hours'; shift: string; start: string; end: string; reason: string } {
    return { date: '', kind: 'day', shift: '', start: '09:00', end: '12:00', reason: '' };
  }

  private show(schedule: StudentSchedule): void {
    this.schedule.set(schedule);
    this.classes.set(schedule.classes);
    this.preferred.set(schedule.preferred);
  }
}
