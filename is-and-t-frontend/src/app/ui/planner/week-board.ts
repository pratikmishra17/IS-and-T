import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { Week, clock, minutes } from '../../services/schedule';
import { STATUS_LABEL, Task, TaskStatus, taskTone } from '../../services/tasks';
import { TaskDrag, TaskDrop } from '../task-dnd';
import { PickedTime, TimeDrag } from '../time-drag';
import { ChangeAt, NewTaskAt, TaskMoved } from './day-timeline';

type Student = Week['students'][number];

/** A time picked on one day of the week board. */
export interface NewTaskOn extends NewTaskAt {
  date: string;
}

export interface ChangeOn extends ChangeAt {
  date: string;
}

/**
 * The week board: students × Monday–Friday, plus Saturday and Sunday when something is on them (an
 * extra shift or a task) or showWeekend is on. Each cell is the day as a small timeline (the shift as a
 * striped band, tasks as ticks) with the tasks as cards under it; tasks nobody has are in the first
 * row. Dragging across a timeline adds a task then, dragging a card onto a row gives it to that
 * person, and a day's name opens it in the day view.
 *
 * Used by the admin Planner (everything on) and the student portal's Team page, where the inputs
 * switch off what that student may not do; there, dragging across your own day asks for a shift
 * change (requestChange) instead.
 */
