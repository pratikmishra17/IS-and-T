import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Saved } from './schedule';
import { Task } from './tasks';

/** A time-off request: a whole day (start and end null) or part of one. */
export interface TimeOff {
  id: number;
  studentId: number;
  studentName: string;
  date: string;
  start: string | null;
  end: string | null;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
  submittedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** While pending: the student's tasks in that time, which approving would move to someone else. */
  affectedTasks: Task[];
}

/** Students: ask for time off, see and withdraw your requests. */
@Injectable({ providedIn: 'root' })
export class MyTimeOffApi {
  private readonly http = inject(HttpClient);

  list(): Promise<TimeOff[]> {
    return firstValueFrom(this.http.get<TimeOff[]>('/api/me/time-off'));
  }

  request(date: string, start: string | null, end: string | null, reason: string): Promise<TimeOff> {
    return firstValueFrom(this.http.post<TimeOff>('/api/me/time-off', { date, start, end, reason }));
  }

  withdraw(id: number): Promise<TimeOff> {
    return firstValueFrom(this.http.post<TimeOff>(`/api/me/time-off/${id}/withdraw`, null));
  }
}

/** Admins: review time-off requests. */
@Injectable({ providedIn: 'root' })
export class AdminTimeOffApi {
  private readonly http = inject(HttpClient);

  pending(): Promise<TimeOff[]> {
    return firstValueFrom(this.http.get<TimeOff[]>('/api/admin/time-off'));
  }

  count(): Promise<{ pending: number }> {
    return firstValueFrom(this.http.get<{ pending: number }>('/api/admin/time-off/count'));
  }

  /** The warnings say where each affected task went, and which ones nobody could take. */
  approve(id: number, note: string): Promise<Saved<TimeOff>> {
    return firstValueFrom(this.http.post<Saved<TimeOff>>(`/api/admin/time-off/${id}/approve`, { note }));
  }

  decline(id: number, note: string): Promise<TimeOff> {
    return firstValueFrom(this.http.post<TimeOff>(`/api/admin/time-off/${id}/decline`, { note }));
  }
}

/** "Mon, Oct 26 · whole day" or "Mon, Oct 26 · 10:00–12:00" (date text is formatted by the caller). */
export function window(request: Pick<TimeOff, 'start' | 'end'>): string {
  return request.start ? `${request.start}–${request.end}` : 'whole day';
}
