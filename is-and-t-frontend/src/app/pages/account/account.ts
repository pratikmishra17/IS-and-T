import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth } from '../../services/auth';
import { errorMessage } from '../../services/errors';
import { Toasts } from '../../ui/toast';

/**
 * My account, in both portals (/account and /admin/account): change your own name and password,
 * and choose what opens after logging in.
 */
@Component({
  selector: 'app-account',
  imports: [FormsModule],
  templateUrl: './account.html',
})
export class Account {
  protected readonly auth = inject(Auth);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);

  protected name = {
    firstName: this.auth.currentUser()?.firstName ?? '',
    lastName: this.auth.currentUser()?.lastName ?? '',
  };
  protected readonly savingName = signal(false);
  protected readonly afterLogin = signal<'HOME' | 'LAST_PAGE'>(this.auth.currentUser()?.afterLogin ?? 'HOME');
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

  protected async saveAfterLogin(choice: 'HOME' | 'LAST_PAGE'): Promise<void> {
    const before = this.afterLogin();
    this.afterLogin.set(choice);
    try {
      await this.auth.setAfterLogin(choice);
      this.toasts.success(choice === 'HOME' ? `After logging in you’ll see the ${this.auth.isAdmin() ? 'Dashboard' : 'Home page'}.` : 'After logging in you’ll go back to the page you were on.');
    } catch (error) {
      this.afterLogin.set(before);
      this.toasts.error(errorMessage(error));
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
      const wasTemporary = this.auth.mustChangePassword();
      await this.auth.changePassword(form.value.currentPassword, form.value.newPassword);
      form.resetForm();
      this.toasts.success('Your password was changed. You’ve been signed out everywhere else.');
      if (wasTemporary) {
        // Now the rest of the app opens up.
        await this.router.navigate([this.auth.isAdmin() ? '/admin' : '/home']);
      }
    } catch (error) {
      this.passwordError.set(errorMessage(error));
    } finally {
      this.savingPassword.set(false);
    }
  }
}
