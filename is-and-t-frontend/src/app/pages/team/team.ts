import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Semester } from '../../services/calendar';
import { errorMessage } from '../../services/errors';
import { InventoryApi } from '../../services/inventory';
import { remembered } from '../../services/remember';
import { MyScheduleApi, Week } from '../../services/schedule';
import { SettingsApi } from '../../services/settings';
import { AdminTaskApi, STATUS_LABEL, Task, TaskEvent, TaskStatus } from '../../services/tasks';
import {
  Offer, TASK_ACCESS_LABEL, TeamAccess, TeamApi, TeamInventoryApi, TeamSettingsApi, TeamTaskApi,
} from '../../services/team';
import { addDays, mondayOf } from '../../ui/month-picker';
import { ChangeAt, DayTimeline, NewTaskAt } from '../../ui/planner/day-timeline';
import { ChangeOn, NewTaskOn, WeekBoard } from '../../ui/planner/week-board';
import { ChangeRequestPanel } from '../../ui/change-request';
import { MyRequests } from '../../ui/my-requests';
import { SidePanel } from '../../ui/side-panel';
import { TaskPanels } from '../../ui/task-panels';
import { Toasts } from '../../ui/toast';
import { MyTimeOffApi } from '../../services/time-off';

type View = 'day' | 'week' | 'tasks' | 'requests';
const VIEWS: View[] = ['day', 'week', 'tasks', 'requests'];
type ListFilter = 'open' | 'mine' | 'unassigned' | 'all';

/**
 * Student portal: Team (/team). Everyone's shifts and tasks, like the admin Planner:
 * - Day and Week: the same views as the admin portal. Dragging across your own row asks for a
 *   change (the shared "Ask for a change" form: time off, or different hours that day or every week).
 * - Tasks: every task of the semester, filterable.
 * - My requests: time off, shift changes and offers you sent, and what the admins said.
 * Opening a task shows it with what you may do: "I can do this" (a task nobody has becomes yours;
 * for someone else's, the admins get an offer), mark it done (yours, or anyone's with "View + mark
 * done" access), and, with "Edit tasks" access, plan it with the same form admins use.
 */
@Component({
  selector: 'app-team',
  imports: [DatePipe, FormsModule, DayTimeline, WeekBoard, SidePanel, TaskPanels, ChangeRequestPanel, MyRequests],
  // The admin task form, pointed at the student endpoints (the backend checks the access)
  providers: [
    { provide: AdminTaskApi, useClass: TeamTaskApi },
    { provide: InventoryApi, useClass: TeamInventoryApi },
    { provide: SettingsApi, useClass: TeamSettingsApi },
  ],
  templateUrl: './team.html',
  // The week board needs the room: page-wide tells the page frame to use the full width
  host: { class: 'page-wide block' },
})
export class Team implements OnInit {
  private readonly api = inject(TeamApi);
  private readonly timeOffApi = inject(MyTimeOffApi);
  private readonly taskApi = inject(AdminTaskApi);
  private readonly scheduleApi = inject(MyScheduleApi);
  private readonly toasts = inject(Toasts);
  protected readonly taskPanels = viewChild(TaskPanels);

