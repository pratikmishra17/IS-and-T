import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { User } from './auth';
import { InventoryApi, Item, StorageLocation } from './inventory';
import { Week } from './schedule';
import { Settings, SettingsApi } from './settings';
import { AdminTaskApi, Candidate, Task, TaskEvent, TaskRequest } from './tasks';
import { Saved } from './schedule';

/** What a student may do with the team's tasks (set by an admin on the Users page). Each level adds to the one before. */
export type TaskAccess = 'VIEW' | 'COMPLETE' | 'EDIT';

export const TASK_ACCESS_LABEL: Record<TaskAccess, string> = {
  VIEW: 'View only',
  COMPLETE: 'View + mark done',
  EDIT: 'Edit tasks',
};

export interface TeamAccess {
  studentId: number;
  name: string;
  access: TaskAccess;
}

export interface Offer {
  id: number;
  taskId: number;
  taskTitle: string;
  date: string;
  startTime: string;
  endTime: string;
  currentAssignee: string | null;
  studentId: number;
  studentName: string;
  note: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'CLOSED';
  createdAt: string;
  /** Whether the student is on shift and free for the whole task. */
  available: boolean;
  availabilityNote: string | null;
}

/** What "I can do this" did: took a task nobody had (claimed), or sent an offer to the admins. */
export interface OfferResult {
  claimed: boolean;
  task: Task;
  offer: Offer | null;
}

export type ChangeScope = 'ONE_DAY' | 'EVERY_WEEK';

export interface Hours {
  start: string;
  end: string;
}

export interface ShiftChange {
  id: number;
  studentId: number;
  studentName: string;
  scope: ChangeScope;
  date: string;
  day: string;
  /** The new hours that day; none means not working. */
  hours: Hours[];
  /** What that day (ONE_DAY) or that weekday (EVERY_WEEK) has now. */
  currentHours: Hours[];
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
}

/** Student portal: the Team page. Everyone's shifts and tasks; the rest depends on the student's access. */
@Injectable({ providedIn: 'root' })
export class TeamApi {
  private readonly http = inject(HttpClient);

  access(): Promise<TeamAccess> {
    return firstValueFrom(this.http.get<TeamAccess>('/api/me/team/access'));
  }

  week(date: string): Promise<Week> {
    return firstValueFrom(this.http.get<Week>('/api/me/team/week', { params: { date } }));
  }

  tasks(from: string, to: string): Promise<Task[]> {
    return firstValueFrom(this.http.get<Task[]>('/api/me/team/tasks', { params: { from, to } }));
  }

  detail(id: number): Promise<{ task: Task; history: TaskEvent[] }> {
    return firstValueFrom(this.http.get<{ task: Task; history: TaskEvent[] }>(`/api/me/team/tasks/${id}`));
  }

  offer(id: number, note: string): Promise<OfferResult> {
    return firstValueFrom(this.http.post<OfferResult>(`/api/me/team/tasks/${id}/offer`, { note }));
  }

  myOffers(): Promise<Offer[]> {
    return firstValueFrom(this.http.get<Offer[]>('/api/me/team/offers'));
  }

  withdrawOffer(id: number): Promise<Offer> {
    return firstValueFrom(this.http.post<Offer>(`/api/me/team/offers/${id}/withdraw`, null));
  }

