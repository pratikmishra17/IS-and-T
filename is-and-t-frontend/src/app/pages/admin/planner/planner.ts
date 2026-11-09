import { DatePipe } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { errorMessage } from '../../../services/errors';
import { AdminScheduleApi, PendingRequest, Week } from '../../../services/schedule';
import { AdminTaskApi, Backorder, STATUS_LABEL, Task, TaskStatus } from '../../../services/tasks';
import { remembered } from '../../../services/remember';
import { AdminTeamApi, Offer, ShiftChange } from '../../../services/team';
import { AdminTimeOffApi, TimeOff } from '../../../services/time-off';
import { DayCount, MonthPicker, addDays, mondayOf } from '../../../ui/month-picker';
import { StudentSchedulePanel } from '../../../ui/student-schedule-panel';
import { TaskPanels } from '../../../ui/task-panels';
import { DayTimeline, NewTaskAt } from '../../../ui/planner/day-timeline';
import { NewTaskOn, WeekBoard, busyWeekendDays, isWeekend } from '../../../ui/planner/week-board';
import { Toasts } from '../../../ui/toast';
import { PlannerInbox } from './inbox';
import { TeamRequests } from './team-requests';

type Student = Week['students'][number];
type View = 'day' | 'week' | 'list' | 'requests' | 'backorders';
const VIEWS: View[] = ['day', 'week', 'list', 'requests', 'backorders'];

/**
 * Admin portal: "Shifts & tasks" (/admin/planner, called the Planner in the code). The one place
 * for schedules and tasks:
 * - Day: one day as a timeline, each student's shifts with their tasks on top;
 * - Week: students × days, with shifts and tasks;
 * - Task list: the week's tasks as a filterable table;
 * - Student requests (time off and shift changes, offers to take a task, and semester hours to
 *   approve), and Missing items (out of stock for a task).
 * The last three tabs show how many are left: today's unfinished tasks, and what's waiting.
 * The view and date are kept in the address (?view=day&date=2026-10-27), so a refresh or a link
 * opens the same place, and remembered, so coming back from another page does too. /admin/tasks and /admin/schedules lead here too.
 * On a weekend it opens on the coming week (with a note saying so), and on a phone on the Day view.
 */
@Component({
  selector: 'app-admin-planner',
  imports: [DatePipe, FormsModule, MonthPicker, StudentSchedulePanel, TaskPanels, DayTimeline, WeekBoard, PlannerInbox, TeamRequests],
  templateUrl: './planner.html',
})
export class AdminPlanner implements OnInit {
  private readonly scheduleApi = inject(AdminScheduleApi);
  private readonly taskApi = inject(AdminTaskApi);
  private readonly timeOffApi = inject(AdminTimeOffApi);
  private readonly teamApi = inject(AdminTeamApi);
  private readonly toasts = inject(Toasts);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly schedulePanel = viewChild.required(StudentSchedulePanel);
  protected readonly taskPanels = viewChild.required(TaskPanels);
  private readonly monthArea = viewChild<ElementRef<HTMLElement>>('monthArea');

