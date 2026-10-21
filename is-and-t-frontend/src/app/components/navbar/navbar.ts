import { Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Auth } from '../../services/auth';

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
