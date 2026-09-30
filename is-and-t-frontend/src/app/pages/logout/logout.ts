import { Component, output, signal } from '@angular/core';

@Component({
  selector: 'app-logout',
  templateUrl: './logout.html',
})
export class Logout {
  readonly loginRequested = output<void>();
  protected readonly loggedOut = signal(false);
}
