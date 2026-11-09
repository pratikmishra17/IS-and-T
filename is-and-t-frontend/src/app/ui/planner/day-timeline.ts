import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, OnDestroy, afterRenderEffect, computed, input, output, signal, viewChild } from '@angular/core';
import { Week, clock, minutes } from '../../services/schedule';
import { STATUS_LABEL, Task, taskTone } from '../../services/tasks';
import { TaskDrag, TaskDrop } from '../task-dnd';
import { PickedTime, TimeDrag } from '../time-drag';

type Student = Week['students'][number];

/** Height of one line of tasks in a row, in rem. Overlapping tasks go on separate lines. */
const LANE_REM = 2.75;
/** A student's row: the shift strip on top (this tall, in rem), then their tasks underneath, never on top of it. */
const STRIP_REM = 1.375;
/** Space above the strip, between the strip and the tasks, and below the tasks. */
const GAP_REM = 0.375;

/** A task placed on the timeline: which line of its row it's on, and whether it's outside its person's shifts. */
interface Placed {
  task: Task;
  lane: number;
  offShift?: boolean;
}

/** A task dragged onto someone's row (student), or onto the Unassigned row (null). */
export interface TaskMoved {
  task: Task;
  student: Student | null;
}

/** A time a student dragged across their own row: they'd like to work then (a shift change request). */
export interface ChangeAt {
  startTime: string;
  endTime: string;
}

/** What a drag or click on an empty spot asks for: a new task on this day, at this time, for someone (or nobody yet). */
export interface NewTaskAt {
  startTime: string;
  minutes: number;
  student?: Student;
  unassigned?: boolean;
}

/**
 * The Planner's Day view: one day as a timeline. Hours run left to right; each student is a row
 * with their shift(s) as bars and their tasks on top, and a row of tasks nobody has yet comes first.
 * Each student's row has their shift(s) as a strip along the top and their tasks underneath, so a
 * task never hides a shift; a faint band below the strip shows the shift's hours, and a task
 * outside them is flagged. Dragging across an empty part of a row (or clicking it, for 30 minutes)
 * adds a task then; dragging a task onto another row gives it to that person (or nobody, on the
 * Unassigned row); clicking a task opens it. On today, a line marks the current time.
 *
 * Used by the admin Planner (everything on) and the student portal's Team page, where the inputs
 * switch off what that student may not do; there, dragging across your own row asks for a shift
 * change (requestChange) instead of adding a task.
 */
