import { Component } from '@angular/core';
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
export class App {}
