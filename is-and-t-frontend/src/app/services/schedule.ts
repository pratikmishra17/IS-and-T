import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Semester } from './calendar';

export type Day = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export const WEEKDAYS: Day[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
export const ALL_DAYS: Day[] = [...WEEKDAYS, 'SATURDAY', 'SUNDAY'];

/** A weekly block: "MONDAY, 09:00 to 13:00". Times are "HH:mm", like <input type="time">. */
export interface TimeBlock {
  day: Day;
  start: string;
  end: string;
}

export interface RequestInfo {
  id: number;
  status: 'SUBMITTED' | 'APPROVED' | 'APPROVED_WITH_CHANGES';
  submittedAt: string;
  reviewedAt: string | null;
}

export interface ShiftChange {
  id: number;
  date: string;
  type: 'CANCEL' | 'EXTRA';
  start: string | null;
  end: string | null;
  reason: string | null;
}

export interface StudentSchedule {
  studentId: number;
  studentName: string;
  semester: Semester;
  classes: TimeBlock[];
  preferred: TimeBlock[];
  shifts: TimeBlock[];
  weeklyHours: number;
  request: RequestInfo | null;
  exceptions: ShiftChange[];
}

export interface PendingRequest {
  id: number;
  studentId: number;
  studentName: string;
  semesterId: number;
  semesterName: string;
  submittedAt: string;
}

/** Something saved, plus things worth knowing that didn't stop it. */
export interface Saved<T> {
  result: T;
  warnings: string[];
}

export interface Week {
  start: string;
  days: { date: string; holiday: string | null }[];
  students: {
    studentId: number;
    name: string;
    days: { date: string; shifts: { start: string; end: string; extra: boolean }[]; cancelled: boolean }[];
    hours: number;
    overLimit: boolean;
  }[];
  weeklyHourLimit: number | null;
  semesterName: string | null;
}

/** "MONDAY" → "Monday" */
export function dayName(day: Day): string {
  return day.charAt(0) + day.slice(1).toLowerCase();
}

/** Total hours of a list of blocks. */
export function totalHours(blocks: TimeBlock[]): number {
  return blocks.reduce((sum, block) => sum + Math.max(0, minutes(block.end) - minutes(block.start)), 0) / 60;
}

function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

/** User portal: the logged-in student's schedule. */
@Injectable({ providedIn: 'root' })
export class MyScheduleApi {
  private readonly http = inject(HttpClient);

  semesters(): Promise<Semester[]> {
    return firstValueFrom(this.http.get<Semester[]>('/api/me/schedule/semesters'));
  }

  get(semesterId: number): Promise<StudentSchedule> {
    return firstValueFrom(this.http.get<StudentSchedule>('/api/me/schedule', { params: { semesterId } }));
  }

  saveAvailability(semesterId: number, classes: TimeBlock[], preferred: TimeBlock[]): Promise<StudentSchedule> {
    return firstValueFrom(this.http.put<StudentSchedule>('/api/me/schedule/availability', { classes, preferred }, { params: { semesterId } }));
  }

  submit(semesterId: number): Promise<StudentSchedule> {
    return firstValueFrom(this.http.post<StudentSchedule>('/api/me/schedule/submit', null, { params: { semesterId } }));
  }
}

/** Admin portal: schedules. */
@Injectable({ providedIn: 'root' })
export class AdminScheduleApi {
  private readonly http = inject(HttpClient);

  week(start?: string): Promise<Week> {
    return firstValueFrom(this.http.get<Week>('/api/admin/schedule/week', { params: start ? { start } : {} }));
  }

  requests(): Promise<PendingRequest[]> {
    return firstValueFrom(this.http.get<PendingRequest[]>('/api/admin/schedule/requests'));
  }

  student(studentId: number, semesterId: number): Promise<StudentSchedule> {
    return firstValueFrom(this.http.get<StudentSchedule>(`/api/admin/schedule/students/${studentId}`, { params: { semesterId } }));
  }

  setShifts(studentId: number, semesterId: number, shifts: TimeBlock[], requestId?: number): Promise<Saved<StudentSchedule>> {
    return firstValueFrom(this.http.put<Saved<StudentSchedule>>(`/api/admin/schedule/students/${studentId}/shifts`,
      { shifts, requestId: requestId ?? null }, { params: { semesterId } }));
  }

  addChange(studentId: number, change: Omit<ShiftChange, 'id'>): Promise<Saved<ShiftChange>> {
    return firstValueFrom(this.http.post<Saved<ShiftChange>>(`/api/admin/schedule/students/${studentId}/exceptions`, change));
  }

  async deleteChange(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/admin/schedule/exceptions/${id}`));
  }
}
