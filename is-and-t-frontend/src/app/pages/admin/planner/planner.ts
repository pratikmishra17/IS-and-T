import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { errorMessage } from '../../../services/errors';
import { AdminScheduleApi, Week } from '../../../services/schedule';
import { AdminTaskApi, STATUS_LABEL, Task, TaskStatus } from '../../../services/tasks';
import { DayCount, MonthPicker, addDays, mondayOf } from '../../../ui/month-picker';
import { StudentSchedulePanel } from '../../../ui/student-schedule-panel';
import { TaskPanels } from '../../../ui/task-panels';
import { Toasts } from '../../../ui/toast';

type Student = Week['students'][number];

/**
 * Admin portal: Planner (/admin/planner). One week, everyone at once: a row per student with their
 * shifts and tasks each day, and a row of tasks nobody has yet. From here you can change anyone's
 * weekly shifts (✎ Schedule), add a task for a student on a day (+), and open any task to edit or
 * reassign it. The month view (📅) jumps to any day or week.
 */
@Component({
  selector: 'app-admin-planner',
  imports: [DatePipe, NgTemplateOutlet, MonthPicker, StudentSchedulePanel, TaskPanels],
  templateUrl: './planner.html',
})
export class AdminPlanner implements OnInit {
  private readonly scheduleApi = inject(AdminScheduleApi);
  private readonly taskApi = inject(AdminTaskApi);
  private readonly toasts = inject(Toasts);
  protected readonly schedulePanel = viewChild.required(StudentSchedulePanel);
  protected readonly taskPanels = viewChild.required(TaskPanels);
  private readonly monthArea = viewChild<ElementRef<HTMLElement>>('monthArea');

  protected readonly today = new Date().toLocaleDateString('en-CA');
  protected readonly weekStart = signal(mondayOf(this.today));
  protected readonly week = signal<Week | null>(null);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly loading = signal(true);
  /** A day picked from the month view, highlighted on the board. */
  protected readonly focusedDay = signal<string | null>(null);
  protected readonly monthOpen = signal(false);
  protected readonly monthCounts = signal<Record<string, DayCount>>({});
  /** The task just created or changed: outlined on the board for a few seconds, so you see where it went. */
  protected readonly highlight = signal<number | null>(null);
  private highlightTimer?: ReturnType<typeof setTimeout>;

  /** "Oct 20 – 24, 2026", or "Oct 27 – Nov 2, 2026" across two months (Monday to Friday). */
  protected readonly title = computed(() => {
    const start = new Date(`${this.weekStart()}T12:00:00`);
    const end = new Date(`${addDays(this.weekStart(), 4)}T12:00:00`);
    const month = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' });
    const to = start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${month(end)} ${end.getDate()}`;
    return `${month(start)} ${start.getDate()} – ${to}, ${end.getFullYear()}`;
  });
  protected readonly isThisWeek = computed(() => this.weekStart() === mondayOf(this.today));

  protected readonly live = computed(() => this.tasks().filter((task) => task.status !== 'CANCELLED'));
  protected readonly unassigned = computed(() => this.live().filter((task) => task.status === 'UNASSIGNED'));
  protected readonly weekendTasks = computed(() => {
    const weekdays = this.week()?.days.map((day) => day.date) ?? [];
    return this.live().filter((task) => !weekdays.includes(task.date));
  });

  async ngOnInit(): Promise<void> {
    await this.load();
    this.loading.set(false);
  }

  // ---- Moving around ----

  protected async moveWeek(weeks: number): Promise<void> {
    this.focusedDay.set(null);
    this.highlight.set(null);
    this.weekStart.set(weeks === 0 ? mondayOf(this.today) : addDays(this.weekStart(), 7 * weeks));
    await this.load();
  }

  protected async pickFromMonth(pick: { date: string; whole: 'day' | 'week' }): Promise<void> {
    this.monthOpen.set(false);
    this.focusedDay.set(pick.whole === 'day' ? pick.date : null);
    this.weekStart.set(mondayOf(pick.date));
    await this.load();
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

  // ---- What's in a cell ----

  protected tasksOf(student: Student, date: string): Task[] {
    return this.live().filter((task) => task.assignee?.id === student.studentId && task.date === date);
  }

  protected unassignedOn(date: string): Task[] {
    return this.unassigned().filter((task) => task.date === date);
  }

  protected dayOf(student: Student, date: string): Student['days'][number] | undefined {
    return student.days.find((day) => day.date === date);
  }

  protected label(status: TaskStatus): string {
    return STATUS_LABEL[status];
  }

  protected highlighted(date: string): boolean {
    return date === this.today || date === this.focusedDay();
  }

  // ---- Actions ----

  protected editSchedule(student: Student): void {
    void this.schedulePanel().open(student.studentId, student.name);
  }

  /** A new task on a day, for a student (starting when their first shift that day does), or for anyone. */
  protected addTask(date: string, student?: Student): void {
    const firstShift = student ? this.dayOf(student, date)?.shifts[0]?.start : undefined;
    void this.taskPanels().openNew(date, student ? { id: student.studentId, name: student.name } : undefined, firstShift);
  }

  protected openTask(task: Task): void {
    void this.taskPanels().open(task);
  }

  /** After a panel saved something: show that task's week, refreshed, with the task outlined. */
  protected async refresh(task?: Task): Promise<void> {
    if (task && mondayOf(task.date) !== this.weekStart()) {
      this.weekStart.set(mondayOf(task.date));
      this.focusedDay.set(task.date);
    }
    await this.load();
    if (task) {
      this.highlight.set(task.id);
      clearTimeout(this.highlightTimer);
      this.highlightTimer = setTimeout(() => this.highlight.set(null), 6000);
      // After the board has redrawn, bring the task into view.
      setTimeout(() => document.querySelector(`[data-task="${task.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }));
    }
  }

  private async load(): Promise<void> {
    try {
      const [week, tasks] = await Promise.all([
        this.scheduleApi.week(this.weekStart()),
        this.taskApi.list(this.weekStart(), addDays(this.weekStart(), 6)),
      ]);
      this.week.set(week);
      this.tasks.set(tasks);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }
}
