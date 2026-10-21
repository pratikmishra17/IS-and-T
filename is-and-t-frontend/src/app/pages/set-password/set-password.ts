import { Component, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { errorMessage } from '../../services/errors';

@Component({
  selector: 'app-set-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './set-password.html',
})
export class SetPassword {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /** Filled from the ?token=... part of the email link (withComponentInputBinding in app.config.ts). */
  readonly token = input<string>();

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

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
      await this.auth.setPassword(this.token() ?? '', form.value.password);
      // On to the login page (the one to bookmark), which shows a "password saved" message.
      // replaceUrl keeps the used link out of the browser's Back history.
      await this.router.navigate(['/login'], { queryParams: { passwordSet: true }, replaceUrl: true });
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
