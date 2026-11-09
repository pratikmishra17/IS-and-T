import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { errorMessage } from '../../services/errors';
import { Theme } from '../../services/theme';

@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink],
  templateUrl: './forgot-password.html',
})
export class ForgotPassword implements OnInit, OnDestroy {
  private readonly auth = inject(Auth);
  private readonly theme = inject(Theme);
  /** ?portal=admin when it was opened from the admin login: admin colours, and "Back to login" goes there. */
  readonly portal = input<string>();
  protected readonly loginLink = computed(() => (this.portal() === 'admin' ? '/admin/login' : '/login'));
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sent = signal(false);

  ngOnInit(): void {
    if (this.portal() === 'admin') {
      this.theme.setPortal('admin');
    }
  }

  /** This page lives in the user portal's frame, so hand the colours back when leaving. */
  ngOnDestroy(): void {
    this.theme.setPortal('user');
  }

  protected async submit(form: NgForm): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.auth.forgotPassword(form.value.email);
      this.sent.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.submitting.set(false);
    }
  }
}
