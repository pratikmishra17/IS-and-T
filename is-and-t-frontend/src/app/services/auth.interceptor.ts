import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Auth } from './auth';

/**
 * Sees every HTTP response. A 401 outside /api/auth means the session expired (for example the
 * backend restarted), so the user is sent back to the login page of the portal they were in.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(Auth);
  const router = inject(Router);

  return next(request).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401 && !request.url.startsWith('/api/auth/')) {
        auth.clear();
        void router.navigate([router.url.startsWith('/admin') ? '/admin/login' : '/login']);
      }
      return throwError(() => error);
    }),
  );
};
