import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router, UrlTree } from '@angular/router';
import { Auth } from './auth';

// Guards run before a route opens: returning true lets it open, returning a UrlTree redirects.
// They shape the UI; the backend checks the same rules on every request regardless.
//
// The logged-in guards are canActivateChild guards on a group of pages, so they run on every move
// between those pages (a canActivate guard on the group would only run on entering it). Each time,
// they first confirm with the backend that the session still exists (Auth.verify).

/** Where a guard sends someone whose session has ended, with the reason for the login page. */
function loginPage(router: Router, path: string, wasLoggedIn: boolean): UrlTree {
  return router.createUrlTree([path], wasLoggedIn ? { queryParams: { ended: 'ended' } } : {});
}

/** With a temporary password, the account page (to choose a new one) is the only page that opens. */
function passwordFirst(auth: Auth, router: Router, url: string, accountPath: string): UrlTree | null {
  return auth.mustChangePassword() && !url.startsWith(accountPath) ? router.createUrlTree([accountPath]) : null;
}

/** Student portal pages: students only. Not logged in goes to the login page, an admin to the admin portal. */
export const authGuard: CanActivateChildFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const wasLoggedIn = auth.isLoggedIn();
  await auth.verify();
  if (!auth.isLoggedIn()) {
    return loginPage(router, '/login', wasLoggedIn);
  }
  if (auth.isAdmin()) {
    return router.createUrlTree(['/admin']);
  }
  return passwordFirst(auth, router, state.url, '/account') ?? true;
};

/** Student portal login: someone already logged in goes to their own portal. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  if (!auth.isLoggedIn()) {
    return true;
  }
  return inject(Router).createUrlTree([auth.isAdmin() ? '/admin' : '/home']);
};

/** Admin portal pages: not logged in goes to the admin login, a student goes to their home page. */
export const adminGuard: CanActivateChildFn = async (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);
  const wasLoggedIn = auth.isLoggedIn();
  await auth.verify();
  if (!auth.isLoggedIn()) {
    return loginPage(router, '/admin/login', wasLoggedIn);
  }
  if (!auth.isAdmin()) {
    return router.createUrlTree(['/home']);
  }
  return passwordFirst(auth, router, state.url, '/admin/account') ?? true;
};

/** Admin login: someone already logged in goes to their own portal. */
export const adminGuestGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  if (!auth.isLoggedIn()) {
    return true;
  }
  return inject(Router).createUrlTree([auth.isAdmin() ? '/admin' : '/home']);
};
