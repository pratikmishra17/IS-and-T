import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../../services/auth';

/** 24×24 outline icon paths for the phone tab bar. */
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  schedule: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  admin: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  host: { class: 'relative z-20 block w-full' },
})
export class Navbar {
  protected readonly auth = inject(Auth);
  protected readonly profileOpen = signal(false);
  /** Students get their Tasks; the admin gets a link across to the admin portal instead. */
  protected readonly sections = computed(() =>
    this.auth.isAdmin() ? ['home', 'schedule', 'inventory', 'admin'] : ['home', 'tasks', 'schedule', 'inventory']);

  /** Phones: the most used pages as a tab bar at the bottom (within thumb reach); the rest under "More". */
  protected readonly mobileTabs = computed(() => (this.auth.isAdmin()
    ? [{ path: '/home', label: 'Home', icon: ICONS.home }, { path: '/schedule', label: 'Schedule', icon: ICONS.schedule }, { path: '/admin', label: 'Admin', icon: ICONS.admin }]
    : [{ path: '/home', label: 'Home', icon: ICONS.home }, { path: '/tasks', label: 'Tasks', icon: ICONS.tasks }, { path: '/schedule', label: 'Schedule', icon: ICONS.schedule }]));
  protected readonly moreOpen = signal(false);
  protected readonly moreIcon = ICONS.more;
  private readonly profile = viewChild<ElementRef<HTMLElement>>('profile');
  private readonly profileButton = viewChild<ElementRef<HTMLButtonElement>>('profileButton');

  @HostListener('document:click', ['$event'])
  protected closeOutside(event: Event): void {
    if (!this.profile()?.nativeElement.contains(event.target as Node)) {
      this.profileOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected closeWithEscape(): void {
    if (this.profileOpen()) {
      this.profileOpen.set(false);
      this.profileButton()?.nativeElement.focus();
    }
  }

  protected closeOnFocusOut(event: FocusEvent): void {
    if (!this.profile()?.nativeElement.contains(event.relatedTarget as Node | null)) {
      this.profileOpen.set(false);
    }
  }
}
