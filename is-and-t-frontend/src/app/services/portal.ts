import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RequestInfo } from './schedule';
import { Task } from './tasks';

export interface ShiftView {
  start: string;
  end: string;
  /** Added for that day only (not part of the weekly pattern). */
  extra: boolean;
}

export interface MyDay {
  date: string;
  holiday: string | null;
  dayOff: boolean;
  shifts: ShiftView[];
  tasks: Task[];
  upForGrabsToday: number;
  weekHours: number;
  weeklyHourLimit: number | null;
  semesterName: string | null;
  request: RequestInfo | null;
}

export interface MyWeekDay {
  date: string;
  holiday: string | null;
  dayOff: boolean;
  shifts: ShiftView[];
  /** Approved time off for part of the day (already cut out of shifts). */
  timeOff: ShiftView[];
  tasks: Task[];
}

export interface MyWeek {
  start: string;
  days: MyWeekDay[];
  hours: number;
  weeklyHourLimit: number | null;
  semesterName: string | null;
}

/** An item in the student's read-only stock lookup. */
export interface StockLookup {
  id: number;
  name: string;
  category: string;
  manufacturer: string | null;
  model: string | null;
  details: Record<string, string>;
  /** Free to use: on hand minus what upcoming tasks have reserved. */
  available: number;
  rooms: { label: string; quantity: number }[];
}

/** User portal: the logged-in student's day and week. */
@Injectable({ providedIn: 'root' })
export class PortalApi {
  private readonly http = inject(HttpClient);

  today(): Promise<MyDay> {
    return firstValueFrom(this.http.get<MyDay>('/api/me/today'));
  }

  week(start?: string): Promise<MyWeek> {
    return firstValueFrom(this.http.get<MyWeek>('/api/me/week', { params: start ? { start } : {} }));
  }

  stock(): Promise<StockLookup[]> {
    return firstValueFrom(this.http.get<StockLookup[]>('/api/me/inventory'));
  }

  /** Your private calendar link (created the first time). */
  calendarLink(): Promise<{ url: string; webcalUrl: string }> {
    return firstValueFrom(this.http.get<{ url: string; webcalUrl: string }>('/api/me/calendar'));
  }

  /** A new link; the old one stops working. */
  regenerateCalendarLink(): Promise<{ url: string; webcalUrl: string }> {
    return firstValueFrom(this.http.post<{ url: string; webcalUrl: string }>('/api/me/calendar/regenerate', null));
  }

  semesterHours(semesterId: number): Promise<{ weekStart: string; hours: number }[]> {
    return firstValueFrom(this.http.get<{ weekStart: string; hours: number }[]>('/api/me/schedule/hours', { params: { semesterId } }));
  }
}

/** "2026-10-21" + "09:30" → a Date in the browser (the campus and the browser share a time zone in practice). */
export function at(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

/** "in 25 min", "in 2 h 5 min", "now" */
export function countdown(from: Date, to: Date): string {
  const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
  if (minutes <= 0) {
    return 'now';
  }
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `in ${minutes} min` : `in ${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
}