  complete(id: number, notes: string): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/me/team/tasks/${id}/complete`, { notes, used: null }));
  }

  notCompleted(id: number, notes: string): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`/api/me/team/tasks/${id}/not-completed`, { notes, used: null }));
  }

  // Shift change requests
  changes(): Promise<ShiftChange[]> {
    return firstValueFrom(this.http.get<ShiftChange[]>('/api/me/schedule/changes'));
  }

  requestChange(change: { scope: ChangeScope; date: string; hours: Hours[]; note: string }): Promise<ShiftChange> {
    return firstValueFrom(this.http.post<ShiftChange>('/api/me/schedule/changes', change));
  }

  withdrawChange(id: number): Promise<ShiftChange> {
    return firstValueFrom(this.http.post<ShiftChange>(`/api/me/schedule/changes/${id}/withdraw`, null));
  }
}

/*
 * A student with edit access plans tasks with the admin task form (TaskPanels). The Team page gives
 * that form these instead of the admin versions (Angular "providers"): the same methods, pointed at
 * /api/me/team, where the backend checks the student's access.
 */

@Injectable()
export class TeamTaskApi extends AdminTaskApi {
  private readonly client = inject(HttpClient);
  private readonly base = '/api/me/team/tasks';

  override list(from: string, to: string): Promise<Task[]> {
    return firstValueFrom(this.client.get<Task[]>(this.base, { params: { from, to } }));
  }

  override detail(id: number): Promise<{ task: Task; history: TaskEvent[] }> {
    return firstValueFrom(this.client.get<{ task: Task; history: TaskEvent[] }>(`${this.base}/${id}`));
  }

  override save(request: TaskRequest, id?: number): Promise<Saved<Task>> {
    return firstValueFrom(id
      ? this.client.put<Saved<Task>>(`${this.base}/${id}`, request)
      : this.client.post<Saved<Task>>(this.base, request));
  }

  override cancel(id: number): Promise<Task> {
    return firstValueFrom(this.client.post<Task>(`${this.base}/${id}/cancel`, null));
  }

  override candidates(id: number): Promise<Candidate[]> {
    return firstValueFrom(this.client.get<Candidate[]>(`${this.base}/${id}/candidates`));
  }

  override availability(date: string, start: string, minutes: number): Promise<Candidate[]> {
    return firstValueFrom(this.client.get<Candidate[]>(`${this.base}/availability`, { params: { date, start, minutes } }));
  }

  override assign(id: number, studentId: number | null): Promise<Saved<Task>> {
    return firstValueFrom(this.client.post<Saved<Task>>(`${this.base}/${id}/assign`, { studentId }));
  }
}

@Injectable()
export class TeamInventoryApi extends InventoryApi {
  private readonly client = inject(HttpClient);

  override items(): Promise<Item[]> {
    return firstValueFrom(this.client.get<Item[]>('/api/me/team/items'));
  }

  override locations(): Promise<StorageLocation[]> {
    return firstValueFrom(this.client.get<StorageLocation[]>('/api/me/team/locations'));
  }
}

@Injectable()
export class TeamSettingsApi extends SettingsApi {
  private readonly client = inject(HttpClient);

  /** Only what the task form needs: the default length of a new task. */
  override async get(): Promise<Settings> {
    const defaults = await firstValueFrom(this.client.get<{ defaultTaskDuration: number }>('/api/me/team/task-defaults'));
    return { digestTime: '', defaultTaskDuration: defaults.defaultTaskDuration, admins: [] };
  }
}

/** Admin portal: offers, shift change requests, and each student's task access. */
@Injectable({ providedIn: 'root' })
export class AdminTeamApi {
  private readonly http = inject(HttpClient);

  offers(): Promise<Offer[]> {
    return firstValueFrom(this.http.get<Offer[]>('/api/admin/task-offers'));
  }

  answerOffer(id: number, accept: boolean): Promise<Offer> {
    return firstValueFrom(this.http.post<Offer>(`/api/admin/task-offers/${id}/${accept ? 'accept' : 'decline'}`, null));
  }

  changes(): Promise<ShiftChange[]> {
    return firstValueFrom(this.http.get<ShiftChange[]>('/api/admin/schedule/changes'));
  }

  answerChange(id: number, approve: boolean, note: string): Promise<ShiftChange> {
    return firstValueFrom(this.http.post<ShiftChange>(`/api/admin/schedule/changes/${id}/${approve ? 'approve' : 'decline'}`, { note }));
  }

  setTaskAccess(studentId: number, access: TaskAccess): Promise<User> {
    return firstValueFrom(this.http.put<User>(`/api/admin/students/${studentId}/task-access`, { access }));
  }
}