  protected readonly today = new Date().toLocaleDateString('en-CA');
  protected readonly tabs: { id: View; label: string }[] = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'tasks', label: 'Tasks' }, { id: 'requests', label: 'My requests' },
  ];
  protected readonly view = remembered<View>('team.view', 'week', { allowed: VIEWS });
  protected readonly date = remembered('team.date', this.today, { session: true });
  protected readonly weekStart = computed(() => mondayOf(this.date()));

  protected readonly access = signal<TeamAccess | null>(null);
  protected readonly week = signal<Week | null>(null);
  protected readonly tasks = signal<Task[]>([]);
  protected readonly loading = signal(true);
  protected readonly highlight = signal<number | null>(null);
  private loadedWeek: string | null = null;

  // The semester's tasks
  protected readonly semesters = signal<Semester[]>([]);
  protected readonly semesterId = signal<number | null>(null);
  protected readonly semesterTasks = signal<Task[]>([]);
  protected readonly listFilter = remembered<ListFilter>('team.filter', 'open', { allowed: ['open', 'mine', 'unassigned', 'all'] });
  protected readonly search = signal('');

  // Requests
  protected readonly offers = signal<Offer[]>([]);
  /** Time off and shift changes still waiting (from the My requests list). */
  protected readonly changesPending = signal(0);
  private readonly changePanel = viewChild.required(ChangeRequestPanel);
  private readonly myRequests = viewChild<MyRequests>('myRequests');

  // The open task
  protected readonly selected = signal<Task | null>(null);
  protected readonly history = signal<TaskEvent[]>([]);
  protected offerNote = '';
  protected outcomeNotes = '';
  protected readonly busy = signal(false);

  // A shift change being written

  // ---- What's shown ----

  protected readonly me = computed(() => this.access()?.studentId ?? null);
  protected readonly canComplete = computed(() => this.access()?.access === 'COMPLETE' || this.access()?.access === 'EDIT');
  protected readonly canEdit = computed(() => this.access()?.access === 'EDIT');
  protected readonly accessLabel = computed(() => (this.access() ? TASK_ACCESS_LABEL[this.access()!.access] : ''));
  protected readonly accessHelp = computed(() => {
    switch (this.access()?.access) {
      case 'EDIT': return 'You can see everyone’s shifts and tasks, mark tasks done, and plan tasks: add, change, assign and cancel them.';
      case 'COMPLETE': return 'You can see everyone’s shifts and tasks and mark any task done. Offer to take a task with “I can do this”.';
      default: return 'You can see everyone’s shifts and tasks. Offer to take a task with “I can do this”, and drag across your own row to ask for a shift change.';
    }
  });
  protected readonly isThisWeek = computed(() => this.weekStart() === mondayOf(this.today));
  protected readonly showingToday = computed(() => (this.view() === 'day' ? this.date() === this.today : this.isThisWeek()));
  protected readonly title = computed(() => {
    if (this.view() === 'day') {
      return new Date(`${this.date()}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
    const start = new Date(`${this.weekStart()}T12:00:00`);
    const end = new Date(`${addDays(this.weekStart(), 4)}T12:00:00`);
    const month = (date: Date) => date.toLocaleDateString('en-US', { month: 'short' });
    return `${month(start)} ${start.getDate()} – ${start.getMonth() === end.getMonth() ? end.getDate() : month(end) + ' ' + end.getDate()}, ${end.getFullYear()}`;
  });

  protected readonly pendingRequests = computed(() =>
    this.offers().filter((o) => o.status === 'PENDING').length + this.changesPending());

  /** The semester's tasks, filtered. */
  protected readonly listed = computed(() => {
    const words = this.search().trim().toLowerCase();
    return this.semesterTasks().filter((task) => {
      const keep = {
        open: task.status === 'UNASSIGNED' || task.status === 'ASSIGNED',
        mine: task.assignee?.id === this.me(),
        unassigned: task.status === 'UNASSIGNED',
        all: true,
      }[this.listFilter()];
      const text = `${task.title} ${task.location} ${task.assignee?.name ?? ''}`.toLowerCase();
      return keep && (!words || text.includes(words));
    });
  });

  async ngOnInit(): Promise<void> {
    try {
      const [access, semesters] = await Promise.all([this.api.access(), this.scheduleApi.semesters()]);
      this.access.set(access);
      this.semesters.set(semesters);
      this.semesterId.set((semesters.find((s) => s.current) ?? semesters[0])?.id ?? null);
      await Promise.all([this.load(), this.loadRequests(), this.view() === 'tasks' ? this.loadSemester() : Promise.resolve()]);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  // ---- Moving around ----

  protected async setView(view: View): Promise<void> {
    this.view.set(view);
    if (view === 'tasks') {
      await this.loadSemester();
    } else if (view === 'requests') {
      await this.loadRequests();
    }
  }

  protected async move(steps: number): Promise<void> {
    this.date.set(addDays(this.date(), steps * (this.view() === 'day' ? 1 : 7)));
    await this.load();
  }

  protected async goToday(): Promise<void> {
    this.date.set(this.today);
    await this.load();
  }

  protected async openDay(date: string): Promise<void> {
    this.view.set('day');
    this.date.set(date);
    await this.load();
  }

  protected async pickSemester(id: number): Promise<void> {
    this.semesterId.set(Number(id));
    await this.loadSemester();
  }

  // ---- A task ----

  protected async openTask(task: Task): Promise<void> {
    this.selected.set(task);
    this.history.set([]);
    this.offerNote = '';
    this.outcomeNotes = '';
    try {
      const detail = await this.api.detail(task.id);
      this.selected.set(detail.task);
      this.history.set(detail.history);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  protected isOpen(task: Task): boolean {
    return task.status === 'UNASSIGNED' || task.status === 'ASSIGNED';
  }

  protected isMine(task: Task): boolean {
    return task.assignee?.id === this.me();
  }

  /** "I can do this": a task nobody has becomes yours; for someone else's, the admins get an offer. */
  protected async offer(task: Task): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.api.offer(task.id, this.offerNote);
      this.toasts.success(result.claimed ? `“${task.title}” is yours.` : `Sent. An admin will decide whether “${task.title}” becomes yours.`);
      this.selected.set(null);
      await Promise.all([this.refresh(result.task), this.loadRequests()]);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async finish(task: Task, done: boolean): Promise<void> {
    if (!done && !this.outcomeNotes.trim()) {
      this.toasts.error('Please say why it couldn’t be done.');
      return;
    }
    this.busy.set(true);
    try {
      const saved = done ? await this.api.complete(task.id, this.outcomeNotes) : await this.api.notCompleted(task.id, this.outcomeNotes);
      this.toasts.success(done ? `“${task.title}” is marked done.` : `“${task.title}” is marked as couldn’t be done.`);
      this.selected.set(null);
      await this.refresh(saved);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Edit access: the admin task form (pointed at the student endpoints). */
  protected editTask(task: Task): void {
    this.selected.set(null);
    void this.taskPanels()?.open(task);
  }

  protected newTask(): void {
    void this.taskPanels()?.openNew({ date: this.view() === 'day' ? this.date() : this.isThisWeek() ? this.today : this.weekStart() });
  }

  protected addTaskAt(at: NewTaskAt): void {
    this.addTaskOn({ ...at, date: this.date() });
  }

  protected addTaskOn(at: NewTaskOn): void {
    void this.taskPanels()?.openNew({
      date: at.date, startTime: at.startTime, minutes: at.minutes,
      student: at.student ? { id: at.student.studentId, name: at.student.name } : undefined, unassigned: at.unassigned,
    });
  }

  /** Edit access: a task dragged onto someone's row. */
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

  protected label(status: TaskStatus): string {
    return STATUS_LABEL[status];
  }

  // ---- Asking for a shift change ----

  /** From dragging across your own row: that day, with the time you picked added to what you work now. */
  protected changeAt(at: ChangeAt): void {
    this.openChange(this.date(), at);
  }

  protected changeOn(at: ChangeOn): void {
    this.openChange(at.date, at);
  }

  /** The shared "Ask for a change" form, on a day; a time picked by dragging starts it as different hours. */
  protected openChange(date: string, picked?: ChangeAt): void {
    void this.changePanel().open(date, picked ? { start: picked.startTime, end: picked.endTime } : undefined);
  }

  protected async requestSent(): Promise<void> {
    await Promise.all([this.myRequests()?.reload(), this.loadRequests()]);
  }

  protected async withdrawOffer(offer: Offer): Promise<void> {
    try {
      await this.api.withdrawOffer(offer.id);
      await this.loadRequests();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  /** "AUTO_ASSIGNED" → "auto assigned", as the admin portal shows it. */
  protected eventLabel(type: string): string {
    return type.toLowerCase().replaceAll('_', ' ');
  }

  // ---- Loading ----

  /** After something changed: reload, and outline the task for a few seconds. */
  protected async refresh(task?: Task): Promise<void> {
    await Promise.all([this.load(true), this.view() === 'tasks' ? this.loadSemester() : Promise.resolve()]);
    if (task) {
      this.highlight.set(task.id);
      setTimeout(() => this.highlight.set(null), 6000);
    }
  }

  private async load(force = false): Promise<void> {
    const week = this.weekStart();
    if (!force && this.loadedWeek === week) {
      return;
    }
    try {
      const [schedule, tasks] = await Promise.all([this.api.week(week), this.api.tasks(week, addDays(week, 6))]);
      if (week === this.weekStart()) {
        this.week.set(schedule);
        this.tasks.set(tasks);
        this.loadedWeek = week;
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private async loadSemester(): Promise<void> {
    const semester = this.semesters().find((s) => s.id === this.semesterId());
    if (!semester) {
      return;
    }
    try {
      this.semesterTasks.set(await this.api.tasks(semester.startDate, semester.endDate));
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private async loadRequests(): Promise<void> {
    try {
      // The tab's number counts everything waiting: offers, shift changes and time off.
      const [offers, changes, timeOff] = await Promise.all([this.api.myOffers(), this.api.changes(), this.timeOffApi.list()]);
      this.offers.set(offers);
      this.changesPending.set([...changes, ...timeOff].filter((request) => request.status === 'PENDING').length);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }
}
