import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivityEntry, ActivityWho, AdminActivityApi } from '../../../services/activity';
import { errorMessage } from '../../../services/errors';
import { remembered } from '../../../services/remember';
import { Toasts } from '../../../ui/toast';

/** Entries that happened on the same day, under one heading. */
interface DayGroup {
  day: string;
  label: string;
  entries: ActivityEntry[];
}

/**
 * Admin portal: Activity log (/admin/activity). Everything anyone did in the app, newest first:
 * who (admin, student, or nobody logged in), what, to what, and whether it worked (with the reason
 * if not). Search and filters reload from the server; "Show older" fetches the next 50.
 */
@Component({
  selector: 'app-admin-activity',
  imports: [DatePipe, FormsModule],
  templateUrl: './activity.html',
})
export class AdminActivity implements OnInit, OnDestroy {
  private readonly api = inject(AdminActivityApi);
  private readonly toasts = inject(Toasts);

  protected readonly search = remembered('activity.search', '', { session: true });
  protected readonly who = remembered<ActivityWho>('activity.who', 'all', { allowed: ['all', 'admins', 'students', 'nobody'] });
  protected readonly failedOnly = remembered('activity.failed', false);

  protected readonly entries = signal<ActivityEntry[]>([]);
  protected readonly total = signal(0);
  protected readonly more = signal(false);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  /** Which entries have their details (address, network address) open. */
  protected readonly open = signal<Set<number>>(new Set());

  private page = 0;
  private searchTimer?: ReturnType<typeof setTimeout>;
  /** Each reload gets a number, so an older, slower answer can't overwrite a newer one. */
  private request = 0;

  /** Grouped by day: Today, Yesterday, then dates. */
  protected readonly days = computed<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const entry of this.entries()) {
      const day = new Date(entry.at).toLocaleDateString('en-CA');
      let group = groups.at(-1);
      if (!group || group.day !== day) {
        group = { day, label: dayLabel(day), entries: [] };
        groups.push(group);
      }
      group.entries.push(entry);
    }
    return groups;
  });

  constructor() {
    // Typing in the search box waits a moment before asking the server; the filters reload at once.
    let first = true;
    effect(() => {
      this.search();
      this.who();
      this.failedOnly();
      if (first) {
        first = false;
        return;
      }
      untracked(() => {
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => void this.reload(), 300);
      });
    });
  }

  ngOnInit(): void {
    void this.reload();
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
  }

  protected async reload(): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    try {
      const found = await this.api.list({ q: this.search(), who: this.who(), failed: this.failedOnly(), page: 0 });
      if (request === this.request) {
        this.page = 0;
        this.entries.set(found.items);
        this.total.set(found.total);
        this.more.set(found.more);
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      if (request === this.request) {
        this.loading.set(false);
      }
    }
  }

  protected async showOlder(): Promise<void> {
    const request = this.request;
    this.loadingMore.set(true);
    try {
      const found = await this.api.list({ q: this.search(), who: this.who(), failed: this.failedOnly(), page: this.page + 1 });
      if (request === this.request) {
        this.page++;
        this.entries.update((entries) => [...entries, ...found.items]);
        this.more.set(found.more);
      }
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loadingMore.set(false);
    }
  }

  protected toggle(id: number): void {
    this.open.update((open) => {
      const next = new Set(open);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  protected roleLabel(entry: ActivityEntry): string {
    return entry.role === 'ADMIN' ? 'Admin' : entry.role === 'STUDENT' ? 'Student' : 'Not logged in';
  }
}

/** "2026-10-27" → "Today", "Yesterday", or "Monday, October 26". */
function dayLabel(day: string): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (day === today.toLocaleDateString('en-CA')) {
    return 'Today';
  }
  if (day === yesterday.toLocaleDateString('en-CA')) {
    return 'Yesterday';
  }
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', ...(year !== today.getFullYear() ? { year: 'numeric' } : {}),
  });
}
