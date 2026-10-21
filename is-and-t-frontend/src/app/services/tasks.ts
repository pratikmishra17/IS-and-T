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
  building: string;
  room: string;
  employee: { name: string; email: string | null; phone: string | null; department: string | null };
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
  building: string;
  room: string;
  employeeName: string;
  employeeEmail: string;
  employeePhone: string;
  employeeDepartment: string;
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
