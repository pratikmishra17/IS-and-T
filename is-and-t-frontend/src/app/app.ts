import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** The root component. Each portal brings its own layout (see app.routes.ts), so this is just the outlet. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
