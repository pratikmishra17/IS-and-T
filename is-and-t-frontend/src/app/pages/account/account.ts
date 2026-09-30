import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

@Component({
  selector: 'app-account',
  imports: [FormsModule],
  templateUrl: './account.html',
})
export class Account {
  protected readonly saved = signal(false);

  protected save(form: NgForm): void {
    this.saved.set(false);
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }
    this.saved.set(true);
  }
}