@Component({
  selector: 'app-day-timeline',
  template: `
    <!-- isolate: the pinned names column (tl-name) stacks inside this box, never over the page's bars -->
    <div #scroller class="relative isolate overflow-x-auto">
      <div class="min-w-[44rem] sm:min-w-[60rem]">
        <!-- The hours -->
        <div class="grid grid-cols-[7rem_1fr] sm:grid-cols-[11rem_1fr] border-b border-slate-200/70">
          <div class="tl-name"></div>
          <div class="relative h-8" aria-hidden="true">
            @for (hour of hourMarks(); track hour) {
              <span class="absolute bottom-1.5 -translate-x-1/2 text-[0.7rem] font-medium tabular-nums text-slate-500" [style.left.%]="x(hour)">{{ hourLabel(hour) }}</span>
            }
          </div>
        </div>

        <!-- Tasks nobody has yet -->
        <div class="grid grid-cols-[7rem_1fr] sm:grid-cols-[11rem_1fr] border-b border-slate-200/60" [appTaskDrop]="null" (taskDropped)="moveTask.emit({ task: $event, student: null })">
          <div class="tl-name tint-amber bg-amber-50/50 px-3 py-2.5">
            <p class="font-semibold text-amber-950">Unassigned</p>
            <p class="text-xs text-amber-800">{{ unassigned().length }} {{ unassigned().length === 1 ? 'task needs' : 'tasks need' }} someone</p>
          </div>
          <div class="day-track relative bg-amber-50/30" [style.height.rem]="rowHeight(unassignedLanes(), false)"
            [title]="canAddTasks() ? 'Drag (or click) to add an unassigned task at that time' : ''" [appTimeDrag]="range()" [appTimeDragOff]="!canAddTasks()" (picked)="picked($event)">
            <ng-container *ngTemplateOutlet="grid" />
            @for (placed of unassigned(); track placed.task.id) {
              <ng-container *ngTemplateOutlet="taskBlock; context: { $implicit: placed, top: gapRem }" />
            }
            <ng-container *ngTemplateOutlet="nowLine" />
          </div>
        </div>

        @if (rows().length === 0) {
          <p class="py-12 text-center text-sm text-slate-600">No active students yet. Add them on the Users page.</p>
        }

        @for (row of rows(); track row.student.studentId) {
          <div class="grid grid-cols-[7rem_1fr] sm:grid-cols-[11rem_1fr] border-b border-slate-200/60 last:border-b-0" [class.bg-teal-50/50]="isMe(row.student)"
            [appTaskDrop]="row.student.studentId" (taskDropped)="moveTask.emit({ task: $event, student: row.student })">
            <div class="tl-name px-3 py-2.5" [class.tint-teal]="isMe(row.student)">
              <p class="truncate font-semibold text-slate-900">{{ row.student.name }} @if (isMe(row.student)) { <span class="badge badge-solid ml-1">You</span> }</p>
              <p class="text-xs text-slate-500">
                @if (row.cancelled) { Day off }
                @else if (row.shifts.length === 0) { Not working }
                @else { {{ row.hours }} h on shift }
              </p>
              @if (canEditSchedules()) {
                <button type="button" class="btn btn-quiet mt-1.5 px-2 py-0.5 text-xs" [attr.aria-label]="'Edit ' + row.student.name + '’s schedule'" (click)="editSchedule.emit(row.student)">
                  <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  <span class="hidden sm:inline">Edit schedule</span>
                </button>
              }
            </div>
            <div class="day-track relative" [style.height.rem]="rowHeight(row.lanes, true)"
              [title]="rowHint(row.student)" [appTimeDrag]="range()" [appTimeDragOff]="!canPickOn(row.student)" (picked)="picked($event, row.student)">
              <ng-container *ngTemplateOutlet="grid" />
              <!-- Top: the shift strip, with its times always readable -->
              @for (shift of row.shifts; track shift.start) {
                <div class="day-shift pointer-events-none absolute flex items-center overflow-hidden rounded-lg px-2" [class.is-extra]="shift.extra"
                  [style.top.rem]="gapRem" [style.height.rem]="stripRem"
                  [style.left.%]="x(shift.start)" [style.width.%]="x(shift.end) - x(shift.start)">
                  <span class="truncate text-[0.68rem] font-semibold text-teal-900">{{ shift.extra ? 'Extra shift ' : 'Shift ' }}{{ shift.start }}–{{ shift.end }}</span>
                </div>
                <!-- Underneath: a faint band for the shift's hours, so you can see which tasks fall inside it -->
                <div class="shift-span pointer-events-none absolute bottom-0 rounded-b-lg" [style.top.rem]="gapRem + stripRem"
                  [style.left.%]="x(shift.start)" [style.width.%]="x(shift.end) - x(shift.start)"></div>
              }
              @for (off of row.timeOff; track off.start) {
                <div class="shift-class pointer-events-none absolute flex items-center overflow-hidden rounded-lg px-2"
                  [style.top.rem]="gapRem" [style.height.rem]="stripRem"
                  [style.left.%]="x(off.start)" [style.width.%]="x(off.end) - x(off.start)" [title]="'Time off ' + off.start + '–' + off.end">
                  <span class="truncate text-[0.68rem] font-semibold text-slate-600">Off {{ off.start }}–{{ off.end }}</span>
                </div>
              }
              @if (row.cancelled) {
                <span class="pointer-events-none absolute left-3 text-xs font-semibold text-slate-500" [style.top.rem]="gapRem + 0.15">Day off</span>
              }
              <!-- Below: their tasks -->
              @for (placed of row.tasks; track placed.task.id) {
                <ng-container *ngTemplateOutlet="taskBlock; context: { $implicit: placed, top: tasksTop }" />
              }
              <ng-container *ngTemplateOutlet="nowLine" />
            </div>
          </div>
        }
      </div>
    </div>

    <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
      <span class="flex items-center gap-1.5"><span class="day-shift inline-block h-3.5 w-7 rounded"></span> Shift (working)</span>
      <span class="flex items-center gap-1.5"><span class="day-shift is-extra inline-block h-3.5 w-7 rounded"></span> Extra shift</span>
      <span class="flex items-center gap-1.5"><span class="task-card is-assigned inline-block h-3.5 w-7 rounded"></span> Task</span>
      <span class="flex items-center gap-1.5"><span class="task-card is-unassigned inline-block h-3.5 w-7 rounded"></span> Unassigned task</span>
      <span class="flex items-center gap-1.5"><span class="task-card is-done inline-block h-3.5 w-7 rounded"></span> Done</span>
      <span class="flex items-center gap-1.5"><span class="shift-class inline-block h-3.5 w-7 rounded"></span> Time off</span>
      @if (isToday()) { <span class="flex items-center gap-1.5"><span class="inline-block h-3.5 w-0.5 bg-rose-500"></span> Now</span> }
      <span>{{ hint() }}</span>
    </p>

    <!-- Hour lines, behind everything in a row -->
    <ng-template #grid>
      @for (hour of hourMarks(); track hour) {
        <span class="pointer-events-none absolute inset-y-0 w-px bg-slate-300/40" [style.left.%]="x(hour)"></span>
      }
    </ng-template>

    <ng-template #nowLine>
      @if (isToday() && now() >= range().start && now() <= range().end) {
        <span class="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-rose-500" [style.left.%]="x(now())"></span>
      }
    </ng-template>

    <ng-template #taskBlock let-placed let-top="top">
      <button type="button" class="task-card absolute z-[5] flex items-center gap-1.5 overflow-hidden rounded-lg px-2 text-left text-xs"
        [attr.data-task]="placed.task.id" [class.task-highlight]="highlight() === placed.task.id" [appTaskDrag]="placed.task" [appTaskDragOff]="!canMoveTasks()"
        [class]="tone(placed.task)"
        [style.top.rem]="top + placed.lane * laneRem" [style.height.rem]="laneRem - gapRem"
        [style.left.%]="x(placed.task.startTime)" [style.width]="'max(8.5rem, ' + (x(placed.task.endTime) - x(placed.task.startTime)) + '%)'"
        [attr.aria-label]="placed.task.title + ', ' + placed.task.startTime + ' to ' + placed.task.endTime + ', ' + status(placed.task) + (placed.task.assignee ? ', ' + placed.task.assignee.name : '') + (placed.offShift ? ', outside their shift' : '')"
        [title]="placed.task.startTime + '–' + placed.task.endTime + ' ' + placed.task.title + ' · ' + placed.task.location"
        (click)="openTask.emit(placed.task)">
        <span class="shrink-0 font-semibold tabular-nums text-slate-500">{{ placed.task.startTime }}</span>
        <span class="truncate font-medium text-slate-900">{{ placed.task.title }}</span>
        <span class="hidden truncate text-slate-500 xl:inline">· {{ placed.task.location }}</span>
        @if (placed.offShift) { <span class="ml-auto shrink-0 rounded bg-rose-100 px-1 text-[0.62rem] font-semibold text-rose-800" title="Not inside their shift">⚠ off shift</span> }
        @else if (placed.task.claimedOffShift) { <span title="Claimed while not on shift">⚠</span> }
      </button>
    </ng-template>
  `,
  imports: [NgTemplateOutlet, TimeDrag, TaskDrag, TaskDrop],
})
export class DayTimeline implements OnDestroy {
  readonly date = input.required<string>();
  readonly week = input.required<Week>();
  /** The week's tasks; this view picks out the day's. */
  readonly tasks = input.required<Task[]>();
  readonly highlight = input<number | null>(null);

