import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../../services/auth';
import { AccountMenu } from '../../ui/account-menu';
import { ThemeToggle } from '../../ui/theme-toggle';

/** 24×24 outline icon paths for the phone tab bar. */
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  schedule: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, ThemeToggle, AccountMenu],
  templateUrl: './navbar.html',
  host: { class: 'relative z-20 block w-full' },
})
export class Navbar {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly sections = ['home', 'tasks', 'team', 'schedule', 'inventory'];

  /** Phones: the most used pages as a tab bar at the bottom (within thumb reach); the rest under "More". */
  protected readonly mobileTabs = [
    { path: '/home', label: 'Home', icon: ICONS.home },
    { path: '/tasks', label: 'Tasks', icon: ICONS.tasks },
    { path: '/schedule', label: 'Schedule', icon: ICONS.schedule },
  ];
  protected readonly moreOpen = signal(false);
  protected readonly moreIcon = ICONS.more;

  /** Phones: "Log out" in the More menu logs out straight away and goes to the login page. */
  protected async logout(): Promise<void> {
    this.moreOpen.set(false);
    await this.auth.endSession();
    await this.router.navigate(['/login']);
  }
}
