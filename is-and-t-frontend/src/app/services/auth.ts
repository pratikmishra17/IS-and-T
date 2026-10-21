import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type Role = 'STUDENT' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'DISABLED';

/** Matches UserResponse in the backend. */
export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  studentId: string | null;
  role: Role;
  status: UserStatus;
  /** False until the user opens their "you've been added" link and sets a password. */
  passwordSet: boolean;
  createdAt: string;
}

/**
 * Knows who is logged in. The session itself lives in a cookie the browser sends automatically;
 * this service only keeps a copy of the current user for the UI to read.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly user = signal<User | null>(null);

  readonly currentUser = this.user.asReadonly();
  readonly isLoggedIn = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');

  /** Called once when the app starts. The backend answers 204 (no body) when nobody is logged in. */
  async loadSession(): Promise<void> {
    this.user.set(await firstValueFrom(this.http.get<User | null>('/api/auth/me')));
  }

  async login(email: string, password: string): Promise<void> {
    this.user.set(await firstValueFrom(this.http.post<User>('/api/auth/login', { email, password })));
  }

  /** Logging out also clears the CSRF cookie, so a fresh one is fetched for the next login. */
  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', null));
    this.user.set(null);
    await this.loadSession();
  }

  /** Forgets the user locally, for when the backend says the session has expired. */
  clear(): void {
    this.user.set(null);
  }

  async setPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/set-password', { token, password }));
  }

  /** My account: change your own name; the copy of the current user updates with it. */
  async updateName(firstName: string, lastName: string): Promise<void> {
    this.user.set(await firstValueFrom(this.http.put<User>('/api/account/name', { firstName, lastName })));
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/account/password', { currentPassword, newPassword }));
  }

  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/forgot-password', { email }));
  }
}