  readonly openTask = output<Task>();
  readonly addTask = output<NewTaskAt>();
  readonly editSchedule = output<Student>();
  readonly moveTask = output<TaskMoved>();
  /** Student portal: a time dragged across your own row. */
  readonly requestChange = output<ChangeAt>();

  /** What may be done here (all true on the admin Planner). */
  readonly canAddTasks = input(true);
  readonly canMoveTasks = input(true);
  readonly canEditSchedules = input(true);
  /** Student portal: who's looking. Their row is marked "You", and dragging across it asks for a shift change. */
  readonly ownStudentId = input<number | null>(null);

  protected readonly laneRem = LANE_REM;
  protected readonly stripRem = STRIP_REM;
  protected readonly gapRem = GAP_REM;
  /** Where tasks start in a student's row: below the shift strip. */
  protected readonly tasksTop = GAP_REM + STRIP_REM + GAP_REM;
  /** Minutes after midnight, now; ticks every minute for the "now" line. */
  protected readonly now = signal(this.minutesNow());
  private readonly timer = setInterval(() => this.now.set(this.minutesNow()), 60_000);

  protected readonly isToday = computed(() => this.date() === new Date().toLocaleDateString('en-CA'));
  protected readonly dayTasks = computed(() => this.tasks().filter((task) => task.date === this.date() && task.status !== 'CANCELLED'));
  protected readonly unassigned = computed(() => lanes(this.dayTasks().filter((task) => task.status === 'UNASSIGNED')));
  protected readonly unassignedLanes = computed(() => laneCount(this.unassigned()));

