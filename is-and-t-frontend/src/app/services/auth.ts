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

/** Matches SessionResponse in the backend: who is logged in, and the rules for this login. */
export interface Session {
  user: User;
  /** Signed out after this long without any request to the backend (15 min for admins, 30 for students). */
  idleTimeoutSeconds: number;
  /** When this login ends however active the person is (12 hours after logging in). */
  expiresAt: string | null;
  /** True for a temporary password: nothing else works until a new one is chosen. */
  mustChangePassword: boolean;
}

/** Why someone was signed out without asking, shown on the login page (?ended=...). */
export type EndReason = 'idle' | 'max' | 'ended';

/** If the backend answered this recently, the session is known to be alive (see verify()). */
const RECENT_MS = 10_000;

/** Lets other tabs of the app know (through localStorage events) about contact and logouts. */
const CONTACT_KEY = 'isandt.lastContact';
const LOGOUT_KEY = 'isandt.logout';

/**
 * Knows who is logged in. The session itself lives in a cookie the browser sends automatically;
 * this service keeps a copy of it for the UI to read. The backend decides: this copy is checked
 * against it before pages open (verify) and corrected whenever the backend says otherwise.
 */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly state = signal<Session | null>(null);

  readonly session = this.state.asReadonly();
  readonly currentUser = computed(() => this.state()?.user ?? null);
  readonly isLoggedIn = computed(() => this.state() !== null);
  readonly isAdmin = computed(() => this.state()?.user.role === 'ADMIN');
  readonly mustChangePassword = computed(() => this.state()?.mustChangePassword ?? false);

  /**
   * When the backend last answered (any request). The backend's idle timer restarts on every
   * request, so this is what the idle timeout counts from.
   */
  lastContact = 0;

  /** Asks the backend who is logged in. It answers 204 (no body) when nobody is. */
  async loadSession(): Promise<void> {
    this.state.set(await firstValueFrom(this.http.get<Session | null>('/api/auth/me')));
    this.markContact();
  }

  /**
   * Before a logged-in page opens: confirm with the backend that the session still exists. It may
   * have ended on the server (a restart, the idle timeout, a password change in another browser, an
   * admin disabling the account) without this page knowing. Skipped if the backend answered moments
   * ago. If the backend can't be reached, the local copy is kept; the backend refuses data anyway.
   */
  async verify(): Promise<void> {
    if (!this.isLoggedIn() || Date.now() - this.lastContact < RECENT_MS) {
      return;
    }
    try {
      await this.loadSession();
    } catch {
      // offline or backend down: keep what we have
    }
  }

  /** Each portal is for one role: the backend refuses (403) an admin in the student portal and vice versa. */
  async login(email: string, password: string, portal: Role): Promise<void> {
    this.state.set(await firstValueFrom(this.http.post<Session>('/api/auth/login', { email, password, portal })));
    this.markContact();
  }

  /** Logging out also clears the CSRF cookie, so a fresh one is fetched for the next login. */
  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', null));
    this.clear();
    this.tellOtherTabs(LOGOUT_KEY);
    await this.loadSession();
  }

  /**
   * Ends the session without asking (idle or too long): best effort, since the backend may have
   * ended it already. Never fails.
   */
  async endSession(): Promise<void> {
    try {
      await this.logout();
    } catch {
      this.clear();
      this.tellOtherTabs(LOGOUT_KEY);
    }
  }

  /** Forgets the user locally, for when the backend says the session has ended. */
  clear(): void {
    this.state.set(null);
  }

  /** Called for every response from the backend: the session's idle timer restarted. */
  markContact(at = Date.now(), share = true): void {
    if (at > this.lastContact) {
      this.lastContact = at;
      if (share) {
        this.tellOtherTabs(CONTACT_KEY, at);
      }
    }
  }

  /** Reacts to what another tab told us (a storage event). Returns true if that tab logged out. */
  fromOtherTab(event: StorageEvent): boolean {
    if (event.key === CONTACT_KEY && event.newValue) {
      this.markContact(Number(event.newValue), false);
    }
    return event.key === LOGOUT_KEY && this.isLoggedIn();
  }

  private tellOtherTabs(key: string, value = Date.now()): void {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // storage blocked (private mode): tabs just won't share
    }
  }

  /** Answers with the account's role, so the right portal's login page can open next. */
  async setPassword(token: string, password: string): Promise<Role> {
    const response = await firstValueFrom(this.http.post<{ role: Role }>('/api/auth/set-password', { token, password }));
    return response.role;
  }

  /** My account: change your own name; the copy of the current user updates with it. */
  async updateName(firstName: string, lastName: string): Promise<void> {
    const user = await firstValueFrom(this.http.put<User>('/api/account/name', { firstName, lastName }));
    this.state.update((session) => (session ? { ...session, user } : session));
  }

  /** Other sessions of this account end; this one continues, now without the "must change" flag. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/account/password', { currentPassword, newPassword }));
    this.state.update((session) => (session ? { ...session, mustChangePassword: false } : session));
  }

  async forgotPassword(email: string): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/forgot-password', { email }));
  }
}
