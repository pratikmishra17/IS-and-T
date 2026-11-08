import { Component, inject } from '@angular/core';
import { LastPage } from './services/last-page';
import { RouterOutlet } from '@angular/router';
import { SessionWarningDialog } from './ui/session-timer';

/**
 * The root component. Each portal brings its own layout (see app.routes.ts), so this is just the
 * outlet, plus the session warning, which applies to both portals.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SessionWarningDialog],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  // Started here so every page visit is noted, for "open the page I was on" after logging in.
  private readonly lastPage = inject(LastPage);
}
