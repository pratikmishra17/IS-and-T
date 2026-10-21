import { Component, booleanAttribute, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
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

  /** Set by the route's data ({ portal: 'admin' } on /admin/login). */
  readonly portal = input<'user' | 'admin'>('user');

  /** True when arriving from the set-password page (?passwordSet=true in the URL). */
  readonly passwordSet = input(false, { transform: booleanAttribute });

  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.login(form.value.email, form.value.password);
      if (this.portal() === 'admin' && !this.auth.isAdmin()) {
        // Right password, wrong portal: end the session again rather than leave a student half-in.
        await this.auth.logout();
        this.error.set('This account doesn’t have admin access. Students log in at the user portal.');
        return;
      }
      await this.router.navigate([this.portal() === 'admin' ? '/admin' : '/home']);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
