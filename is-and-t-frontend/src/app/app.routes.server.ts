import { RenderMode, ServerRoute } from '@angular/ssr';

// Rendered in the browser: pages depend on who is logged in, which the server can't know
// at build time, and an internal tool gains nothing from server rendering.
export const serverRoutes: ServerRoute[] = [
  {
    path: '**',
    renderMode: RenderMode.Client
  }
];
