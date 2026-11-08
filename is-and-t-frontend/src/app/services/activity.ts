import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** One thing someone did in the app. who is null when nobody was logged in (a failed login, say). */
export interface ActivityEntry {
  id: number;
  at: string;
  who: string | null;
  email: string | null;
  role: 'ADMIN' | 'STUDENT' | null;
  action: string;
  target: string | null;
  succeeded: boolean;
  status: number;
  reason: string | null;
  method: string;
  path: string;
  ipAddress: string | null;
}

export interface ActivityPage {
  items: ActivityEntry[];
  more: boolean;
  total: number;
}

export type ActivityWho = 'all' | 'admins' | 'students' | 'nobody';

/** Admin portal: the activity log, newest first, 50 at a time. */
@Injectable({ providedIn: 'root' })
export class AdminActivityApi {
  private readonly http = inject(HttpClient);

  list(filter: { q: string; who: ActivityWho; failed: boolean; page: number }): Promise<ActivityPage> {
    return firstValueFrom(this.http.get<ActivityPage>('/api/admin/activity', {
      params: { q: filter.q, who: filter.who, failed: filter.failed, page: filter.page },
    }));
  }
}
