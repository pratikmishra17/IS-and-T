import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { errorMessage } from '../../../services/errors';
import { InventoryApi, Item, StorageLocation } from '../../../services/inventory';
import { SettingsApi } from '../../../services/settings';
import { AdminTaskApi, Backorder, Candidate, STATUS_LABEL, Task, TaskEvent, TaskRequest, TaskStatus } from '../../../services/tasks';
import { Confirm } from '../../../ui/confirm';
import { SidePanel } from '../../../ui/side-panel';
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
 * Admin portal: Tasks (/admin/tasks). A week board, a list, and backorders. Creating a task assigns
 * it automatically to the least busy student on shift; the result and any warnings are shown.
 */
@Component({
  selector: 'app-admin-tasks',
  imports: [DatePipe, NgTemplateOutlet, FormsModule, SidePanel],
  templateUrl: './tasks.html',
})
export class AdminTasks implements OnInit {
  private readonly api = inject(AdminTaskApi);
  private readonly inventory = inject(InventoryApi);
  private readonly settings = inject(SettingsApi);
  /** From Settings; pre-filled on new tasks. */
  private defaultDuration = 30;
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statuses: TaskStatus[] = ['UNASSIGNED', 'ASSIGNED', 'COMPLETED', 'NOT_COMPLETED', 'CANCELLED'];
  protected readonly today = new Date().toLocaleDateString('en-CA');
  protected readonly tab = signal<'week' | 'list' | 'backorders'>('week');
  protected readonly weekStart = signal(mondayOf(this.today));
  protected readonly tasks = signal<Task[]>([]);
  protected readonly backorders = signal<Backorder[]>([]);
  protected readonly loading = signal(true);
  protected readonly statusFilter = signal<TaskStatus | 'all'>('all');

  protected readonly days = computed(() => [0, 1, 2, 3, 4].map((i) => addDays(this.weekStart(), i)));
  protected readonly byDay = computed(() => {
    const map = new Map<string, Task[]>();
    for (const day of this.days()) {
      map.set(day, this.tasks().filter((task) => task.date === day));
    }
    return map;
  });
  protected readonly weekendTasks = computed(() => this.tasks().filter((task) => !this.days().includes(task.date)));
  protected readonly listed = computed(() => this.tasks().filter((t) => this.statusFilter() === 'all' || t.status === this.statusFilter()));
  protected readonly unassignedCount = computed(() => this.tasks().filter((t) => t.status === 'UNASSIGNED').length);

  // Detail panel
  protected readonly detail = signal<{ task: Task; history: TaskEvent[] } | null>(null);
  protected readonly candidates = signal<Candidate[]>([]);
  protected readonly busy = signal(false);
  protected readonly detailWarnings = signal<string[]>([]);

  // Form panel (new / edit / follow-up)
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly items = signal<Item[]>([]);
  protected readonly rooms = signal<StorageLocation[]>([]);
  protected readonly formError = signal<string | null>(null);
  protected draft: TaskRequest = this.emptyDraft();

  async ngOnInit(): Promise<void> {
    await this.load();
    await this.guard(async () => {
      this.defaultDuration = (await this.settings.get()).defaultTaskDuration;
    });
    this.loading.set(false);
  }

  protected async moveWeek(weeks: number): Promise<void> {
    this.weekStart.set(weeks === 0 ? mondayOf(this.today) : addDays(this.weekStart(), 7 * weeks));
    await this.load();
  }

  protected async switchTab(tab: 'week' | 'list' | 'backorders'): Promise<void> {
    this.tab.set(tab);
    if (tab === 'backorders') {
      await this.guard(async () => this.backorders.set(await this.api.backorders()));
    }
  }

  // ---- Detail ----

  protected async open(task: Task): Promise<void> {
    this.detailWarnings.set([]);
    this.candidates.set([]);
    await this.guard(async () => {
      this.detail.set(await this.api.detail(task.id));
      if (task.status === 'UNASSIGNED' || task.status === 'ASSIGNED') {
        this.candidates.set(await this.api.candidates(task.id));
      }
    });
  }

  protected async assign(value: string): Promise<void> {
    const task = this.detail()?.task;
    if (!task) {
      return;
    }
    await this.act(async () => {
      const saved = await this.api.assign(task.id, value === 'none' ? null : Number(value));
      this.detailWarnings.set(saved.warnings);
      this.toasts.success(saved.result.assignee ? `Assigned to ${saved.result.assignee.name}, who was emailed.` : 'The task is unassigned.');
    });
  }

  protected async cancelTask(): Promise<void> {
    const task = this.detail()?.task;
    if (!task) {
      return;
    }
    const ok = await this.confirm.ask({
      title: `Cancel “${task.title}”?`,
      message: task.assignee ? `${task.assignee.name} will be emailed that it’s cancelled. Reserved items go back into stock.` : 'Reserved items go back into stock.',
      confirmLabel: 'Cancel task',
      danger: true,
    });
    if (ok) {
      await this.act(async () => {
        await this.api.cancel(task.id);
        this.toasts.success('The task was cancelled.');
      });
    }
  }

