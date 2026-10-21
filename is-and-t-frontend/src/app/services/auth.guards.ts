import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from './auth';

// Guards run before a route opens: returning true lets it open, returning a UrlTree redirects.
// They only shape the UI. The backend checks the same rules on every request regardless.

/** User portal pages that need a logged-in user. */
export const authGuard: CanActivateFn = () =>
  inject(Auth).isLoggedIn() || inject(Router).createUrlTree(['/login']);

/** User portal login: a logged-in user goes straight home. */
export const guestGuard: CanActivateFn = () =>
  !inject(Auth).isLoggedIn() || inject(Router).createUrlTree(['/home']);

/** Admin portal pages: not logged in goes to the admin login, a student goes to their home page. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  if (auth.isAdmin()) {
    return true;
  }
  return inject(Router).createUrlTree([auth.isLoggedIn() ? '/home' : '/admin/login']);
};

/** Admin login: an admin who is already logged in goes straight to the admin portal. */
export const adminGuestGuard: CanActivateFn = () =>
  !inject(Auth).isAdmin() || inject(Router).createUrlTree(['/admin']);
