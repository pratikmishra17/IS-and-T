import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { Auth, User } from './auth';

/** Pages that are never "the page you were on": logging in and out, password links, and the account page. */
const SKIPPED = /^\/(admin\/)?(login|logout|set-password|forgot-password|account)(\/|\?|$)/;

/**
 * Remembers the last page each person opened in their portal, in this browser, so "after logging
 * in, open the page I was on" (their choice on the Account page) can go back there.
 */
@Injectable({ providedIn: 'root' })
export class LastPage {
  private readonly auth = inject(Auth);

  constructor() {
    inject(Router).events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const user = this.auth.currentUser();
      const url = (event as NavigationEnd).urlAfterRedirects;
      if (user && !SKIPPED.test(url) && url.startsWith('/admin') === (user.role === 'ADMIN')) {
        try {
          localStorage.setItem(key(user), url);
        } catch {
          // storage blocked: nothing to go back to later
        }
      }
    });
  }

  /** Where to go after logging in: the remembered page if they chose that, else null (their home page). */
  after(user: User): string | null {
    if (user.afterLogin !== 'LAST_PAGE') {
      return null;
    }
    try {
      return localStorage.getItem(key(user));
    } catch {
      return null;
    }
  }
}

function key(user: User): string {
  return `isandt.lastPage.${user.role}.${user.id}`;
}
