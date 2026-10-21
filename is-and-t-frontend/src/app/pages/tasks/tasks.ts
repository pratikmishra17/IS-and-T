import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../services/errors';
import { MyTaskApi, MyTasks, Task } from '../../services/tasks';
import { Confirm } from '../../ui/confirm';
import { SidePanel } from '../../ui/side-panel';
import { Toasts } from '../../ui/toast';

/**
 * User portal: Tasks (/tasks). The student's upcoming tasks with complete / couldn't complete /
 * hand off / opt out, unassigned tasks anyone can claim, and what they finished recently.
 */
@Component({
  selector: 'app-tasks',
  imports: [DatePipe, NgTemplateOutlet, FormsModule, SidePanel],
  templateUrl: './tasks.html',
})
export class Tasks implements OnInit {
  private readonly api = inject(MyTaskApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  protected readonly tasks = signal<MyTasks | null>(null);
  protected readonly busyId = signal<number | null>(null);
  /** Task ids whose details are expanded. */
  protected readonly expanded = signal(new Set<number>());
  protected readonly onlyMyShifts = signal(true);
  protected readonly today = new Date().toLocaleDateString('en-CA');

  /** Your tasks under "Today", "Tomorrow" and one heading per later day. */
  protected readonly upcomingByDay = computed(() => {
    const groups: { date: string; tasks: Task[] }[] = [];
    for (const task of this.tasks()?.upcoming ?? []) {
      const last = groups.at(-1);
      if (last?.date === task.date) {
        last.tasks.push(task);
      } else {
        groups.push({ date: task.date, tasks: [task] });
      }
    }
    return groups;
  });

  protected readonly available = computed(() => {
    const all = this.tasks();
    if (!all) {
      return [];
    }
    const mine = new Set(all.availableDuringMyShifts);
    return this.onlyMyShifts() ? all.available.filter((task) => mine.has(task.id)) : all.available;
  });
  protected readonly hiddenAvailable = computed(() => (this.tasks()?.available.length ?? 0) - this.available().length);

  // One panel at a time: finishing a task (done or not) or handing it off.
  protected readonly panel = signal<{ mode: 'complete' | 'not-completed' | 'hand-off'; task: Task } | null>(null);
  protected notes = '';
  protected used: Record<number, number> = {};
  protected colleagues: { id: number; name: string }[] = [];
  protected handOffTo: number | null = null;
  protected readonly panelError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  protected dayLabel(date: string): string {
    const tomorrow = new Date(`${this.today}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date === this.today ? 'Today' : date === tomorrow.toLocaleDateString('en-CA') ? 'Tomorrow' : '';
  }

  protected toggle(task: Task): void {
    const next = new Set(this.expanded());
    if (!next.delete(task.id)) {
      next.add(task.id);
    }
    this.expanded.set(next);
  }

  protected openComplete(task: Task): void {
    this.notes = '';
    this.used = Object.fromEntries(task.items.filter((i) => i.status === 'RESERVED').map((i) => [i.id, i.quantityPlanned]));
    this.open('complete', task);
  }

  protected openNotCompleted(task: Task): void {
    this.notes = '';
    this.open('not-completed', task);
  }

  protected async openHandOff(task: Task): Promise<void> {
    this.colleagues = [];
    this.handOffTo = null;
    this.open('hand-off', task);
    try {
      this.colleagues = await this.api.colleagues(task.id);
      this.handOffTo = this.colleagues[0]?.id ?? null;
    } catch (error) {
      this.panelError.set(errorMessage(error));
    }
  }

  protected async submitPanel(): Promise<void> {
    const current = this.panel();
    if (!current) {
      return;
    }
    const { mode, task } = current;
    this.busyId.set(task.id);
    this.panelError.set(null);
    try {
      if (mode === 'complete') {
        await this.api.complete(task.id, this.notes, this.used);
        this.toasts.success('Marked as completed. Thanks!');
      } else if (mode === 'not-completed') {
        await this.api.notCompleted(task.id, this.notes);
        this.toasts.success('Recorded. Admins can see why it couldn’t be completed.');
      } else if (this.handOffTo !== null) {
        const handed = await this.api.handOff(task.id, this.handOffTo);
        this.toasts.success(`Handed to ${handed.assignee?.name}, who was emailed.`);
      }
      this.panel.set(null);
      await this.reload();
    } catch (error) {
      this.panelError.set(errorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  protected async optOut(task: Task): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Opt out of “${task.title}”?`,
      message: 'It goes to another student on shift if there is one; otherwise the others are asked to claim it.',
      confirmLabel: 'Opt out',
    });
    if (ok) {
      await this.run(task, async () => {
        const result = await this.api.optOut(task.id);
        this.toasts.success(result.assignee ? `It went to ${result.assignee.name}.` : 'Nobody else was on shift, so it’s waiting to be claimed.');
      });
    }
  }

  protected async claim(task: Task): Promise<void> {
    await this.run(task, async () => {
      const result = await this.api.claim(task.id);
      this.toasts.success(result.claimedOffShift
        ? 'It’s yours. You aren’t on shift for all of it, so admins will see a note.'
        : 'It’s yours.');
    });
  }

  protected panelTitle(): string {
    const current = this.panel();
    return !current ? '' : current.mode === 'complete' ? 'Complete task' : current.mode === 'not-completed' ? 'Couldn’t complete' : 'Hand off';
  }

  private open(mode: 'complete' | 'not-completed' | 'hand-off', task: Task): void {
    this.panelError.set(null);
    this.panel.set({ mode, task });
  }

  private async run(task: Task, action: () => Promise<void>): Promise<void> {
    this.busyId.set(task.id);
    try {
      await action();
      await this.reload();
    } catch (error) {
      this.toasts.error(errorMessage(error));
      await this.reload();
    } finally {
      this.busyId.set(null);
    }
  }

  private async reload(): Promise<void> {
    try {
      this.tasks.set(await this.api.list());
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }
}