@Component({
  selector: 'app-week-board',
  imports: [DatePipe, NgTemplateOutlet, TimeDrag, TaskDrag, TaskDrop],
  template: `
    <!-- isolate: the pinned Student column (tl-name) stacks inside this box, never over the page's bars -->
    <div class="relative isolate overflow-x-auto">
      <table class="week-board w-full table-fixed border-separate border-spacing-1 text-left text-sm" [style.--board-days]="days().length">
        <thead>
          <tr>
            <th scope="col" class="tl-name w-28 px-2 py-2 text-xs sm:w-44 font-semibold uppercase tracking-wider text-slate-500">Student</th>
            @for (day of days(); track day.date) {
              <th scope="col" class="rounded-xl px-1 py-1 align-top" [class.bg-teal-100]="highlighted(day.date)">
                <button type="button" class="block w-full rounded-lg px-1.5 py-1 text-left" [attr.aria-label]="'Open ' + (day.date | date: 'EEEE MMMM d') + ' in the day view'" title="Open this day" (click)="openDay.emit(day.date)">
                  <span class="block text-xs font-semibold uppercase tracking-wider" [class.text-teal-900]="highlighted(day.date)" [class.text-slate-500]="!highlighted(day.date)">{{ day.date | date: 'EEE' }}</span>
                  <span class="block text-lg font-semibold leading-tight text-slate-900">{{ day.date | date: 'MMM d' }}</span>
                </button>
                @if (day.date === today()) { <span class="badge badge-solid mt-1">Today</span> }
                @if (day.holiday) { <span class="badge mt-1 block w-fit bg-rose-100 text-rose-900" [title]="day.holiday">{{ day.holiday }}</span> }
                <!-- The hours each day's timeline covers -->
                <div class="relative mt-1.5 h-3.5" aria-hidden="true">
                  @for (mark of marks(); track mark) {
                    <span class="absolute -translate-x-1/2 text-[0.6rem] font-medium tabular-nums text-slate-500" [style.left.%]="x(mark)">{{ shortHour(mark) }}</span>
                  }
                </div>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          <!-- Tasks nobody has yet (drop a task here to take it off someone) -->
          <tr [appTaskDrop]="null" (taskDropped)="moveTask.emit({ task: $event, student: null })">
            <th scope="row" class="tl-name tint-amber rounded-xl bg-amber-50/70 px-3 py-2.5 align-top">
              <span class="block font-semibold text-amber-950">Unassigned</span>
              <span class="block text-xs text-amber-800">{{ unassigned().length }} {{ unassigned().length === 1 ? 'task needs' : 'tasks need' }} someone</span>
            </th>
            @for (day of days(); track day.date) {
              <td class="group rounded-xl bg-amber-50/40 p-1.5 align-top" [class.ring-2]="highlighted(day.date)" [class.ring-teal-300]="highlighted(day.date)">
                <div class="flex min-h-14 flex-col gap-1">
                  <div class="week-track relative h-6 rounded-md bg-white/40" [appTimeDrag]="range()" [appTimeDragOff]="!canAddTasks()" (picked)="picked(day.date, $event)"
                    [title]="canAddTasks() ? 'Drag (or click) to add an unassigned task at that time' : ''">
                    <ng-container *ngTemplateOutlet="ticks; context: { $implicit: unassignedOn(day.date) }" />
                  </div>
                  @for (task of unassignedOn(day.date); track task.id) {
                    <ng-container *ngTemplateOutlet="taskCard; context: { $implicit: task }" />
                  }
                </div>
              </td>
            }
          </tr>

          @if (week().students.length === 0) {
            <tr><td [attr.colspan]="days().length + 1" class="py-12 text-center text-sm text-slate-600">No active students yet.</td></tr>
          }

          @for (student of week().students; track student.studentId) {
            <!-- Drop a task anywhere on someone's row to give it to them -->
            <tr [appTaskDrop]="student.studentId" (taskDropped)="moveTask.emit({ task: $event, student })">
              <th scope="row" class="tl-name rounded-xl px-3 py-2.5 align-top" [class.bg-white/40]="!isMe(student)" [class.bg-teal-50/80]="isMe(student)" [class.tint-teal]="isMe(student)">
                <span class="block truncate font-semibold text-slate-900">{{ student.name }}</span>
                @if (isMe(student)) { <span class="badge badge-solid mt-0.5">You</span> }
                <span class="block text-xs" [class.text-rose-800]="student.overLimit" [class.font-semibold]="student.overLimit" [class.text-slate-500]="!student.overLimit">
                  {{ student.hours }}@if (week().weeklyHourLimit) { / {{ week().weeklyHourLimit }} } h this week
                </span>
                @if (canEditSchedules()) {
                  <button type="button" class="btn btn-quiet mt-2 px-2.5 py-1 text-xs" [attr.aria-label]="'Edit ' + student.name + '’s schedule'" (click)="editSchedule.emit(student)">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                    <span class="hidden sm:inline">Edit schedule</span>
                  </button>
                }
              </th>
              @for (day of days(); track day.date) {
                <td class="group rounded-xl p-1.5 align-top" [class.bg-white/25]="!isMe(student)" [class.bg-teal-50/50]="isMe(student)" [class.ring-2]="highlighted(day.date)" [class.ring-teal-300]="highlighted(day.date)">
                  @if (dayOf(student, day.date); as cell) {
                    <div class="flex min-h-14 flex-col gap-1">
                      <!-- The day as a small timeline: the shift as a band, tasks as ticks -->
                      <div class="week-track relative h-7 rounded-md bg-white/40" [appTimeDrag]="range()" [appTimeDragOff]="!canPickOn(student)" (picked)="picked(day.date, $event, student)"
                        [title]="rowHint(student)">
                        @for (shift of cell.shifts; track shift.start) {
                          <div class="day-shift pointer-events-none absolute inset-y-0.5 rounded" [class.is-extra]="shift.extra"
                            [style.left.%]="x(shift.start)" [style.width.%]="x(shift.end) - x(shift.start)"></div>
                        }
                        @for (off of cell.timeOff; track off.start) {
                          <div class="shift-class pointer-events-none absolute inset-y-0.5 rounded" [style.left.%]="x(off.start)" [style.width.%]="x(off.end) - x(off.start)"></div>
                        }
                        <ng-container *ngTemplateOutlet="ticks; context: { $implicit: tasksOf(student, day.date) }" />
                        @if (cell.cancelled) { <span class="pointer-events-none absolute inset-0 flex items-center justify-center text-[0.65rem] font-semibold text-slate-500">Day off</span> }
                      </div>
                      @if (cell.shifts.length > 0) {
                        <p class="text-[0.7rem] font-semibold text-teal-800">
                          @for (shift of cell.shifts; track shift.start; let last = $last) { {{ shift.extra ? 'Extra ' : '' }}{{ shift.start }}–{{ shift.end }}@if (!last) { , } }
                        </p>
                      }
                      @for (off of cell.timeOff; track off.start) { <p class="text-[0.7rem] text-slate-500">Off {{ off.start }}–{{ off.end }}</p> }
                      @for (task of tasksOf(student, day.date); track task.id) {
                        <ng-container *ngTemplateOutlet="taskCard; context: { $implicit: task }" />
                      }
                    </div>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>

    @if (weekendTasks().length > 0) {
      <h2 class="mt-5 px-2 text-xs font-semibold uppercase tracking-widest text-slate-500">Other days</h2>
      <div class="mt-2 grid gap-2 px-2 sm:grid-cols-3">
        @for (task of weekendTasks(); track task.id) { <ng-container *ngTemplateOutlet="taskCard; context: { $implicit: task }" /> }
      </div>
    }

    <p class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 px-2 text-xs text-slate-500">
      <span class="flex items-center gap-1.5"><span class="day-shift inline-block h-3.5 w-7 rounded"></span> Shift (working)</span>
      <span class="flex items-center gap-1.5"><span class="day-shift is-extra inline-block h-3.5 w-7 rounded"></span> Extra shift</span>
      <span class="flex items-center gap-1.5"><span class="task-card is-assigned inline-block h-3.5 w-7 rounded"></span> Task</span>
      <span class="flex items-center gap-1.5"><span class="task-card is-unassigned inline-block h-3.5 w-7 rounded"></span> Unassigned task</span>
      <span class="flex items-center gap-1.5"><span class="task-card is-done inline-block h-3.5 w-7 rounded"></span> Done</span>
      <span class="text-rose-800">Red hours: over the weekly limit</span>
      <span>{{ hint() }} Click a day’s name for its full timeline.</span>
    </p>

    <ng-template #taskCard let-task>
      <button type="button" class="task-card block w-full rounded-lg px-2 py-1.5 text-left text-xs"
        [class]="tone(task)"
        [attr.data-task]="task.id" [class.task-highlight]="highlight() === task.id" [appTaskDrag]="task" [appTaskDragOff]="!canMoveTasks()"
        [attr.aria-label]="task.title + ', ' + task.startTime + ' to ' + task.endTime + ', ' + label(task.status) + (task.assignee ? ', ' + task.assignee.name : '')"
        (click)="openTask.emit(task)">
        <span class="block font-semibold text-slate-500">{{ task.startTime }}–{{ task.endTime }}</span>
        <span class="block truncate font-medium text-slate-900">{{ task.title }}</span>
        <span class="block truncate text-slate-500">{{ task.location }}@if (task.status === 'COMPLETED') { · Done }@if (task.claimedOffShift) { · ⚠ }</span>
      </button>
    </ng-template>

    <!-- Where tasks fall on a small day timeline: solid ticks over the shift band -->
    <ng-template #ticks let-tasks>
      @for (task of tasks; track task.id) {
        <span class="task-tick pointer-events-none absolute bottom-1 top-1 rounded-sm" [class]="tone(task)"
          [style.left.%]="x(task.startTime)" [style.width]="'max(4px, ' + (x(task.endTime) - x(task.startTime)) + '%)'"></span>
      }
    </ng-template>
  `,
})
export class WeekBoard {
  readonly week = input.required<Week>();
  /** The week's tasks (any status; cancelled ones aren't shown). */
  readonly tasks = input.required<Task[]>();
  readonly today = input.required<string>();
  /** A day picked from the month view, outlined like today. */
  readonly focusedDay = input<string | null>(null);
  readonly highlight = input<number | null>(null);

