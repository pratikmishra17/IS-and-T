import { HttpErrorResponse } from '@angular/common/http';
import { Component, booleanAttribute, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LastPage } from '../../services/last-page';
import { Auth, EndReason } from '../../services/auth';
import { errorMessage } from '../../services/errors';

/** Used by both portals: /login (users) and /admin/login (the admin). */
@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly lastPage = inject(LastPage);

  /**
   * The email typed so far. Kept for this browser tab (sessionStorage, never the password), so
   * switching to the other portal's login page keeps it.
   */
  protected typedEmail = readTypedEmail();

  protected rememberEmail(email: string): void {
    try {
      sessionStorage.setItem(EMAIL_KEY, email);
    } catch {
      // storage blocked: the other page just starts empty
    }
  }

  /** Set by the route's data ({ portal: 'admin' } on /admin/login). */
  readonly portal = input<'user' | 'admin'>('user');

  /** True when arriving from the set-password page (?passwordSet=true in the URL). */
  readonly passwordSet = input(false, { transform: booleanAttribute });

  /** Set when the app signed someone out on its own (?ended=idle, max or ended in the URL). */
  readonly ended = input<EndReason | undefined>();

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Right password, wrong portal: show a link to the other one. */
  protected readonly wrongPortal = signal(false);

  protected async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    this.wrongPortal.set(false);
    try {
      const admin = this.portal() === 'admin';
      await this.auth.login(form.value.email, form.value.password, admin ? 'ADMIN' : 'STUDENT');
      // A temporary password has to be replaced before anything else, on the account page.
      // Otherwise their home page, or the page they were on last if they chose that on the Account page.
      const user = this.auth.currentUser();
      const home = admin ? '/admin' : '/home';
      const next = this.auth.mustChangePassword() ? (admin ? '/admin/account' : '/account') : (user && this.lastPage.after(user)) || home;
      await this.router.navigateByUrl(next);
    } catch (error) {
      this.error.set(errorMessage(error));
      this.wrongPortal.set(error instanceof HttpErrorResponse && error.status === 403);
    } finally {
      this.submitting.set(false);
    }
  }
}

const EMAIL_KEY = 'isandt.loginEmail';

function readTypedEmail(): string {
  try {
    return sessionStorage.getItem(EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}
