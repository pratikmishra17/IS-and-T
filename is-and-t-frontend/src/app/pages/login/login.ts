import { Component, output, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
})
export class Login {
  readonly loggedIn = output<void>();
  protected readonly showPassword = signal(false);

  protected submit(form: NgForm): void {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }

    // UI preview only: replace with an authentication service before production.
    form.resetForm();
    this.loggedIn.emit();
  }
}