  protected label(status: TaskStatus): string {
    return STATUS_LABEL[status];
  }

  protected isOpen(task: Task): boolean {
    return task.status === 'UNASSIGNED' || task.status === 'ASSIGNED';
  }

  protected hasBackorders(task: Task): boolean {
    return task.items.some((item) => item.status === 'BACKORDERED');
  }

  // ---- Form ----

  protected async openNew(date?: string): Promise<void> {
    this.editingId.set(null);
    this.draft = this.emptyDraft();
    if (date) {
      this.draft.date = date;
    }
    await this.openForm();
  }

  protected async openEdit(task: Task): Promise<void> {
    this.editingId.set(task.id);
    this.draft = {
      type: task.type, title: task.title, description: task.description ?? '', date: task.date, startTime: task.startTime,
      durationMinutes: task.durationMinutes, building: task.building, room: task.room, employeeName: task.employee.name,
      employeeEmail: task.employee.email ?? '', employeePhone: task.employee.phone ?? '', employeeDepartment: task.employee.department ?? '',
      items: task.items.filter((i) => i.status === 'RESERVED').map((i) => ({ itemId: i.itemId, locationId: i.locationId, quantity: i.quantityPlanned })),
      parentTaskId: task.parentTaskId,
    };
    await this.openForm();
  }

  /** A new deployment for whatever a completed one still owes, prefilled from the original. */
  protected async openFollowUp(task: Task): Promise<void> {
    this.editingId.set(null);
    this.draft = {
      ...this.emptyDraft(), type: 'DEPLOYMENT', title: `Follow-up: ${task.title}`, building: task.building, room: task.room,
      employeeName: task.employee.name, employeeEmail: task.employee.email ?? '', employeePhone: task.employee.phone ?? '',
      employeeDepartment: task.employee.department ?? '', parentTaskId: task.id,
      items: task.items.filter((i) => i.status === 'BACKORDERED')
        .map((i) => ({ itemId: i.itemId, locationId: i.locationId, quantity: i.quantityPlanned - (i.quantityUsed ?? 0) })),
    };
    await this.openForm();
  }

  protected addItemRow(): void {
    this.draft.items = [...this.draft.items, { itemId: this.items()[0]?.id ?? null, locationId: this.rooms()[0]?.id ?? null, quantity: 1 }];
  }

  protected removeItemRow(index: number): void {
    this.draft.items = this.draft.items.filter((_, i) => i !== index);
  }

  /** "3 available" for an item, to help pick quantities. */
  protected availability(itemId: number | null): string {
    const item = this.items().find((i) => i.id === itemId);
    return item ? `${item.available} available` : '';
  }

  protected async save(form: NgForm): Promise<void> {
    if (form.invalid || this.draft.items.some((i) => !i.itemId || !i.locationId || i.quantity < 1)) {
      form.control.markAllAsTouched();
      this.formError.set('Please fill in the required fields, and choose an item, a room and a quantity for each item line.');
      return;
    }
    const editing = this.editingId();
    this.busy.set(true);
    this.formError.set(null);
    try {
      const saved = await this.api.save(this.draft, editing ?? undefined);
      this.formOpen.set(false);
      const who = saved.result.assignee ? `assigned to ${saved.result.assignee.name}` : 'unassigned';
      this.toasts.success(editing ? `Saved; ${who}.` : `Task created and ${who}.`);
      for (const warning of saved.warnings) {
        this.toasts.error(warning);
      }
      this.weekStart.set(mondayOf(saved.result.date));
      await this.load();
      await this.open(saved.result);
      this.detailWarnings.set(saved.warnings);
    } catch (error) {
      this.formError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Helpers ----

  private async openForm(): Promise<void> {
    this.formError.set(null);
    this.detail.set(null);
    await this.guard(async () => {
      const [items, rooms] = await Promise.all([this.inventory.items(), this.inventory.locations()]);
      this.items.set(items.filter((item) => !item.archived));
      this.rooms.set(rooms);
    });
    this.formOpen.set(true);
  }

  private async load(): Promise<void> {
    await this.guard(async () => this.tasks.set(await this.api.list(this.weekStart(), addDays(this.weekStart(), 6))));
  }

  /** Runs an action on the open task, then refreshes it and the week. */
  private async act(action: () => Promise<void>): Promise<void> {
    const task = this.detail()?.task;
    this.busy.set(true);
    try {
      await action();
      await this.load();
      if (task) {
        const warnings = this.detailWarnings();
        await this.open(task);
        this.detailWarnings.set(warnings);
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async guard(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  private emptyDraft(): TaskRequest {
    return {
      type: 'DEPLOYMENT', title: '', description: '', date: this.today, startTime: '10:00', durationMinutes: this.defaultDuration,
      building: '', room: '', employeeName: '', employeeEmail: '', employeePhone: '', employeeDepartment: '',
      items: [], parentTaskId: null,
    };
  }
}