  /** One row per student: their shifts, time off and tasks that day. */
  protected readonly rows = computed(() => this.week().students.map((student) => {
    const day = student.days.find((d) => d.date === this.date());
    const shifts = day?.shifts ?? [];
    const tasks = lanes(this.dayTasks().filter((task) => task.assignee?.id === student.studentId))
      .map((placed) => ({ ...placed, offShift: placed.task.status === 'ASSIGNED' && !insideShift(placed.task, shifts) }));
    return {
      student,
      shifts,
      timeOff: day?.timeOff ?? [],
      cancelled: day?.cancelled ?? false,
      hours: Math.round(shifts.reduce((sum, s) => sum + minutes(s.end) - minutes(s.start), 0) / 6) / 10,
      tasks,
      lanes: laneCount(tasks),
    };
  }));

  /** The hours shown: 7 AM to 7 PM, stretched to fit any shift or task outside that. */
  protected readonly range = computed(() => {
    const times = [
      ...this.dayTasks().flatMap((task) => [minutes(task.startTime), minutes(task.endTime)]),
      ...this.rows().flatMap((row) => row.shifts.flatMap((s) => [minutes(s.start), minutes(s.end)])),
    ];
    const first = Math.min(7 * 60, ...times);
    const last = Math.max(19 * 60, ...times);
    return { start: Math.floor(first / 60) * 60, end: Math.ceil(last / 60) * 60 };
  });

  protected readonly hourMarks = computed(() => {
    const marks: number[] = [];
    for (let at = this.range().start; at <= this.range().end; at += 60) {
      marks.push(at);
    }
    return marks;
  });

  /**
   * Where a narrow screen (a phone, a tablet) should start looking, as minutes into the day: on
   * today, an hour before now (or the next shift or task, if that's later); on other days, the
   * first shift or task. Null when the day is empty.
   */
  private readonly startAt = computed(() => {
    const starts = [
      ...this.dayTasks().map((task) => minutes(task.startTime)),
      ...this.rows().flatMap((row) => row.shifts.map((s) => minutes(s.start))),
    ];
    const first = starts.length ? Math.min(...starts) : null;
    if (this.isToday()) {
      const upcoming = starts.filter((at) => at >= this.now());
      return upcoming.length && Math.min(...upcoming) - this.now() > 60 ? Math.min(...upcoming) : this.now() - 60;
    }
    return first;
  });
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private scrolledFor: string | null = null;

