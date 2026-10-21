import { isPlatformBrowser } from '@angular/common';
import { ApplicationConfig, PLATFORM_ID, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { Auth } from './services/auth';
import { authInterceptor } from './services/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([authInterceptor])),
    // withComponentInputBinding passes URL values such as ?token=... into component inputs
    provideRouter(routes, withComponentInputBinding()), provideClientHydration(),
    // Ask the backend who is logged in before the first page opens, so guards know the answer.
    // If the backend is down, the app still starts (logged out) instead of showing a blank page.
    // Skipped on the server: the build starts the app there to list routes, with no backend to ask.
    provideAppInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) {
        return inject(Auth).loadSession().catch(() => undefined);
      }
      return undefined;
    }),
  ]
};