  protected readonly tabs: { id: View; label: string }[] = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'list', label: 'Task list' },
    { id: 'requests', label: 'Student requests' }, { id: 'backorders', label: 'Missing items' },
  ];
  protected readonly statuses: TaskStatus[] = ['UNASSIGNED', 'ASSIGNED', 'COMPLETED', 'NOT_COMPLETED', 'CANCELLED'];
  protected readonly today = new Date().toLocaleDateString('en-CA');

  /** Remembered, so coming back to the Planner opens the view (and, until the browser closes, the date) you left. */
  protected readonly view = remembered<View>('planner.view', 'week', { allowed: VIEWS });
  /** The day being looked at; the week shown is the one containing it. */
  protected readonly date = remembered('planner.date', this.today, { session: true });
  protected readonly weekStart = computed(() => mondayOf(this.date()));
  /** Saturday and Sunday columns even when nothing is on them (to add a weekend shift or task). */
  protected readonly showWeekend = remembered('planner.weekend', false);
  /** Opened on the coming week because today is a weekend: a note says so. */
  protected readonly skippedWeekend = signal(false);
  /** A day picked from the month view, highlighted on the week board. */
  protected readonly focusedDay = signal<string | null>(null);

  protected readonly week = signal<Week | null>(null);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly requests = signal<PendingRequest[]>([]);
  protected readonly timeOff = signal<TimeOff[]>([]);
  protected readonly backorders = signal<Backorder[]>([]);
  protected readonly changes = signal<ShiftChange[]>([]);
  protected readonly offers = signal<Offer[]>([]);
  /** Today's tasks, whatever week is on screen: for the number on the Task list tab. */
  private readonly todaysTasks = signal<Task[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusFilter = remembered<TaskStatus | 'all'>('planner.status', 'all');
  protected readonly monthOpen = signal(false);
  protected readonly monthCounts = signal<Record<string, DayCount>>({});
  /** The task just created or changed: outlined for a few seconds, so you see where it went. */
  protected readonly highlight = signal<number | null>(null);
  private highlightTimer?: ReturnType<typeof setTimeout>;
  /** The week whose data is loaded, so moving within a week doesn't reload it. */
  private loadedWeek: string | null = null;

  // ---- What's shown ----

  /** Views with a date (and arrows, Today, Month). */
  protected readonly dated = computed(() => ['day', 'week', 'list'].includes(this.view()));
  protected readonly isThisWeek = computed(() => this.weekStart() === mondayOf(this.today));
  protected readonly showingToday = computed(() =>
    this.view() === 'day' ? this.date() === this.today : this.isThisWeek() && !this.focusedDay());

  protected readonly eyebrow = computed(() => {
    if (this.view() === 'day') {
      return this.date() === this.today ? 'Today' : this.date() === addDays(this.today, 1) ? 'Tomorrow' : 'Day';
    }
    if (this.isThisWeek()) {
      return 'This week';
    }
    return this.weekStart() === addDays(mondayOf(this.today), 7) ? 'Next week' : 'Week of';
  });

  /** How many days the week board shows: Monday–Friday, plus weekend days that are on. */
  private readonly lastShownDay = computed(() => {
    const week = this.week();
    if (this.showWeekend()) {
      return 6;
    }
    const busy = week ? busyWeekendDays(week, this.tasks()) : new Set<string>();
    return busy.has(addDays(this.weekStart(), 6)) ? 6 : busy.has(addDays(this.weekStart(), 5)) ? 5 : 4;
  });

  /** "Tuesday, October 27, 2026" for a day; "Oct 26 – 30, 2026" (Mon–Fri, or to Sunday with the weekend) for a week. */
  protected readonly title = computed(() => {
    if (this.view() === 'day') {
      return new Date(`${this.date()}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    const start = new Date(`${this.weekStart()}T12:00:00`);
    const end = new Date(`${addDays(this.weekStart(), this.lastShownDay())}T12:00:00`);
    const month = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' });
    const to = start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${month(end)} ${end.getDate()}`;
    return `${month(start)} ${start.getDate()} – ${to}, ${end.getFullYear()}`;
  });

  protected readonly holiday = computed(() => this.week()?.days.find((day) => day.date === this.date())?.holiday ?? null);

  /** The number on each tab that has one, and what it means (read out by screen readers, shown on hover). */
  protected readonly counts = computed<Partial<Record<View, { count: number; label: string; alert: boolean }>>>(() => {
    const leftToday = this.todaysTasks().filter((t) => t.date === this.today && (t.status === 'UNASSIGNED' || t.status === 'ASSIGNED')).length;
    const waiting = (count: number, what: string) => ({ count, label: `${count} ${what} waiting for you`, alert: count > 0 });
    return {
      list: { count: leftToday, label: `${leftToday} ${leftToday === 1 ? 'task' : 'tasks'} left to do today`, alert: false },
      requests: waiting(this.studentRequests(), this.studentRequests() === 1 ? 'student request' : 'student requests'),
      backorders: { count: this.backorders().length, label: `${this.backorders().length} missing ${this.backorders().length === 1 ? 'item' : 'items'} for tasks`, alert: this.backorders().length > 0 },
    };
  });
  /** Time off, shift changes, offers and semester hours, all waiting for an answer. */
  protected readonly studentRequests = computed(() =>
    this.timeOff().length + this.requests().length + this.changes().length + this.offers().length);
  protected readonly listed = computed(() => this.tasks().filter((t) => this.statusFilter() === 'all' || t.status === this.statusFilter()));

  /** The colours of a task's status badge. */
  protected statusTone(task: Task): string {
    return task.status === 'UNASSIGNED' ? 'bg-amber-100 text-amber-900' : task.status === 'COMPLETED' ? 'bg-teal-100 text-teal-900' : 'bg-slate-200 text-slate-700';
  }

  async ngOnInit(): Promise<void> {
    // A link (?view=…&date=…) wins; otherwise the remembered view and date are used, and shown in the address.
    const params = this.route.snapshot.queryParamMap;
    // Old links to the time-off tab open Student requests, where time off is now.
    const view = (params.get('view') === 'timeoff' ? 'requests' : params.get('view')) as View | null;
    if (view && VIEWS.includes(view)) {
      this.view.set(view);
    }
    const date = params.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      this.date.set(date);
    } else if (this.date() === this.today && isWeekend(this.today)) {
      // The weekend: the coming week is what needs planning.
      this.date.set(addDays(mondayOf(this.today), 7));
      this.skippedWeekend.set(true);
    }
    if (!view && this.view() === 'week' && window.matchMedia?.('(max-width: 639px)').matches) {
      this.view.set('day'); // a phone: the week board only fits one day at a time anyway
    }
    this.remember();
    await Promise.all([this.load(), this.loadCounts()]);
    this.loading.set(false);
  }

  // ---- Moving around ----

  protected async setView(view: View): Promise<void> {
    this.view.set(view);
    this.remember();
    if (view === 'backorders') {
      await this.loadCounts(); // the freshest stock numbers
    }
  }

  /** The week board's day headings open that day. */
  protected async openDay(date: string): Promise<void> {
    this.view.set('day');
    await this.goTo(date);
  }

  /** ← / →: a day at a time in the day view, a week at a time otherwise. */
  protected async move(steps: number): Promise<void> {
    this.focusedDay.set(null);
    this.skippedWeekend.set(false);
    await this.goTo(addDays(this.date(), steps * (this.view() === 'day' ? 1 : 7)));
  }

  protected async goToday(): Promise<void> {
    this.focusedDay.set(null);
    this.skippedWeekend.set(false);
    await this.goTo(this.today);
  }

  protected async pickFromMonth(pick: { date: string; whole: 'day' | 'week' }): Promise<void> {
    this.monthOpen.set(false);
    this.focusedDay.set(pick.whole === 'day' ? pick.date : null);
    this.view.set(pick.whole === 'day' ? 'day' : this.view() === 'list' ? 'list' : 'week');
    await this.goTo(pick.date);
  }

  /** The month view shows a month: count its tasks per day. */
  protected async loadMonth(first: string): Promise<void> {
    if (!this.monthOpen()) {
      return;
    }
    try {
      const from = mondayOf(first);
      const tasks = await this.taskApi.list(from, addDays(from, 41));
      const counts: Record<string, DayCount> = {};
      for (const task of tasks.filter((t) => t.status !== 'CANCELLED')) {
        const count = (counts[task.date] ??= { tasks: 0, unassigned: 0 });
        count.tasks++;
        if (task.status === 'UNASSIGNED') {
          count.unassigned++;
        }
      }
      this.monthCounts.set(counts);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  @HostListener('document:click', ['$event'])
  protected closeMonthOutside(event: Event): void {
    if (this.monthOpen() && !this.monthArea()?.nativeElement.contains(event.target as Node)) {
      this.monthOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected closeMonthOnEscape(): void {
    this.monthOpen.set(false);
  }

  protected label(status: TaskStatus): string {
    return STATUS_LABEL[status];
  }

  // ---- Actions ----

  protected editSchedule(student: Student): void {
    void this.schedulePanel().open(student.studentId, student.name);
  }

  protected reviewRequest(request: PendingRequest): void {
    void this.schedulePanel().open(request.studentId, request.studentName, request.semesterId, request.id);
  }

  /** "+ New task": on the day being looked at (or today, this week). */
  protected newTask(): void {
    const date = this.view() === 'day' ? this.date() : this.focusedDay() ?? (this.isThisWeek() ? this.today : this.weekStart());
    void this.taskPanels().openNew({ date });
  }

  /** A time dragged (or clicked) on a day's small timeline on the week board: a task for that student, or nobody yet. */
  protected addTaskOn(at: NewTaskOn): void {
    void this.taskPanels().openNew({
      date: at.date, startTime: at.startTime, minutes: at.minutes,
      student: at.student ? { id: at.student.studentId, name: at.student.name } : undefined, unassigned: at.unassigned,
    });
  }

  /** The day view: a time dragged (or clicked) in a student's row or the unassigned row. */
  protected addTaskAt(at: NewTaskAt): void {
    void this.taskPanels().openNew({
      date: this.date(), startTime: at.startTime, minutes: at.minutes,
      student: at.student ? { id: at.student.studentId, name: at.student.name } : undefined, unassigned: at.unassigned,
    });
  }

  /**
   * A task dragged onto someone's row (or the Unassigned row, student = null): give it to them.
   * Anyone can be given a task; if they aren't on shift then, or are busy, it's still done and a
   * warning says so.
   */
  protected async moveTask(task: Task, student: { studentId: number; name: string } | null): Promise<void> {
    try {
      const saved = await this.taskApi.assign(task.id, student?.studentId ?? null);
      this.toasts.success(student ? `“${task.title}” is now ${student.name}’s.` : `“${task.title}” is unassigned now.`);
      saved.warnings.forEach((warning) => this.toasts.warning(warning));
      await this.refresh(saved.result);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  protected openTask(task: Task): void {
    void this.taskPanels().open(task);
  }

  /** After a task panel saved something: show that task's day or week, refreshed, with the task outlined. */
  protected async refresh(task?: Task): Promise<void> {
    if (task && mondayOf(task.date) !== this.weekStart()) {
      this.focusedDay.set(task.date);
      this.date.set(task.date);
      this.remember();
    } else if (task && this.view() === 'day' && task.date !== this.date()) {
      this.date.set(task.date);
      this.remember();
    }
    // A saved task can change today's count and what's missing, so the tab numbers reload too.
    await Promise.all([this.load(true), this.loadCounts()]);
    if (task) {
      this.highlight.set(task.id);
      clearTimeout(this.highlightTimer);
      this.highlightTimer = setTimeout(() => this.highlight.set(null), 6000);
      // After the board has redrawn, bring the task into view.
      setTimeout(() => document.querySelector(`[data-task="${task.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }));
    }
  }

  /** After a schedule or a request changed: everything may have moved. */
  protected async refreshAll(): Promise<void> {
    await Promise.all([this.load(true), this.loadCounts()]);
  }

  // ---- Loading ----

  private async goTo(date: string): Promise<void> {
    this.date.set(date);
    this.remember();
    await this.load();
  }

  /** The week's shifts and tasks (skipped if that week is already loaded, unless forced). */
  private async load(force = false): Promise<void> {
    const week = this.weekStart();
    if (!force && this.loadedWeek === week) {
      return;
    }
    try {
      const [schedule, tasks] = await Promise.all([this.scheduleApi.week(week), this.taskApi.list(week, addDays(week, 6))]);
      if (week === this.weekStart()) {
        this.week.set(schedule);
        this.tasks.set(tasks);
        this.loadedWeek = week;
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  /** What the tab numbers count: requests and time off to answer, missing items, and today's tasks. */
  private async loadCounts(): Promise<void> {
    try {
      const [requests, timeOff, backorders, today, changes, offers] = await Promise.all([
        this.scheduleApi.requests(), this.timeOffApi.pending(), this.taskApi.backorders(), this.taskApi.list(this.today, this.today),
        this.teamApi.changes(), this.teamApi.offers(),
      ]);
      this.changes.set(changes);
      this.offers.set(offers);
      this.requests.set(requests);
      this.timeOff.set(timeOff);
      this.backorders.set(backorders);
      this.todaysTasks.set(today);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  /** Keeps the view and date in the address bar, without adding to the browser's history. */
  private remember(): void {
    void this.router.navigate([], {
      relativeTo: this.route, replaceUrl: true,
      queryParams: { view: this.view() === 'week' ? null : this.view(), date: this.date() === this.today ? null : this.date() },
    });
  }
}
