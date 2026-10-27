import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { errorMessage } from '../../../services/errors';
import { AdminScheduleApi, PendingRequest, Week, clock, minutes } from '../../../services/schedule';
import { AdminTaskApi, Backorder, STATUS_LABEL, Task, TaskStatus, taskTone } from '../../../services/tasks';
import { remembered } from '../../../services/remember';
import { AdminTimeOffApi, TimeOff } from '../../../services/time-off';
import { DayCount, MonthPicker, addDays, mondayOf } from '../../../ui/month-picker';
import { StudentSchedulePanel } from '../../../ui/student-schedule-panel';
import { TaskPanels } from '../../../ui/task-panels';
import { PickedTime, TimeDrag } from '../../../ui/time-drag';
import { Toasts } from '../../../ui/toast';
import { DayTimeline, NewTaskAt } from './day-timeline';
import { PlannerInbox } from './inbox';

type Student = Week['students'][number];
type View = 'day' | 'week' | 'list' | 'requests' | 'timeoff' | 'backorders';
const VIEWS: View[] = ['day', 'week', 'list', 'requests', 'timeoff', 'backorders'];

/**
 * Admin portal: Planner (/admin/planner). The one place for schedules and tasks:
 * - Day: one day as a timeline, each student's shifts with their tasks on top;
 * - Week: students × days, with shifts and tasks;
 * - List: the week's tasks as a filterable table;
 * - Requests (hours to approve), Time off, and Backorders.
 * The view and date are kept in the address (?view=day&date=2026-10-27), so a refresh or a link
 * opens the same place, and remembered, so coming back from another page does too. /admin/tasks and /admin/schedules lead here too.
 */
@Component({
  selector: 'app-admin-planner',
  imports: [DatePipe, FormsModule, NgTemplateOutlet, MonthPicker, StudentSchedulePanel, TaskPanels, DayTimeline, PlannerInbox, TimeDrag],
  templateUrl: './planner.html',
})
export class AdminPlanner implements OnInit {
  private readonly scheduleApi = inject(AdminScheduleApi);
  private readonly taskApi = inject(AdminTaskApi);
  private readonly timeOffApi = inject(AdminTimeOffApi);
  private readonly toasts = inject(Toasts);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly schedulePanel = viewChild.required(StudentSchedulePanel);
  protected readonly taskPanels = viewChild.required(TaskPanels);
  private readonly monthArea = viewChild<ElementRef<HTMLElement>>('monthArea');

