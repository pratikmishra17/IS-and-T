import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { errorMessage } from '../../../services/errors';
import { Settings, SettingsApi } from '../../../services/settings';
import { Toasts } from '../../../ui/toast';

/** Admin portal: Settings (/admin/settings). The daily digest and the default task length. */
@Component({
  selector: 'app-admin-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
})
export class AdminSettings implements OnInit {
  private readonly api = inject(SettingsApi);
  private readonly toasts = inject(Toasts);

  protected readonly settings = signal<Settings | null>(null);
  protected readonly saving = signal(false);
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected draft = { digestTime: '08:00', defaultTaskDuration: 30, recipients: new Set<number>() };

  async ngOnInit(): Promise<void> {
    try {
      this.show(await this.api.get());
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }

  protected toggleRecipient(id: number, checked: boolean): void {
    if (checked) {
      this.draft.recipients.add(id);
    } else {
      this.draft.recipients.delete(id);
    }
  }

  protected async save(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.show(await this.api.save(this.draft.digestTime, this.draft.defaultTaskDuration, [...this.draft.recipients]));
      this.toasts.success('Settings saved.');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async sendNow(): Promise<void> {
    this.sending.set(true);
    try {
      const { sentTo } = await this.api.sendDigestNow();
      this.toasts.success(sentTo === 0 ? 'Nobody is chosen to receive the digest.' : `Today’s digest was emailed to ${sentTo} admin${sentTo === 1 ? '' : 's'}.`);
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.sending.set(false);
    }
  }

  private show(settings: Settings): void {
    this.settings.set(settings);
    this.draft = {
      digestTime: settings.digestTime,
      defaultTaskDuration: settings.defaultTaskDuration,
      recipients: new Set(settings.admins.filter((a) => a.receivesDigest).map((a) => a.id)),
    };
  }
}
