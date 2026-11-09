import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { Auth } from './auth';

/**
 * Sees every HTTP request and response.
 * - Any answer from the backend restarted the session's idle timer, so it's noted (Auth.markContact)
 *   for the idle countdown.
 * - A 401 outside /api/auth means the session ended on the server (a restart, the idle timeout, a
 *   password change elsewhere), so the user is sent to the login page of the portal they were in.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(Auth);
  const router = inject(Router);

  return next(request).pipe(
    tap((event) => {
      if (event instanceof HttpResponse) {
        auth.markContact();
      }
    }),
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status !== 0 && error.status !== 401) {
        auth.markContact(); // an error answer still came from the backend, through the session
      }
      if (error instanceof HttpErrorResponse && error.status === 401 && !request.url.startsWith('/api/auth/')) {
        const wasLoggedIn = auth.isLoggedIn();
        auth.clear();
        void router.navigate([router.url.startsWith('/admin') ? '/admin/login' : '/login'],
          wasLoggedIn ? { queryParams: { ended: 'ended' } } : {});
      }
      return throwError(() => error);
    }),
  );
};
