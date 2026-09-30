import { Component, ElementRef, HostListener, input, output, signal, viewChild } from '@angular/core';

export type Page = 'home' | 'schedule' | 'inventory' | 'account' | 'login' | 'logout' | 'contact';

@Component({
  selector: 'app-navbar',
  templateUrl: './navbar.html',
  host: { class: 'relative z-20 block w-full' },
})
export class Navbar {
  readonly activePage = input<Page>('home');
  readonly navigate = output<Page>();
  protected readonly profileOpen = signal(false);
  protected readonly sections = ['home', 'schedule', 'inventory'] as const;
  private readonly profile = viewChild<ElementRef<HTMLElement>>('profile');
  private readonly profileButton = viewChild<ElementRef<HTMLButtonElement>>('profileButton');

  protected select(page: Page): void {
    this.profileOpen.set(false);
    this.navigate.emit(page);
  }

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
