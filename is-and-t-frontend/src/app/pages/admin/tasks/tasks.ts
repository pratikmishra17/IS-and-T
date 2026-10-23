import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../../services/errors';
import { AdminTaskApi, Backorder, STATUS_LABEL, Task, TaskStatus } from '../../../services/tasks';
import { TaskPanels } from '../../../ui/task-panels';
import { Toasts } from '../../../ui/toast';

/** Campus-date helpers: dates are "YYYY-MM-DD" strings, handled at noon so time zones never shift the day. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-CA');
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return addDays(date, -((d.getDay() + 6) % 7));
}

/**
 * Admin portal: Tasks (/admin/tasks). The week's tasks as a filterable list, and backorders. The
 * week board with everyone's shifts is on the Planner. Creating a task assigns it automatically to
 * the least busy student on shift; the result and any warnings are shown.
 */
@Component({
  selector: 'app-admin-tasks',
  imports: [DatePipe, FormsModule, RouterLink, TaskPanels],
  templateUrl: './tasks.html',
})
export class AdminTasks implements OnInit {
  private readonly api = inject(AdminTaskApi);
  private readonly toasts = inject(Toasts);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statuses: TaskStatus[] = ['UNASSIGNED', 'ASSIGNED', 'COMPLETED', 'NOT_COMPLETED', 'CANCELLED'];
  protected readonly today = new Date().toLocaleDateString('en-CA');
  protected readonly tab = signal<'list' | 'backorders'>('list');
  protected readonly weekStart = signal(mondayOf(this.today));
  protected readonly tasks = signal<Task[]>([]);
  protected readonly backorders = signal<Backorder[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusFilter = signal<TaskStatus | 'all'>('all');

  protected readonly days = computed(() => [0, 1, 2, 3, 4].map((i) => addDays(this.weekStart(), i)));
  protected readonly listed = computed(() => this.tasks().filter((t) => this.statusFilter() === 'all' || t.status === this.statusFilter()));

  protected readonly panels = viewChild.required(TaskPanels);

  async ngOnInit(): Promise<void> {
    await this.load();
    this.loading.set(false);
  }

  protected async moveWeek(weeks: number): Promise<void> {
    this.weekStart.set(weeks === 0 ? mondayOf(this.today) : addDays(this.weekStart(), 7 * weeks));
    await this.load();
  }

  protected async switchTab(tab: 'list' | 'backorders'): Promise<void> {
    this.tab.set(tab);
    if (tab === 'backorders') {
      await this.guard(async () => this.backorders.set(await this.api.backorders()));
    }
  }

  protected label(status: TaskStatus): string {
    return STATUS_LABEL[status];
  }

  /** After a panel saved something: show that task's week, refreshed. */
  protected async refresh(task?: Task): Promise<void> {
    if (task) {
      this.weekStart.set(mondayOf(task.date));
    }
    await this.load();
    if (this.tab() === 'backorders') {
      await this.guard(async () => this.backorders.set(await this.api.backorders()));
    }
  }

  // ---- Helpers ----

  private async load(): Promise<void> {
    await this.guard(async () => this.tasks.set(await this.api.list(this.weekStart(), addDays(this.weekStart(), 6))));
  }

  private async guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }
}
