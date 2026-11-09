import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from '../../components/navbar/navbar';
import { PageShell } from '../../components/page-shell/page-shell';
import { ConfirmDialog } from '../../ui/confirm';
import { Theme } from '../../services/theme';
import { Toaster } from '../../ui/toast';

/** The frame around every user portal page: the glass background and the navbar. */
@Component({
  selector: 'app-user-layout',
  imports: [PageShell, Navbar, RouterOutlet, ConfirmDialog, Toaster],
  template: `
    <app-page-shell>
      <app-navbar />
      <router-outlet />
    </app-page-shell>
    <app-confirm-dialog />
    <app-toaster />
  `,
})
export class UserLayout {
  constructor() {
    // Teal accents and backdrop (the admin portal uses indigo).
    inject(Theme).setPortal('user');
  }
}
