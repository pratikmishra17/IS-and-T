import { DatePipe } from '@angular/common';
import { Component, inject, output, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { errorMessage } from '../services/errors';
import { InventoryApi, Item, StorageLocation } from '../services/inventory';
import { SettingsApi } from '../services/settings';
import { AdminTaskApi, Candidate, STATUS_LABEL, SUPPLY_SUGGESTIONS, Task, TaskEvent, TaskRequest, TaskStatus } from '../services/tasks';
import { Confirm } from './confirm';
import { SidePanel } from './side-panel';
import { Toasts } from './toast';

/**
 * A task's side panels: its details (history, reassign, cancel) and the new/edit/follow-up form.
 * Used by the Planner: open(task), openNew({ date, student, startTime, minutes, unassigned }),
 * openEdit(task), openFollowUp(task). (changed) fires after anything is saved, so the page can
 * reload what it shows.
 */
/** What a new task starts with (all optional). */
export interface NewTaskOptions {
  date?: string;
  student?: { id: number; name: string };
  startTime?: string;
  minutes?: number;
  /** Start with "Nobody yet" instead of "Automatically". */
  unassigned?: boolean;
}

@Component({
  selector: 'app-task-panels',
  imports: [DatePipe, FormsModule, SidePanel],
  templateUrl: './task-panels.html',
})
export class TaskPanels {
  private readonly api = inject(AdminTaskApi);
  private readonly inventory = inject(InventoryApi);
  private readonly settings = inject(SettingsApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  /** From Settings; pre-filled on new tasks. */
  private defaultDuration: number | null = null;

  /** A task was created, changed, reassigned or cancelled. */
  readonly changed = output<Task | undefined>();

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly today = new Date().toLocaleDateString('en-CA');

  // Detail panel
  protected readonly detail = signal<{ task: Task; history: TaskEvent[] } | null>(null);
  protected readonly candidates = signal<Candidate[]>([]);
  protected readonly busy = signal(false);
  protected readonly detailWarnings = signal<string[]>([]);

  // Form panel (new / edit / follow-up)
  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  /**
   * New tasks: who does it. 'auto' = the least busy student on shift, 'none' = leave it unassigned,
   * or a student's id (as text, like a <select> value).
   */
  protected who = 'auto';
  /** Every active student, free ones first, for "Who does it" at the time the form says. */
  protected readonly available = signal<Candidate[]>([]);
  private availabilityTimer?: ReturnType<typeof setTimeout>;
  protected readonly items = signal<Item[]>([]);
  protected readonly rooms = signal<StorageLocation[]>([]);
  protected readonly formError = signal<string | null>(null);
  protected draft: TaskRequest = this.emptyDraft();

  // ---- Detail ----


  /** Opens a task's details: history, reassigning, cancelling, editing. */
  async open(task: Task): Promise<void> {
    this.detailWarnings.set([]);
    this.candidates.set([]);
    await this.guard(async () => {
      // Load the students first: the dropdown can only show who it's assigned to once they're there.
      const [detail, candidates] = await Promise.all([
        this.api.detail(task.id),
        task.status === 'UNASSIGNED' || task.status === 'ASSIGNED' ? this.api.candidates(task.id) : Promise.resolve([]),
      ]);
      this.candidates.set(candidates);
      this.detail.set(detail);
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

  /**
   * A new task, optionally on a date and time (and for how long), for a particular student
   * (preselected in "Who does it"), or left unassigned; otherwise it's assigned automatically.
   */
  async openNew(options: NewTaskOptions = {}): Promise<void> {
    await this.loadDefaults();
    this.editingId.set(null);
    this.who = options.student ? String(options.student.id) : options.unassigned ? 'none' : 'auto';
    this.draft = this.emptyDraft();
    if (options.date) {
      this.draft.date = options.date;
    }
    if (options.startTime) {
      this.draft.startTime = options.startTime;
    }
    if (options.minutes) {
      this.draft.durationMinutes = options.minutes;
    }
    await this.openForm();
  }

  /** Date, start or length changed: check again who'd be free then (after a short pause in typing). */
  protected timeChanged(): void {
    clearTimeout(this.availabilityTimer);
    this.availabilityTimer = setTimeout(() => void this.loadAvailability(), 300);
  }

  /** The student picked in "Who does it", if they wouldn't be free then. */
  protected unavailablePick(): Candidate | null {
    const pick = this.available().find((c) => String(c.id) === this.who);
    return pick && !pick.eligible ? pick : null;
  }

  protected isFree(candidates: Candidate[]): Candidate[] {
    return candidates.filter((c) => c.eligible);
  }

  protected notFree(candidates: Candidate[]): Candidate[] {
    return candidates.filter((c) => !c.eligible);
  }

  /** The assignee of the open task, if they're not free then. */
  protected assigneeProblem(task: Task): Candidate | null {
    const current = this.candidates().find((c) => c.id === task.assignee?.id);
    return current && !current.eligible ? current : null;
  }

  async openEdit(task: Task): Promise<void> {
    this.editingId.set(task.id);
    this.draft = {
      type: task.type, title: task.title, description: task.description ?? '', date: task.date, startTime: task.startTime,
      durationMinutes: task.durationMinutes, location: task.location, employeeName: task.employee.name ?? '',
      employeeEmail: task.employee.email ?? '', employeePhone: task.employee.phone ?? '', supplies: task.supplies.map((s) => ({ ...s })),
      items: task.items.filter((i) => i.status === 'RESERVED').map((i) => ({ itemId: i.itemId, locationId: i.locationId, quantity: i.quantityPlanned })),
      parentTaskId: task.parentTaskId,
    };
    await this.openForm();
  }

  /** A new deployment for whatever a completed one still owes, prefilled from the original. */
  async openFollowUp(task: Task): Promise<void> {
    await this.loadDefaults();
    this.editingId.set(null);
    this.who = 'auto';
    this.draft = {
      ...this.emptyDraft(), type: 'DEPLOYMENT', title: `Follow-up: ${task.title}`, location: task.location,
      employeeName: task.employee.name ?? '', employeeEmail: task.employee.email ?? '', employeePhone: task.employee.phone ?? '',
      parentTaskId: task.id,
      items: task.items.filter((i) => i.status === 'BACKORDERED')
        .map((i) => ({ itemId: i.itemId, locationId: i.locationId, quantity: i.quantityPlanned - (i.quantityUsed ?? 0) })),
    };
    await this.openForm();
  }

  // ---- Things to bring ----

  protected readonly suggestions = SUPPLY_SUGGESTIONS;

  /** A suggestion clicked: add it, or bring one more if it's already on the list. */
  protected addSuggestion(name: string): void {
    const existing = this.draft.supplies.find((supply) => supply.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + 1);
    } else {
      this.draft.supplies = [...this.draft.supplies, { name, quantity: 1 }];
    }
  }

  protected addSupplyRow(): void {
    this.draft.supplies = [...this.draft.supplies, { name: '', quantity: 1 }];
  }

  protected removeSupplyRow(index: number): void {
    this.draft.supplies = this.draft.supplies.filter((_, i) => i !== index);
  }

  protected countOf(name: string): number {
    return this.draft.supplies.find((supply) => supply.name.toLowerCase() === name.toLowerCase())?.quantity ?? 0;
  }

  // ---- Reserving stock ----

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
    // Empty "things to bring" rows are just dropped.
    this.draft.supplies = this.draft.supplies
      .map((supply) => ({ name: supply.name.trim(), quantity: supply.quantity }))
      .filter((supply) => supply.name);
    if (form.invalid) {
      form.control.markAllAsTouched();
      this.formError.set('Please fill in the title, date, time and location.');
      return;
    }
    if (this.draft.supplies.some((supply) => !(supply.quantity >= 1 && supply.quantity <= 99))) {
      this.formError.set('Each thing to bring needs a quantity from 1 to 99.');
      return;
    }
    if (this.draft.items.some((i) => !i.itemId || !i.locationId || i.quantity < 1)) {
      this.formError.set('For each item reserved from stock, choose the item, the room and a quantity, or remove the line.');
      return;
    }
    const editing = this.editingId();
    this.busy.set(true);
    this.formError.set(null);
    try {
      // A particular student: create it unassigned, then give it to them (so nobody else is emailed first).
      const studentId = this.who === 'auto' || this.who === 'none' ? null : Number(this.who);
      const request = editing ? this.draft : { ...this.draft, autoAssign: this.who === 'auto' };
      let saved = await this.api.save(request, editing ?? undefined);
      if (!editing && studentId !== null) {
        const assigned = await this.api.assign(saved.result.id, studentId);
        saved = { result: assigned.result, warnings: [...new Set([...saved.warnings, ...assigned.warnings])] };
      }
      this.formOpen.set(false);
      const who = saved.result.assignee ? `assigned to ${saved.result.assignee.name}` : 'unassigned';
      this.toasts.success(editing ? `Saved; ${who}.` : `Task created and ${who}.`);
      for (const warning of saved.warnings) {
        this.toasts.error(warning);
      }
      // Back to the page, which shows (and highlights) where the task went. Edits reopen its details.
      this.changed.emit(saved.result);
      if (editing) {
        await this.open(saved.result);
        this.detailWarnings.set(saved.warnings);
      }
    } catch (error) {
      this.formError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  // ---- Helpers ----

  private async loadAvailability(): Promise<void> {
    const { date, startTime, durationMinutes } = this.draft;
    if (!date || !startTime || !(durationMinutes >= 5)) {
      return;
    }
    await this.guard(async () => this.available.set(await this.api.availability(date, startTime, durationMinutes)));
  }

  private async loadDefaults(): Promise<void> {
    if (this.defaultDuration === null) {
      await this.guard(async () => {
        this.defaultDuration = (await this.settings.get()).defaultTaskDuration;
      });
    }
  }

  private async openForm(): Promise<void> {
    this.formError.set(null);
    this.detail.set(null);
    await this.guard(async () => {
      const [items, rooms] = await Promise.all([this.inventory.items(), this.inventory.locations()]);
      this.items.set(items.filter((item) => !item.archived));
      this.rooms.set(rooms);
      if (!this.editingId()) {
        await this.loadAvailability();
      }
    });
    this.formOpen.set(true);
  }

  /** Runs an action on the open task, then refreshes it and the week. */
  private async act(action: () => Promise<void>): Promise<void> {
    const task = this.detail()?.task;
    this.busy.set(true);
    try {
      await action();
      this.changed.emit(task ?? undefined);
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
      type: 'DEPLOYMENT', title: '', description: '', date: this.today, startTime: '10:00', durationMinutes: this.defaultDuration ?? 30,
      location: '', employeeName: '', employeeEmail: '', employeePhone: '', supplies: [],
      items: [], parentTaskId: null,
    };
  }
}
