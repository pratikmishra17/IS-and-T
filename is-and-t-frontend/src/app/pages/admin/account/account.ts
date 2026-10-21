import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Auth } from '../../../services/auth';
import { errorMessage } from '../../../services/errors';
import { Toasts } from '../../../ui/toast';

/** Admin portal: My account (/admin/account). Change your own name and password. */
@Component({
  selector: 'app-admin-account',
  imports: [FormsModule],
  templateUrl: './account.html',
})
export class AdminAccount {
  protected readonly auth = inject(Auth);
  private readonly toasts = inject(Toasts);

  protected name = {
    firstName: this.auth.currentUser()?.firstName ?? '',
    lastName: this.auth.currentUser()?.lastName ?? '',
  };
  protected readonly savingName = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal<string | null>(null);

  protected async saveName(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.savingName.set(true);
    try {
      await this.auth.updateName(this.name.firstName, this.name.lastName);
      this.toasts.success('Your name was saved.');
    } catch (error) {
      this.toasts.error(errorMessage(error));
    } finally {
      this.savingName.set(false);
    }
  }

  protected async changePassword(form: NgForm): Promise<void> {
    this.passwordError.set(null);
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    if (form.value.newPassword !== form.value.confirmPassword) {
      this.passwordError.set('The two new passwords don’t match.');
      return;
    }
    this.savingPassword.set(true);
    try {
      await this.auth.changePassword(form.value.currentPassword, form.value.newPassword);
      form.resetForm();
      this.toasts.success('Your password was changed.');
    } catch (error) {
      this.passwordError.set(errorMessage(error));
    } finally {
      this.savingPassword.set(false);
    }
  }
}
