import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { CalendarApi, DEFAULT_HOUR_LIMIT, Holiday, HolidayChanges, Semester, SemesterDetails, SemesterType } from '../../../services/calendar';
import { errorMessage } from '../../../services/errors';
import { Confirm } from '../../../ui/confirm';
import { SidePanel } from '../../../ui/side-panel';
import { Toasts } from '../../../ui/toast';

/** Consecutive days with the same name, shown as one row (Spring Break, Mar 15 – 19). */
interface HolidayGroup {
  name: string;
  first: string;
  last: string;
  days: Holiday[];
  imported: boolean;
}

/** Admin portal: Calendar (/admin/calendar). Semesters and holidays. */
@Component({
  selector: 'app-admin-calendar',
  imports: [DatePipe, FormsModule, SidePanel],
  templateUrl: './calendar.html',
})
export class AdminCalendar implements OnInit {
  private readonly api = inject(CalendarApi);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  protected readonly semesters = signal<Semester[]>([]);
  protected readonly holidays = signal<Holiday[]>([]);
  protected readonly loading = signal(true);
  protected readonly showPastHolidays = signal(false);
  protected readonly today = new Date().toLocaleDateString('en-CA'); // "2026-10-21", comparable with API dates

  protected readonly holidayGroups = computed(() => {
    const groups: HolidayGroup[] = [];
    for (const day of this.holidays()) {
      const previous = groups.at(-1);
      if (previous && previous.name === day.name && this.nextDay(previous.last) === day.date) {
        previous.last = day.date;
        previous.days.push(day);
      } else {
        groups.push({ name: day.name, first: day.date, last: day.date, days: [day], imported: day.source === 'ICS_IMPORT' });
      }
    }
    return this.showPastHolidays() ? groups : groups.filter((group) => group.last >= this.today);
  });

  // Semester side panel
  protected readonly semesterPanelOpen = signal(false);
  protected readonly editingSemester = signal<Semester | null>(null);
  protected semesterDraft: SemesterDetails = this.emptySemester();

  // Holiday side panel
  protected readonly holidayPanelOpen = signal(false);
  protected holidayDraft = { name: '', from: '', to: '' };

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly importing = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const [semesters, holidays] = await Promise.all([this.api.semesters(), this.api.holidays()]);
      this.semesters.set(semesters);
      this.holidays.set(holidays);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  // ---- Semesters ----

  protected openAddSemester(): void {
    this.editingSemester.set(null);
    this.semesterDraft = this.emptySemester();
    this.formError.set(null);
    this.semesterPanelOpen.set(true);
  }

  protected openEditSemester(semester: Semester): void {
    this.editingSemester.set(semester);
    const { id, current, ...details } = semester;
    this.semesterDraft = details;
    this.formError.set(null);
    this.semesterPanelOpen.set(true);
  }

  /** Choosing a type fills in its usual hour limit; the admin can still change it. */
  protected typeChanged(type: SemesterType): void {
    this.semesterDraft.type = type;
    this.semesterDraft.weeklyHourLimit = DEFAULT_HOUR_LIMIT[type];
  }

  protected async saveSemester(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    const editing = this.editingSemester();
    await this.submit(async () => {
      const saved = editing
        ? await this.api.updateSemester(editing.id, this.semesterDraft)
        : await this.api.addSemester(this.semesterDraft);
      this.semesters.set(await this.api.semesters());
      this.semesterPanelOpen.set(false);
      this.toasts.success(`${saved.name} was ${editing ? 'saved' : 'added'}.`);
    });
  }

  protected async deleteSemester(semester: Semester): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Delete ${semester.name}?`,
      message: 'The semester and its hour limit are removed. This can’t be undone.',
      confirmLabel: 'Delete semester',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await this.api.deleteSemester(semester.id);
      this.semesters.update((all) => all.filter((s) => s.id !== semester.id));
      this.toasts.success(`${semester.name} was deleted.`);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    }
  }

  // ---- Holidays ----

  protected openAddHoliday(): void {
    this.holidayDraft = { name: '', from: '', to: '' };
    this.formError.set(null);
    this.holidayPanelOpen.set(true);
  }

  protected async saveHoliday(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    await this.submit(async () => {
      const changes = await this.api.addHoliday(this.holidayDraft.name, this.holidayDraft.from, this.holidayDraft.to || null);
      this.holidays.set(await this.api.holidays());
      this.holidayPanelOpen.set(false);
      this.toasts.success(this.describe(changes));
    });
  }

  /** The hidden <input type="file"> hands over the chosen file; it's uploaded straight away. */
  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still triggers a change
    if (!file) {
      return;
    }
    this.importing.set(true);
    try {
      const changes = await this.api.importHolidays(file);
      this.holidays.set(await this.api.holidays());
      this.toasts.success(`Imported ${file.name}: ${this.describe(changes)}`);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.importing.set(false);
    }
  }

  protected async deleteHoliday(group: HolidayGroup): Promise<void> {
    const days = group.days.length;
    const ok = await this.confirm.ask({
      title: `Delete ${group.name}?`,
      message: days === 1 ? 'This day will no longer be a holiday.' : `All ${days} days will no longer be holidays.`,
      confirmLabel: 'Delete holiday',
      danger: true,
    });
    if (!ok) {
      return;
    }
    try {
      await Promise.all(group.days.map((day) => this.api.deleteHoliday(day.id)));
      const removed = new Set(group.days.map((day) => day.id));
      this.holidays.update((all) => all.filter((day) => !removed.has(day.id)));
      this.toasts.success(`${group.name} was deleted.`);
    } catch (error) {
      this.toasts.error(errorMessage(error));
      this.holidays.set(await this.api.holidays());
    }
  }

  protected dayCount(group: HolidayGroup): number {
    return group.days.length;
  }

  /** Runs a save: shows "saving", and keeps the panel open with the error if it fails. */
  private async submit(action: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    this.formError.set(null);
    try {
      await action();
    } catch (error) {
      this.formError.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private describe(changes: HolidayChanges): string {
    const added = `${changes.added} day${changes.added === 1 ? '' : 's'} added`;
    return changes.skipped > 0 ? `${added}, ${changes.skipped} already ${changes.skipped === 1 ? 'was a holiday' : 'were holidays'}.` : `${added}.`;
  }

  private nextDay(date: string): string {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + 1);
    return next.toLocaleDateString('en-CA');
  }

  private emptySemester(): SemesterDetails {
    return { name: '', type: 'FALL', startDate: '', endDate: '', weeklyHourLimit: DEFAULT_HOUR_LIMIT.FALL };
  }
}
