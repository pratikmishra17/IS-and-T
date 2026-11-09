import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { User } from './auth';

/** Which list in the admin portal: matches the URL /api/admin/students or /api/admin/admins. */
export type AccountKind = 'students' | 'admins';

/** What the admin types to add or edit someone. studentId is required for students and not sent for admins. */
export interface AccountDetails {
  firstName: string;
  lastName: string;
  email: string;
  studentId?: string;
}

/** Admin portal calls. The backend only allows these for admins (everything under /api/admin). */
@Injectable({ providedIn: 'root' })
export class Accounts {
  private readonly http = inject(HttpClient);

  list(kind: AccountKind): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`/api/admin/${kind}`));
  }

  add(kind: AccountKind, account: AccountDetails): Promise<User> {
    return firstValueFrom(this.http.post<User>(`/api/admin/${kind}`, account));
  }

  update(kind: AccountKind, id: number, account: AccountDetails): Promise<User> {
    return firstValueFrom(this.http.put<User>(`/api/admin/${kind}/${id}`, account));
  }

  /** Emails a set-password link again: "you've been added" if they never set one, otherwise a reset. */
  async sendPasswordLink(kind: AccountKind, id: number): Promise<void> {
    await firstValueFrom(this.http.post(`/api/admin/${kind}/${id}/send-password-link`, null));
  }

  enable(kind: AccountKind, id: number): Promise<User> {
    return firstValueFrom(this.http.post<User>(`/api/admin/${kind}/${id}/enable`, null));
  }

  disable(kind: AccountKind, id: number): Promise<User> {
    return firstValueFrom(this.http.post<User>(`/api/admin/${kind}/${id}/disable`, null));
  }

  async remove(kind: AccountKind, id: number): Promise<void> {
    await firstValueFrom(this.http.delete(`/api/admin/${kind}/${id}`));
  }
}
