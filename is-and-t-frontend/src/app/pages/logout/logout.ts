import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { errorMessage } from '../../services/errors';

@Component({
  selector: 'app-logout',
  imports: [RouterLink],
  templateUrl: './logout.html',
})
export class Logout {
  protected readonly auth = inject(Auth);
  protected readonly loggedOut = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async logout(): Promise<void> {
    this.error.set(null);
    try {
      await this.auth.logout();
      this.loggedOut.set(true);
    } catch (error) {
      this.error.set(errorMessage(error));
    }
  }
}
