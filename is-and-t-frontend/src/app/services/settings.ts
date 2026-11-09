import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface Settings {
  /** "08:00", campus time, weekdays. */
  digestTime: string;
  /** Minutes pre-filled on new tasks. */
  defaultTaskDuration: number;
  admins: { id: number; name: string; email: string; active: boolean; receivesDigest: boolean }[];
}

/** Admin portal: settings and the daily digest. */
@Injectable({ providedIn: 'root' })
export class SettingsApi {
  private readonly http = inject(HttpClient);

  get(): Promise<Settings> {
    return firstValueFrom(this.http.get<Settings>('/api/admin/settings'));
  }

  save(digestTime: string, defaultTaskDuration: number, digestRecipientIds: number[]): Promise<Settings> {
    return firstValueFrom(this.http.put<Settings>('/api/admin/settings', { digestTime, defaultTaskDuration, digestRecipientIds }));
  }

  sendDigestNow(): Promise<{ sentTo: number }> {
    return firstValueFrom(this.http.post<{ sentTo: number }>('/api/admin/settings/digest/send-now', null));
  }
}
