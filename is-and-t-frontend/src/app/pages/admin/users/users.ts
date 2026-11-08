import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Auth, User } from '../../../services/auth';
import { AccountDetails, AccountKind, Accounts } from '../../../services/accounts';
import { errorMessage } from '../../../services/errors';
import { Confirm } from '../../../ui/confirm';
import { SidePanel } from '../../../ui/side-panel';
import { Toasts } from '../../../ui/toast';
import { remembered } from '../../../services/remember';
import { AdminTeamApi, TASK_ACCESS_LABEL, TaskAccess } from '../../../services/team';
import { AdminTaskApi } from '../../../services/tasks';

type StatusFilter = 'all' | 'active' | 'no-password' | 'disabled';
type SortKey = 'name' | 'studentId' | 'status';

/**
 * Admin portal: Users (/admin/users). Students and Admins tabs, each a searchable, sortable table.
 * Adding or editing opens a side panel; destructive actions ask for confirmation first.
 */
@Component({
  selector: 'app-admin-users',
  imports: [FormsModule, SidePanel],
  templateUrl: './users.html',
})
export class AdminUsers implements OnInit {
  private readonly api = inject(Accounts);
  private readonly teamApi = inject(AdminTeamApi);
  private readonly taskApi = inject(AdminTaskApi);
  /** Team access: what a student may do with tasks on their Team page (everyone can see them). */
  protected readonly accessLevels: TaskAccess[] = ['VIEW', 'COMPLETE', 'EDIT'];
  protected readonly accessLabel = TASK_ACCESS_LABEL;
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  protected readonly auth = inject(Auth);

  protected readonly tab = remembered<AccountKind>('users.tab', 'students', { allowed: ['students', 'admins'] });
  protected readonly accounts = signal<Record<AccountKind, User[]>>({ students: [], admins: [] });
  protected readonly loading = signal(true);
  protected readonly busyId = signal<number | null>(null);

  // Search, filter and sort: plain signals; `rows` below recalculates whenever any of them change.
  protected readonly search = remembered('users.search', '', { session: true });
  protected readonly statusFilter = remembered<StatusFilter>('users.status', 'all');
  protected readonly sortKey = signal<SortKey>('name');
  protected readonly sortAscending = signal(true);

