import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { errorMessage } from '../../services/errors';
import { MyDay, PortalApi, at, countdown } from '../../services/portal';
import { Task } from '../../services/tasks';

/** One line of today's timeline: a shift or a task. */
interface TimelineEntry {
  start: string;
  end: string;
  kind: 'shift' | 'task';
  label: string;
  detail: string;
  task?: Task;
}

/**
 * User portal: Home (/home). For students, "my day": what's next, today's shifts and tasks in time
 * order, this week's hours, and tasks up for grabs. Admins get a pointer to the admin portal.
 */
@Component({
  selector: 'app-home',
  imports: [DatePipe, RouterLink],
  templateUrl: './home.html',
})
export class Home implements OnInit, OnDestroy {
  private readonly api = inject(PortalApi);
  protected readonly auth = inject(Auth);

  protected readonly day = signal<MyDay | null>(null);
  protected readonly error = signal<string | null>(null);
  /** Ticks every 30 seconds so countdowns stay current without reloading. */
  protected readonly now = signal(new Date());
  private timer?: ReturnType<typeof setInterval>;

  protected readonly greeting = computed(() => {
    const hour = this.now().getHours();
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  });

  protected readonly timeline = computed<TimelineEntry[]>(() => {
    const day = this.day();
    if (!day) {
      return [];
    }
    const shifts: TimelineEntry[] = day.shifts.map((s) => ({
      start: s.start, end: s.end, kind: 'shift', label: s.extra ? 'Extra shift' : 'On shift', detail: '',
    }));
    const tasks: TimelineEntry[] = day.tasks.map((t) => ({
      start: t.startTime, end: t.endTime, kind: 'task', label: t.title, detail: t.location, task: t,
    }));
    return [...shifts, ...tasks].sort((a, b) => a.start.localeCompare(b.start) || (a.kind === 'shift' ? -1 : 1));
  });

  /** The next of today's tasks still to come (or happening now). */
  protected readonly nextTask = computed(() => {
    const day = this.day();
    const now = this.now();
    return day?.tasks
      .filter((t) => t.status === 'ASSIGNED' && at(t.date, t.endTime) > now)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;
  });

  protected readonly weekPercent = computed(() => {
    const day = this.day();
    return day?.weeklyHourLimit ? Math.min(100, Math.round((day.weekHours / day.weeklyHourLimit) * 100)) : 0;
  });

  async ngOnInit(): Promise<void> {
    this.timer = setInterval(() => this.now.set(new Date()), 30_000);
    try {
      this.day.set(await this.api.today());
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
  }

  protected startsIn(task: Task): string {
    return countdown(this.now(), at(task.date, task.startTime));
  }
}
