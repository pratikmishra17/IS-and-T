import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, LinkState } from '../../services/auth';
import { errorMessage } from '../../services/errors';

/**
 * /set-password?token=…: the page an emailed link opens. It checks the link first, so a used or
 * expired one says so straight away (with "Send me a new one") instead of after typing a password.
 */
@Component({
  selector: 'app-set-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './set-password.html',
})
export class SetPassword implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /** Filled from the ?token=... part of the email link (withComponentInputBinding in app.config.ts). */
  readonly token = input<string>();

  /** null while checking; if the check itself fails, the form shows and saving reports the problem. */
  protected readonly linkState = signal<LinkState | null>(null);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly renewing = signal(false);
  protected readonly renewed = signal(false);

  async ngOnInit(): Promise<void> {
    const token = this.token();
    if (!token) {
      return;
    }
    try {
      this.linkState.set(await this.auth.checkLink(token));
    } catch {
      this.linkState.set('VALID'); // couldn't check (e.g. too many tries): let saving give the real answer
    }
  }

  protected async renew(): Promise<void> {
    this.renewing.set(true);
    this.error.set(null);
    try {
      await this.auth.renewLink(this.token() ?? '');
      this.renewed.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.renewing.set(false);
    }
  }

  protected async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    if (form.value.password !== form.value.confirmPassword) {
      this.error.set('The two passwords don’t match.');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    try {
      const role = await this.auth.setPassword(this.token() ?? '', form.value.password);
      // On to the login page of their portal (the one to bookmark), which shows a "password saved"
      // message. replaceUrl keeps the used link out of the browser's Back history.
      await this.router.navigate([role === 'ADMIN' ? '/admin/login' : '/login'], { queryParams: { passwordSet: true }, replaceUrl: true });
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
