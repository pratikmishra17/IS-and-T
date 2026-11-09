import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Saved } from './schedule';

export type TaskType = 'DEPLOYMENT' | 'FIX';
export type TaskStatus = 'UNASSIGNED' | 'ASSIGNED' | 'COMPLETED' | 'NOT_COMPLETED' | 'CANCELLED';

export interface PlannedItem {
  id: number;
  itemId: number;
  itemName: string;
  locationId: number;
  locationLabel: string;
  quantityPlanned: number;
  quantityUsed: number | null;
  status: 'RESERVED' | 'FULFILLED' | 'BACKORDERED' | 'RELEASED';
}

/** Something to bring to a task: any text, with a quantity. */
export interface Supply {
  name: string;
  quantity: number;
}

/** Offered as one-click choices and while typing; anything else can be typed too. */
export const SUPPLY_SUGGESTIONS = [
  'Ultrawide', 'Dual Monitors', 'Dual Monitors (Both C-type)', 'Dual Monitors (Both Non C-type)',
  'Single Monitor (C-type)', 'Single Monitor (Non C-type)', 'Macbook', '14" Laptop', '15" Laptop',
  '16" Laptop', '17" Laptop', 'Keyboard', 'Mouse', 'Webcam',
];

/** The colour a task is drawn in (task-card / task-tick classes in styles.css), by status. */
export function taskTone(status: TaskStatus): string {
  switch (status) {
    case 'UNASSIGNED': return 'is-unassigned';
    case 'COMPLETED': return 'is-done';
    case 'ASSIGNED': return 'is-assigned';
    default: return 'is-closed';
  }
}

/** "2 × Dual Monitors, Webcam" */
export function suppliesText(supplies: Supply[]): string {
  return supplies.map((s) => (s.quantity === 1 ? s.name : `${s.quantity} × ${s.name}`)).join(', ');
}

/** A task. date/startTime/endTime are campus time ("2026-10-21", "09:30"). */
export interface Task {
  id: number;
  type: TaskType;
  title: string;
  description: string | null;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  /** Where it happens, typed freely ("BU 201"). */
  location: string;
  /** Who it's for; every field may be empty. */
  employee: { name: string | null; email: string | null; phone: string | null };
  /** Things to bring, typed by the admin. */
  supplies: Supply[];
  status: TaskStatus;
  assignee: { id: number; name: string } | null;
  claimedOffShift: boolean;
  outcomeNotes: string | null;
  finishedAt: string | null;
  parentTaskId: number | null;
  items: PlannedItem[];
}

export interface TaskRequest {
  type: TaskType;
  title: string;
  description: string;
  date: string;
  startTime: string;
  durationMinutes: number;
  location: string;
  employeeName: string;
  employeeEmail: string;
  employeePhone: string;
  supplies: Supply[];
  /** New tasks only: false leaves it unassigned instead of giving it to the least busy student on shift. */
  autoAssign?: boolean;
  items: { itemId: number | null; locationId: number | null; quantity: number }[];
  parentTaskId: number | null;
}

export interface TaskEvent {
  type: string;
  actor: string;
  detail: string | null;
  occurredAt: string;
}

export interface Candidate {
  id: number;
  name: string;
  /** On shift for the whole task and free then. */
  eligible: boolean;
  /** Why not, when not eligible: "not on shift for the whole time", "has another task then"… */
  note: string | null;
}

export interface Backorder {
  plannedItemId: number;
  itemName: string;
  locationLabel: string;
  missing: number;
  availableNow: number;
  task: Task;
}

export interface MyTasks {
  upcoming: Task[];
  available: Task[];
  /** Ids of available tasks that fall entirely inside one of your shifts. */
  availableDuringMyShifts: number[];
  recent: Task[];
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  UNASSIGNED: 'Unassigned', ASSIGNED: 'Assigned', COMPLETED: 'Completed', NOT_COMPLETED: 'Not completed', CANCELLED: 'Cancelled',
};

/** Admin portal: tasks. */
@Injectable({ providedIn: 'root' })
export class AdminTaskApi {
  private readonly http = inject(HttpClient);

  list(from: string, to: string): Promise<Task[]> {
    return firstValueFrom(this.http.get<Task[]>('/api/admin/tasks', { params: { from, to } }));
  }

  detail(id: number): Promise<{ task: Task; history: TaskEvent[] }> {
    return firstValueFrom(this.http.get<{ task: Task; history: TaskEvent[] }>(`/api/admin/tasks/${id}`));
  }

  save(request: TaskRequest, id?: number): Promise<Saved<Task>> {
    return firstValueFrom(id
      ? this.http.put<Saved<Task>>(`/api/admin/tasks/${id}`, request)
      : this.http.post<Saved<Task>>('/api/admin/tasks', request));
  }

  cancel(id: number): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/admin/tasks/${id}/cancel`, null));
  }

  candidates(id: number): Promise<Candidate[]> {
    return firstValueFrom(this.http.get<Candidate[]>(`/api/admin/tasks/${id}/candidates`));
  }

  /** Who'd be free for a task being written: every active student, with why not if not. */
  availability(date: string, start: string, minutes: number): Promise<Candidate[]> {
    return firstValueFrom(this.http.get<Candidate[]>('/api/admin/tasks/availability', { params: { date, start, minutes } }));
  }

  assign(id: number, studentId: number | null): Promise<Saved<Task>> {
    return firstValueFrom(this.http.post<Saved<Task>>(`/api/admin/tasks/${id}/assign`, { studentId }));
  }

  backorders(): Promise<Backorder[]> {
    return firstValueFrom(this.http.get<Backorder[]>('/api/admin/tasks/backorders'));
  }
}

/** User portal: the logged-in student's tasks. */
@Injectable({ providedIn: 'root' })
export class MyTaskApi {
  private readonly http = inject(HttpClient);

  list(): Promise<MyTasks> {
    return firstValueFrom(this.http.get<MyTasks>('/api/me/tasks'));
  }

  claim(id: number): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/me/tasks/${id}/claim`, null));
  }

  optOut(id: number): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/me/tasks/${id}/opt-out`, null));
  }

  colleagues(id: number): Promise<{ id: number; name: string }[]> {
    return firstValueFrom(this.http.get<{ id: number; name: string }[]>(`/api/me/tasks/${id}/colleagues`));
  }

  handOff(id: number, studentId: number): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/me/tasks/${id}/hand-off`, { studentId }));
  }

  complete(id: number, notes: string, used: Record<number, number>): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/me/tasks/${id}/complete`, { notes, used }));
  }

  notCompleted(id: number, notes: string): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/me/tasks/${id}/not-completed`, { notes }));
  }
}
