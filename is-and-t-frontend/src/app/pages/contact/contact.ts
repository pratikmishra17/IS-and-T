import { Component, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

@Component({
  imports: [FormsModule],
  selector: 'app-contact',
  templateUrl: './contact.html',
})
export class Contact {
  protected readonly submitted = signal(false);

  protected submit(form: NgForm): void {
    if (form.invalid) {
      form.control.markAllAsTouched();
      return;
    }

    this.submitted.set(true);
    form.resetForm();
  }
}
