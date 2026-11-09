import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, booleanAttribute, inject, input, signal } from '@angular/core';
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
export class Login implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly lastPage = inject(LastPage);

  /**
   * The email typed so far, kept for this browser tab (sessionStorage, never the password). Each
   * portal keeps its own, so a student's email doesn't turn up on the admin login. The one
   * exception is "Go to the other portal" after the wrong one was used: then it carries over.
   */
  protected typedEmail = '';

  ngOnInit(): void {
    this.typedEmail = readEmail(this.portal()); // the portal input is only set by now, not when the fields are made
  }

  protected rememberEmail(email: string): void {
    saveEmail(this.portal(), email);
  }

  /** "Go to the other portal": the same person, so their email goes with them. */
  protected carryEmailOver(): void {
    saveEmail(this.portal() === 'admin' ? 'user' : 'admin', this.typedEmail);
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

type Portal = 'user' | 'admin';
const emailKey = (portal: Portal) => `isandt.loginEmail.${portal}`;

function readEmail(portal: Portal): string {
  try {
    return sessionStorage.getItem(emailKey(portal)) ?? '';
  } catch {
    return '';
  }
}

function saveEmail(portal: Portal, email: string): void {
  try {
    sessionStorage.setItem(emailKey(portal), email);
  } catch {
    // storage blocked: the page just starts empty next time
  }
}
