import { Component, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../../services/auth';
import { Theme } from '../../services/theme';
import { ConfirmDialog } from '../../ui/confirm';
import { AccountMenu } from '../../ui/account-menu';
import { ThemeToggle } from '../../ui/theme-toggle';
import { Toaster } from '../../ui/toast';

const COLLAPSED_KEY = 'isandt.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

interface NavItem {
  label: string;
  /** Path of the 24×24 outline icon. */
  icon: string;
  path: string;
}

/**
 * The frame around every admin portal page (/admin/...). Logged in as an admin: a sidebar with
 * the sections and your account. On the login page: just the brand above the form.
 */
@Component({
  selector: 'app-admin-layout',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, RouterOutlet, ConfirmDialog, Toaster, ThemeToggle, AccountMenu],
  templateUrl: './admin-layout.html',
})
export class AdminLayout {
  protected readonly auth = inject(Auth);

  /** Only used on small screens, where the sidebar is a slide-out menu. */
  protected readonly menuOpen = signal(false);

  /** Large screens: the sidebar shrunk to icons. Remembered in this browser. */
  protected readonly collapsed = signal(readCollapsed());

  constructor() {
    // Indigo accents and backdrop: the admin portal looks different from the user portal.
    inject(Theme).setPortal('admin');
  }

  protected toggleCollapsed(): void {
    this.collapsed.update((collapsed) => !collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, String(this.collapsed()));
    } catch {
      // storage blocked: remembered until the page reloads
    }
  }

  protected readonly nav: NavItem[] = [
    { label: 'Dashboard', path: '/admin', icon: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
    { label: 'Planner', path: '/admin/planner', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h3v3H8z' },
    { label: 'Users', path: '/admin/users', icon: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' },
    { label: 'Calendar', path: '/admin/calendar', icon: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01' },
    { label: 'Inventory', path: '/admin/inventory', icon: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8' },
    { label: 'Settings', path: '/admin/settings', icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
  ];
}
