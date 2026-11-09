import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from '../../services/auth';

/**
 * /logout (and /admin/logout's old links): logs you out straight away and opens your portal's login
 * page, which says you're logged out. The avatar menus log out directly; this is for bookmarks and
 * typed addresses.
 */
@Component({
  selector: 'app-logout',
  template: `<p class="py-12 text-center text-sm text-slate-600" role="status">Logging you out…</p>`,
})
export class Logout implements OnInit {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  async ngOnInit(): Promise<void> {
    const admin = this.auth.isAdmin();
    if (this.auth.isLoggedIn()) {
      await this.auth.endSession(); // never fails: if the server already ended it, it's just forgotten here
    }
    await this.router.navigate([admin ? '/admin/login' : '/login'], { queryParams: { ended: 'out' }, replaceUrl: true });
  }
}
