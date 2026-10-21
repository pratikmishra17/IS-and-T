import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type SemesterType = 'FALL' | 'SPRING' | 'SUMMER';

/** The usual weekly hour limit for each semester type (matches SemesterType in the backend). */
export const DEFAULT_HOUR_LIMIT: Record<SemesterType, number> = { FALL: 20, SPRING: 20, SUMMER: 40 };

/** Dates travel as "2026-08-24" strings, which is also what <input type="date"> uses. */
export interface Semester {
  id: number;
  name: string;
  type: SemesterType;
  startDate: string;
  endDate: string;
  weeklyHourLimit: number;
  /** Today (campus time) falls inside this semester. */
  current: boolean;
}

export type SemesterDetails = Omit<Semester, 'id' | 'current'>;

export interface Holiday {
  id: number;
  date: string;
  name: string;
  source: 'MANUAL' | 'ICS_IMPORT';
}

/** What adding or importing did: days added, and days skipped because they were already holidays. */
export interface HolidayChanges {
  added: number;
  skipped: number;
}

/** Admin portal: semesters and holidays. */
@Injectable({ providedIn: 'root' })
export class CalendarApi {
  private readonly http = inject(HttpClient);

  semesters(): Promise<Semester[]> {
    return firstValueFrom(this.http.get<Semester[]>('/api/admin/semesters'));
  }

  addSemester(details: SemesterDetails): Promise<Semester> {
    return firstValueFrom(this.http.post<Semester>('/api/admin/semesters', details));
  }

  updateSemester(id: number, details: SemesterDetails): Promise<Semester> {
    return firstValueFrom(this.http.put<Semester>(`/api/admin/semesters/${id}`, details));
  }

  async deleteSemester(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/admin/semesters/${id}`));
  }

  holidays(): Promise<Holiday[]> {
    return firstValueFrom(this.http.get<Holiday[]>('/api/admin/holidays'));
  }

  addHoliday(name: string, from: string, to: string | null): Promise<HolidayChanges> {
    return firstValueFrom(this.http.post<HolidayChanges>('/api/admin/holidays', { name, from, to }));
  }

  /** Sends the file as multipart/form-data, the same way an HTML form with a file field would. */
  importHolidays(file: File): Promise<HolidayChanges> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(this.http.post<HolidayChanges>('/api/admin/holidays/import', form));
  }

  async deleteHoliday(id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/admin/holidays/${id}`));
  }
}