  /** What may be done here (all true on the admin Planner). */
  readonly canAddTasks = input(true);
  readonly canMoveTasks = input(true);
  readonly canEditSchedules = input(true);
  /** Student portal: who's looking. Their row is marked "You", and dragging across their day asks for a shift change. */
  readonly ownStudentId = input<number | null>(null);
  /** Show Saturday and Sunday even when nothing is on them (to add a weekend shift or task). */
  readonly showWeekend = input(false);

  readonly openTask = output<Task>();
  readonly openDay = output<string>();
  readonly addTask = output<NewTaskOn>();
  readonly moveTask = output<TaskMoved>();
  readonly editSchedule = output<Student>();
  readonly requestChange = output<ChangeOn>();

  protected readonly live = computed(() => this.tasks().filter((task) => task.status !== 'CANCELLED'));
  protected readonly unassigned = computed(() => this.live().filter((task) => task.status === 'UNASSIGNED'));
  /** Monday–Friday, and the weekend days that have something on them (or all seven with showWeekend). */
  protected readonly days = computed(() => {
    const busy = busyWeekendDays(this.week(), this.live());
    return this.week().days.filter((day) => !isWeekend(day.date) || this.showWeekend() || busy.has(day.date));
  });
  /** Tasks on a day that isn't shown (only if the week came without that day). */
  protected readonly weekendTasks = computed(() => {
    const shown = this.days().map((day) => day.date);
    return this.live().filter((task) => !shown.includes(task.date));
  });

