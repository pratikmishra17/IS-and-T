import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth, User } from '../../../services/auth';
import { AccountKind, Accounts } from '../../../services/accounts';
import { CalendarApi, Holiday, Semester } from '../../../services/calendar';
import { InventoryApi, Item } from '../../../services/inventory';
import { AdminScheduleApi, Week } from '../../../services/schedule';
import { AdminTaskApi, Task } from '../../../services/tasks';
import { AdminTimeOffApi } from '../../../services/time-off';
import { AdminTeamApi } from '../../../services/team';
import { addDays, mondayOf } from '../../../ui/month-picker';
import { errorMessage } from '../../../services/errors';
import { Toasts } from '../../../ui/toast';

/**
 * Admin portal home (/admin): today at a glance: everything waiting for an answer, who's on shift,
 * the day's tasks, low stock and accounts. On a weekend with nothing on, the shift and task cards
 * show the coming Monday instead (and say so).
 */
@Component({
  selector: 'app-admin-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.html',
})
export class AdminDashboard implements OnInit {
  private readonly api = inject(Accounts);
  private readonly calendar = inject(CalendarApi);
  private readonly inventory = inject(InventoryApi);
  private readonly schedule = inject(AdminScheduleApi);
  private readonly taskApi = inject(AdminTaskApi);
  private readonly timeOffApi = inject(AdminTimeOffApi);
  private readonly teamApi = inject(AdminTeamApi);
  /** Everything waiting for an answer, each with the Planner tab it's on. */
  protected readonly waitingFor = signal<{ count: number; one: string; many: string; view: string }[]>([]);
  private readonly toasts = inject(Toasts);
  protected readonly auth = inject(Auth);
  protected readonly today = new Date();

  protected readonly students = signal<User[]>([]);
  protected readonly admins = signal<User[]>([]);
  protected readonly semesters = signal<Semester[]>([]);
  protected readonly holidays = signal<Holiday[]>([]);
  protected readonly items = signal<Item[]>([]);
  protected readonly week = signal<Week | null>(null);
  protected readonly todaysTasks = signal<Task[]>([]);
  /** The day the shift and task cards show: today, or the coming Monday on a quiet weekend. */
  protected readonly shownDay = signal(new Date().toLocaleDateString('en-CA'));
  protected readonly showingMonday = computed(() => this.shownDay() !== this.today.toLocaleDateString('en-CA'));
  /** Today's open tasks, unassigned first: those need attention. */
  protected readonly openToday = computed(() => this.todaysTasks()
    .filter((task) => task.status === 'UNASSIGNED' || task.status === 'ASSIGNED')
    .sort((a, b) => (a.status === b.status ? a.startTime.localeCompare(b.startTime) : a.status === 'UNASSIGNED' ? -1 : 1)));
  protected readonly unassignedToday = computed(() => this.todaysTasks().filter((task) => task.status === 'UNASSIGNED').length);
  /** Students with at least one shift on the shown day, earliest start first. */
  protected readonly onShiftToday = computed(() => {
    const today = this.shownDay();
    return (this.week()?.students ?? [])
      .map((student) => ({ name: student.name, shifts: student.days.find((day) => day.date === today)?.shifts ?? [] }))
      .filter((student) => student.shifts.length > 0)
      .sort((a, b) => a.shifts[0].start.localeCompare(b.shifts[0].start));
  });
  /** Items at or below their threshold, emptiest first. */
  protected readonly lowStock = computed(() => this.items()
    .filter((item) => item.lowStock && !item.archived)
    .sort((a, b) => a.onHand - b.onHand));
  protected readonly loading = signal(true);
  protected readonly sendingTo = signal<string | null>(null);

  protected readonly currentSemester = computed(() => this.semesters().find((semester) => semester.current) ?? null);
  /** The first holiday from today on ("2026-10-21" strings compare correctly as text). */
  protected readonly nextHoliday = computed(() => {
    const today = this.today.toLocaleDateString('en-CA');
    return this.holidays().find((holiday) => holiday.date >= today) ?? null;
  });

  protected readonly activeStudents = computed(() => this.students().filter((s) => s.status === 'ACTIVE').length);
  protected readonly disabledCount = computed(() => [...this.students(), ...this.admins()].filter((a) => a.status === 'DISABLED').length);
  /** People who were added but haven't opened their email link yet. */
  protected readonly waiting = computed(() =>
    [...this.students(), ...this.admins()].filter((a) => a.status === 'ACTIVE' && !a.passwordSet));

  async ngOnInit(): Promise<void> {
    try {
      const todayIso = this.today.toLocaleDateString('en-CA');
      const [students, admins, semesters, holidays, items, week, tasks, timeOff, changes, offers, hours, missing] = await Promise.all([
        this.api.list('students'), this.api.list('admins'), this.calendar.semesters(), this.calendar.holidays(),
        this.inventory.items(), this.schedule.week(), this.taskApi.list(todayIso, todayIso), this.timeOffApi.count(),
        this.teamApi.changes(), this.teamApi.offers(), this.schedule.requests(), this.taskApi.backorders(),
      ]);
      this.waitingFor.set([
        { count: timeOff.pending, one: 'time-off request', many: 'time-off requests', view: 'requests' },
        { count: changes.length, one: 'shift change', many: 'shift changes', view: 'requests' },
        { count: offers.length, one: 'offer to take a task', many: 'offers to take a task', view: 'requests' },
        { count: hours.length, one: 'semester hours request', many: 'semester hours requests', view: 'requests' },
        { count: missing.length, one: 'missing item for a task', many: 'missing items for tasks', view: 'backorders' },
      ].filter((line) => line.count > 0));
      this.items.set(items);
      this.students.set(students);
      this.admins.set(admins);
      this.semesters.set(semesters);
      this.holidays.set(holidays);
      const quietWeekend = [0, 6].includes(this.today.getDay()) && tasks.every((task) => task.status === 'CANCELLED')
        && !week.students.some((s) => s.days.some((d) => d.date === todayIso && d.shifts.length > 0));
      if (quietWeekend) {
        // Nothing on this weekend: show what Monday looks like instead.
        const monday = addDays(mondayOf(todayIso), 7);
        const [nextWeek, mondayTasks] = await Promise.all([this.schedule.week(monday), this.taskApi.list(monday, monday)]);
        this.shownDay.set(monday);
        this.week.set(nextWeek);
        this.todaysTasks.set(mondayTasks);
      } else {
        this.week.set(week);
        this.todaysTasks.set(tasks);
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async resend(account: User): Promise<void> {
    const kind: AccountKind = account.role === 'ADMIN' ? 'admins' : 'students';
    this.sendingTo.set(`${kind}-${account.id}`);
    try {
      await this.api.sendPasswordLink(kind, account.id);
      this.toasts.success(`A new set-password link was emailed to ${account.email}.`);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.sendingTo.set(null);
    }
  }
}