  protected readonly rows = computed(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.statusFilter();
    const direction = this.sortAscending() ? 1 : -1;
    return this.accounts()[this.tab()]
      .filter((account) => !query || [account.firstName, account.lastName, account.email, account.studentId ?? '']
        .some((value) => value.toLowerCase().includes(query)))
      .filter((account) => filter === 'all' || this.statusOf(account) === filter)
      .sort((a, b) => direction * this.sortValue(a).localeCompare(this.sortValue(b)));
  });

  // The add/edit side panel. `editing` is null when adding someone new.
  protected readonly panelOpen = signal(false);
  protected readonly editing = signal<User | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected draft: AccountDetails = this.emptyDraft();

  async ngOnInit(): Promise<void> {
    try {
      const [students, admins] = await Promise.all([this.api.list('students'), this.api.list('admins')]);
      this.accounts.set({ students, admins });
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected isStudents(): boolean {
    return this.tab() === 'students';
  }

  protected switchTab(kind: AccountKind): void {
    this.tab.set(kind);
    this.search.set('');
    this.statusFilter.set('all');
  }

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortAscending.set(!this.sortAscending());
    } else {
      this.sortKey.set(key);
      this.sortAscending.set(true);
    }
  }

  protected ariaSort(key: SortKey): 'ascending' | 'descending' | null {
    return this.sortKey() === key ? (this.sortAscending() ? 'ascending' : 'descending') : null;
  }

  protected statusOf(account: User): Exclude<StatusFilter, 'all'> {
    if (account.status === 'DISABLED') {
      return 'disabled';
    }
    return account.passwordSet ? 'active' : 'no-password';
  }

  /** The current admin can't disable or remove themselves (the backend enforces this too). */
  protected isMe(account: User): boolean {
    const me = this.auth.currentUser();
    return account.role === me?.role && account.id === me?.id;
  }

  protected openAdd(): void {
    this.editing.set(null);
    this.draft = this.emptyDraft();
    this.formError.set(null);
    this.panelOpen.set(true);
  }

  protected openEdit(account: User): void {
    this.editing.set(account);
    this.draft = { firstName: account.firstName, lastName: account.lastName, email: account.email, studentId: account.studentId ?? undefined };
    this.formError.set(null);
    this.panelOpen.set(true);
  }

  protected async save(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }

    const kind = this.tab();
    const editing = this.editing();
    const details: AccountDetails = { ...this.draft, studentId: this.isStudents() ? this.draft.studentId : undefined };
    this.saving.set(true);
    this.formError.set(null);
    try {
      const saved = editing ? await this.api.update(kind, editing.id, details) : await this.api.add(kind, details);
      this.replace(kind, saved);
      this.panelOpen.set(false);
      this.toasts.success(editing
        ? `${saved.firstName}’s details were saved.`
        : `${saved.firstName} was added and emailed a link to set their password.`);
      if (editing && this.isMe(saved)) {
        await this.auth.loadSession();
      }
    } catch (error) {
      // Keep the panel open so nothing typed is lost; show the problem inside it.
      this.formError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async sendLink(account: User): Promise<void> {
    await this.run(account, () => this.api.sendPasswordLink(this.tab(), account.id),
      `A set-password link was emailed to ${account.email}.`);
  }

  protected async disable(account: User): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Disable ${account.firstName} ${account.lastName}?`,
      message: `They won’t be able to log in. Their account stays, and you can enable it again at any time.${await this.tasksThatMove(account)}`,
      confirmLabel: 'Disable',
    });
    if (ok) {
      await this.run(account, () => this.api.disable(this.tab(), account.id), `${account.firstName}’s account is disabled.`);
    }
  }

  protected async setAccess(account: User, access: TaskAccess): Promise<void> {
    await this.run(account, () => this.teamApi.setTaskAccess(account.id, access),
      `${account.firstName} can now: ${TASK_ACCESS_LABEL[access].toLowerCase()}.`);
  }

  protected async enable(account: User): Promise<void> {
    await this.run(account, () => this.api.enable(this.tab(), account.id), `${account.firstName}’s account is enabled again.`);
  }

  protected async remove(account: User): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Remove ${account.firstName} ${account.lastName}?`,
      message: `Their account is deleted permanently. This can’t be undone. To only block access, disable the account instead.${await this.tasksThatMove(account)}`,
      confirmLabel: 'Remove permanently',
      danger: true,
    });
    if (ok) {
      await this.run(account, () => this.api.remove(this.tab(), account.id), `${account.firstName} was removed.`, true);
    }
  }

  /**
   * A disabled or removed student's upcoming tasks go to someone else on shift (or become
   * unassigned): " Their 3 upcoming tasks will move to others…" for the confirmation, or "" if none.
   */
  private async tasksThatMove(account: User): Promise<string> {
    if (account.role === 'ADMIN') {
      return '';
    }
    try {
      const today = new Date().toLocaleDateString('en-CA');
      const later = new Date();
      later.setFullYear(later.getFullYear() + 1);
      const now = new Date();
      const upcoming = (await this.taskApi.list(today, later.toLocaleDateString('en-CA')))
        .filter((task) => task.status === 'ASSIGNED' && task.assignee?.id === account.id && new Date(`${task.date}T${task.startTime}`) > now);
      if (upcoming.length === 0) {
        return ' They have no upcoming tasks.';
      }
      return ` Their ${upcoming.length === 1 ? 'upcoming task' : upcoming.length + ' upcoming tasks'} will move to someone else on shift, or become unassigned if nobody is free.`;
    } catch {
      return '';
    }
  }

  /** Runs one action on one row, then shows the result and refreshes that row (or drops it if removed). */
  private async run(account: User, action: () => Promise<User | void>, success: string, removed = false): Promise<void> {
    const kind = this.tab();
    this.busyId.set(account.id);
    try {
      const updated = await action();
      if (removed) {
        this.accounts.update((all) => ({ ...all, [kind]: all[kind].filter((row) => row.id !== account.id) }));
      } else if (updated) {
        this.replace(kind, updated);
      }
      this.toasts.success(success);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.busyId.set(null);
    }
  }

  /** Puts a saved account into its list, replacing the old copy or adding it. */
  private replace(kind: AccountKind, saved: User): void {
    this.accounts.update((all) => {
      const others = all[kind].filter((row) => row.id !== saved.id);
      return { ...all, [kind]: [...others, saved] };
    });
  }

  private sortValue(account: User): string {
    switch (this.sortKey()) {
      case 'studentId':
        return account.studentId ?? '';
      case 'status':
        return this.statusOf(account);
      default:
        return `${account.lastName} ${account.firstName}`;
    }
  }

  private emptyDraft(): AccountDetails {
    return { firstName: '', lastName: '', email: '', studentId: '' };
  }
}