  /** The hours each day's small timeline covers: 7 AM to 7 PM, stretched to fit the week's shifts and tasks. */
  protected readonly range = computed(() => {
    const times = [
      ...this.live().flatMap((task) => [minutes(task.startTime), minutes(task.endTime)]),
      ...this.week().students.flatMap((s) => s.days.flatMap((d) => d.shifts.flatMap((sh) => [minutes(sh.start), minutes(sh.end)]))),
    ];
    const first = Math.min(7 * 60, ...times);
    const last = Math.max(19 * 60, ...times);
    return { start: Math.floor(first / 60) * 60, end: Math.ceil(last / 60) * 60 };
  });

  /** A few hour labels over each day's timeline (every 3 hours, not at the edges, where they'd run into the next day). */
  protected readonly marks = computed(() => {
    const marks: number[] = [];
    for (let at = this.range().start + 180; at < this.range().end; at += 180) {
      marks.push(at);
    }
    return marks;
  });

  /** What dragging does here, for the legend. */
  protected readonly hint = computed(() => {
    const parts: string[] = [];
    if (this.ownStudentId() !== null) {
      parts.push('Drag across your own day to ask to work then.');
    }
    if (this.canAddTasks()) {
      parts.push('Drag across a day’s timeline to add a task for that time; a click makes a 30-minute one.');
    }
    if (this.canMoveTasks()) {
      parts.push('Drag a task onto someone’s row to give it to them.');
    }
    return parts.join(' ');
  });

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
    return date === this.today() || date === this.focusedDay();
  }

  protected isMe(student: Student): boolean {
    return student.studentId === this.ownStudentId();
  }

  protected canPickOn(student: Student): boolean {
    return this.isMe(student) || this.canAddTasks();
  }

  protected rowHint(student: Student): string {
    if (this.isMe(student)) {
      return 'Drag across your day to ask to work then';
    }
    return this.canAddTasks() ? 'Drag (or click) to add a task for ' + student.name + ' at that time' : '';
  }

  protected label(status: TaskStatus): string {
    return STATUS_LABEL[status];
  }

  protected tone(task: Task): string {
    return taskTone(task.status);
  }

  /** Where a time sits across a day's small timeline, as a percentage. */
  protected x(time: string | number): number {
    const at = typeof time === 'string' ? minutes(time) : time;
    const { start, end } = this.range();
    return ((at - start) / (end - start)) * 100;
  }

  /** 13 * 60 → "1p" */
  protected shortHour(at: number): string {
    const hour = at / 60;
    return `${hour % 12 || 12}${hour < 12 ? 'a' : 'p'}`;
  }

  /** A time dragged (or clicked) on a day: your own day asks for a shift change; otherwise a new task then. */
  protected picked(date: string, time: PickedTime, student?: Student): void {
    if (student && this.isMe(student)) {
      this.requestChange.emit({ date, startTime: clock(time.start), endTime: clock(time.end) });
      return;
    }
    this.addTask.emit({ date, startTime: clock(time.start), minutes: time.end - time.start, student, unassigned: !student });
  }
}

/** Saturday or Sunday ("2026-11-14" style dates). */
export function isWeekend(date: string): boolean {
  const day = new Date(`${date}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

/** The weekend dates of a week with an extra shift, time off or a (not cancelled) task on them. */
export function busyWeekendDays(week: Week, tasks: Task[]): Set<string> {
  const busy = new Set<string>();
  tasks.filter((task) => task.status !== 'CANCELLED' && isWeekend(task.date)).forEach((task) => busy.add(task.date));
  week.students.forEach((student) => student.days
    .filter((day) => isWeekend(day.date) && (day.shifts.length > 0 || day.timeOff.length > 0))
    .forEach((day) => busy.add(day.date)));
  return busy;
}