  constructor() {
    // When the hours don't all fit, scroll them so the day's first shift or task (or now) is in
    // view, half an hour early. Once per date, so it never fights someone scrolling by hand.
    afterRenderEffect(() => {
      const box = this.scroller()?.nativeElement;
      const at = this.startAt();
      if (!box || at === null || this.scrolledFor === this.date()) {
        return;
      }
      this.scrolledFor = this.date();
      // Everything fits (the last hour's label always pokes out a few pixels; that isn't scrolling)
      if (box.scrollWidth - box.clientWidth < 40) {
        return;
      }
      const names = box.querySelector<HTMLElement>('.tl-name')?.offsetWidth ?? 0;
      const hours = box.scrollWidth - names;
      box.scrollLeft = Math.max(0, (Math.max(0, this.x(at - 30)) / 100) * hours);
    });
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  /** Where a time sits across the day, as a percentage of the width. */
  protected x(time: string | number): number {
    const at = typeof time === 'string' ? minutes(time) : time;
    const { start, end } = this.range();
    return ((at - start) / (end - start)) * 100;
  }

  /** A row fits its lines of tasks, plus the shift strip above them in a student's row. */
  protected rowHeight(laneTotal: number, withStrip: boolean): number {
    const top = withStrip ? this.tasksTop : GAP_REM;
    return Math.max(4, top + laneTotal * LANE_REM + GAP_REM);
  }

  /** 13 * 60 → "1 PM" */
  protected hourLabel(at: number): string {
    const hour = at / 60;
    return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  protected status(task: Task): string {
    return STATUS_LABEL[task.status];
  }

  protected tone(task: Task): string {
    return taskTone(task.status);
  }

  protected isMe(student: Student): boolean {
    return student.studentId === this.ownStudentId();
  }

  /** Dragging in a student's row: your own asks for a shift change; others' add a task, if you may. */
  protected canPickOn(student: Student): boolean {
    return this.isMe(student) || this.canAddTasks();
  }

  protected rowHint(student: Student): string {
    if (this.isMe(student)) {
      return 'Drag across your row to ask to work then';
    }
    return this.canAddTasks() ? 'Drag (or click) to add a task for ' + student.name + ' at that time' : '';
  }

  /** What dragging does here, for the legend. */
  protected readonly hint = computed(() => {
    const parts: string[] = [];
    if (this.ownStudentId() !== null) {
      parts.push('Drag across your own row to ask to work then.');
    }
    if (this.canAddTasks()) {
      parts.push('Drag across a row to add a task for that time (a click makes a 30-minute one).');
    }
    if (this.canMoveTasks()) {
      parts.push('Drag a task onto someone’s row to give it to them.');
    }
    return parts.join(' ');
  });

  /** A time picked by dragging (or clicking) in a row: a new task then, for that student or nobody yet. */
  protected picked(time: PickedTime, student?: Student): void {
    if (student && this.isMe(student)) {
      this.requestChange.emit({ startTime: clock(time.start), endTime: clock(time.end) });
      return;
    }
    this.addTask.emit({ startTime: clock(time.start), minutes: time.end - time.start, student, unassigned: !student });
  }

  private minutesNow(): number {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}

/** Gives each task the first line of its row where it doesn't overlap an earlier one. */
function lanes(tasks: Task[]): Placed[] {
  const ends: number[] = [];
  return [...tasks].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((task) => {
    let lane = ends.findIndex((end) => end <= minutes(task.startTime));
    if (lane === -1) {
      lane = ends.length;
    }
    ends[lane] = Math.max(minutes(task.endTime), minutes(task.startTime) + 100); // short tasks are drawn wider, to fit their label
    return { task, lane };
  });
}

/** Whether a task sits entirely inside one of the shifts. */
function insideShift(task: Task, shifts: { start: string; end: string }[]): boolean {
  return shifts.some((shift) => minutes(shift.start) <= minutes(task.startTime) && minutes(task.endTime) <= minutes(shift.end));
}

function laneCount(placed: Placed[]): number {
  return Math.max(1, ...placed.map((p) => p.lane + 1));
}
