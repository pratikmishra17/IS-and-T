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
  /** CANCEL: day off · EXTRA: added shift · OFF: time off for part of the day */
  type: 'CANCEL' | 'EXTRA' | 'OFF';
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
    days: {
      date: string;
      shifts: { start: string; end: string; extra: boolean }[];
      cancelled: boolean;
      /** Approved time off for part of the day. */
      timeOff: { start: string; end: string }[];
    }[];
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

/** "09:30" → 570 (minutes after midnight) */
export function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

/** 570 → "09:30" */
export function clock(totalMinutes: number): string {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

/**
 * Tidies a list of weekly shifts: drops empty ones, joins any that overlap or touch on the same
 * day (Mon 9–12 and Mon 11–13 become Mon 9–13), and sorts them by day, then time. Every edit in
 * the shift editor goes through this, so the list never holds two shifts covering the same time.
 */
export function mergeShifts(blocks: TimeBlock[]): TimeBlock[] {
  const order = (day: Day) => ALL_DAYS.indexOf(day);
  const sorted = blocks
    .filter((block) => minutes(block.end) > minutes(block.start))
    .sort((a, b) => order(a.day) - order(b.day) || minutes(a.start) - minutes(b.start));
  const merged: TimeBlock[] = [];
  for (const block of sorted) {
    const last = merged.at(-1);
    if (last && last.day === block.day && minutes(block.start) <= minutes(last.end)) {
      if (minutes(block.end) > minutes(last.end)) {
        merged[merged.length - 1] = { ...last, end: block.end };
      }
    } else {
      merged.push({ ...block });
    }
  }
  return merged;
}

/** Adds the same hours on each of the given days ("Mon, Wed, Fri 9:00–12:00"). */
export function addOnDays(blocks: TimeBlock[], days: Day[], start: string, end: string): TimeBlock[] {
  return mergeShifts([...blocks, ...days.map((day) => ({ day, start, end }))]);
}

/** True if two blocks on the same day share any time. */
export function overlaps(a: TimeBlock, b: TimeBlock): boolean {
  return a.day === b.day && minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
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