  protected readonly tabs: { id: View; label: string }[] = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'list', label: 'List' },
    { id: 'requests', label: 'Requests' }, { id: 'timeoff', label: 'Time off' }, { id: 'backorders', label: 'Backorders' },
  ];
  protected readonly statuses: TaskStatus[] = ['UNASSIGNED', 'ASSIGNED', 'COMPLETED', 'NOT_COMPLETED', 'CANCELLED'];
  protected readonly today = new Date().toLocaleDateString('en-CA');

  /** Remembered, so coming back to the Planner opens the view (and, until the browser closes, the date) you left. */
  protected readonly view = remembered<View>('planner.view', 'week', { allowed: VIEWS });
  /** The day being looked at; the week shown is the one containing it. */
  protected readonly date = remembered('planner.date', this.today, { session: true });
  protected readonly weekStart = computed(() => mondayOf(this.date()));
  /** A day picked from the month view, highlighted on the week board. */
  protected readonly focusedDay = signal<string | null>(null);

  protected readonly week = signal<Week | null>(null);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly requests = signal<PendingRequest[]>([]);
  protected readonly timeOff = signal<TimeOff[]>([]);
  protected readonly backorders = signal<Backorder[]>([]);
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
    return this.isThisWeek() ? 'This week' : 'Week of';
  });

  /** "Tuesday, October 27, 2026" for a day; "Oct 26 – 30, 2026" (Mon–Fri) for a week. */
  protected readonly title = computed(() => {
    if (this.view() === 'day') {
      return new Date(`${this.date()}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    const start = new Date(`${this.weekStart()}T12:00:00`);
    const end = new Date(`${addDays(this.weekStart(), 4)}T12:00:00`);
    const month = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' });
    const to = start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${month(end)} ${end.getDate()}`;
    return `${month(start)} ${start.getDate()} – ${to}, ${end.getFullYear()}`;
  });

  protected readonly holiday = computed(() => this.week()?.days.find((day) => day.date === this.date())?.holiday ?? null);

  protected readonly live = computed(() => this.tasks().filter((task) => task.status !== 'CANCELLED'));
  protected readonly unassigned = computed(() => this.live().filter((task) => task.status === 'UNASSIGNED'));
  protected readonly weekendTasks = computed(() => {
    const weekdays = this.week()?.days.map((day) => day.date) ?? [];
    return this.live().filter((task) => !weekdays.includes(task.date));
  });
  protected readonly listed = computed(() => this.tasks().filter((t) => this.statusFilter() === 'all' || t.status === this.statusFilter()));

  async ngOnInit(): Promise<void> {
    // A link (?view=…&date=…) wins; otherwise the remembered view and date are used, and shown in the address.
    const params = this.route.snapshot.queryParamMap;
    const view = params.get('view') as View | null;
    if (view && VIEWS.includes(view)) {
      this.view.set(view);
    }
    const date = params.get('date');
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      this.date.set(date);
    }
    this.remember();
    await Promise.all([this.load(), this.loadInbox(), this.view() === 'backorders' ? this.loadBackorders() : Promise.resolve()]);
    this.loading.set(false);
  }

  // ---- Moving around ----

  protected async setView(view: View): Promise<void> {
    this.view.set(view);
    this.remember();
    if (view === 'backorders') {
      await this.loadBackorders();
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
    await this.goTo(addDays(this.date(), steps * (this.view() === 'day' ? 1 : 7)));
  }

  protected async goToday(): Promise<void> {
    this.focusedDay.set(null);
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

  // ---- The week board ----

  protected tasksOf(student: Student, date: string): Task[] {
    return this.live().filter((task) => task.assignee?.id === student.studentId && task.date === date);
  }

  protected unassignedOn(date: string): Task[] {
    return this.unassigned().filter((task) => task.date === date);
  }

  protected dayOf(student: Student, date: string): Student['days'][number] | undefined {
    return student.days.find((day) => day.date === date);
  }

  protected highlighted(date: string): boolean {
    return date === this.today || date === this.focusedDay();
  }

  protected label(status: TaskStatus): string {
    return STATUS_LABEL[status];
  }

  protected tone(task: Task): string {
    return taskTone(task.status);
  }

  /** The hours each day's small timeline covers: 7 AM to 7 PM, stretched to fit the week's shifts and tasks. */
  protected readonly weekRange = computed(() => {
    const times = [
      ...this.live().flatMap((task) => [minutes(task.startTime), minutes(task.endTime)]),
      ...(this.week()?.students ?? []).flatMap((s) => s.days.flatMap((d) => d.shifts.flatMap((sh) => [minutes(sh.start), minutes(sh.end)]))),
    ];
    const first = Math.min(7 * 60, ...times);
    const last = Math.max(19 * 60, ...times);
    return { start: Math.floor(first / 60) * 60, end: Math.ceil(last / 60) * 60 };
  });

  /** A few hour labels over each day's timeline (every 3 hours, not at the edges, where they'd run into the next day). */
  protected readonly weekMarks = computed(() => {
    const marks: number[] = [];
    for (let at = this.weekRange().start + 180; at < this.weekRange().end; at += 180) {
      marks.push(at);
    }
    return marks;
  });

  /** Where a time sits across a day's small timeline, as a percentage. */
  protected weekX(time: string | number): number {
    const at = typeof time === 'string' ? minutes(time) : time;
    const { start, end } = this.weekRange();
    return ((at - start) / (end - start)) * 100;
  }

  /** 13 * 60 → "1p" */
  protected shortHour(at: number): string {
    const hour = at / 60;
    return `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
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
  protected pickedOn(date: string, time: PickedTime, student?: Student): void {
    void this.taskPanels().openNew({
      date, startTime: clock(time.start), minutes: time.end - time.start,
      student: student ? { id: student.studentId, name: student.name } : undefined, unassigned: !student,
    });
  }

  /** The day view: a time dragged (or clicked) in a student's row or the unassigned row. */
  protected addTaskAt(at: NewTaskAt): void {
    void this.taskPanels().openNew({
      date: this.date(), startTime: at.startTime, minutes: at.minutes,
      student: at.student ? { id: at.student.studentId, name: at.student.name } : undefined, unassigned: at.unassigned,
    });
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
    await this.load(true);
    if (this.view() === 'backorders') {
      await this.loadBackorders();
    }
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
    await Promise.all([this.load(true), this.loadInbox()]);
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

  private async loadInbox(): Promise<void> {
    try {
      const [requests, timeOff] = await Promise.all([this.scheduleApi.requests(), this.timeOffApi.pending()]);
      this.requests.set(requests);
      this.timeOff.set(timeOff);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private async loadBackorders(): Promise<void> {
    try {
      this.backorders.set(await this.taskApi.backorders());
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
