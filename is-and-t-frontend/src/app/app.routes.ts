import { Routes } from '@angular/router';
import { UserLayout } from './layouts/user-layout/user-layout';
import { ForgotPassword } from './pages/forgot-password/forgot-password';
import { Login } from './pages/login/login';
import { Logout } from './pages/logout/logout';
import { SetPassword } from './pages/set-password/set-password';
import { adminGuard, adminGuestGuard, authGuard, guestGuard } from './services/auth.guards';

// Each URL maps to a page component. Routes are matched top to bottom.
// A parent route with a layout component wraps all its children in that layout.
export const routes: Routes = [
  // Admin portal: /admin/...
  // loadComponent = lazy loading: the admin code is downloaded only when someone opens /admin,
  // so students never download it and the user portal starts faster.
  {
    path: 'admin',
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then((m) => m.AdminLayout),
    children: [
      // data is passed into the Login component's "portal" input (withComponentInputBinding)
      { path: 'login', component: Login, canActivate: [adminGuestGuard], data: { portal: 'admin' }, title: 'Admin login · IS&T' },
      // Every other admin page needs an admin; the guard on this group covers them all
      {
        path: '',
        canActivateChild: [adminGuard],
        children: [
          { path: '', pathMatch: 'full', title: 'Dashboard · IS&T Admin', loadComponent: () => import('./pages/admin/dashboard/dashboard').then((m) => m.AdminDashboard) },
          { path: 'users', title: 'Users · IS&T Admin', loadComponent: () => import('./pages/admin/users/users').then((m) => m.AdminUsers) },
          { path: 'calendar', title: 'Calendar · IS&T Admin', loadComponent: () => import('./pages/admin/calendar/calendar').then((m) => m.AdminCalendar) },
          { path: 'schedules', title: 'Schedules · IS&T Admin', loadComponent: () => import('./pages/admin/schedules/schedules').then((m) => m.AdminSchedules) },
          { path: 'tasks', title: 'Tasks · IS&T Admin', loadComponent: () => import('./pages/admin/tasks/tasks').then((m) => m.AdminTasks) },
          { path: 'inventory', title: 'Inventory · IS&T Admin', loadComponent: () => import('./pages/admin/inventory/inventory').then((m) => m.AdminInventory) },
          { path: 'settings', title: 'Settings · IS&T Admin', loadComponent: () => import('./pages/admin/settings/settings').then((m) => m.AdminSettings) },
          { path: 'account', title: 'My account · IS&T Admin', loadComponent: () => import('./pages/account/account').then((m) => m.Account) },
        ],
      },
      { path: '**', redirectTo: '' },
    ],
  },

  // User portal: everything else
  {
    path: '',
    component: UserLayout,
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },

      // Open to everyone who isn't logged in
      { path: 'login', component: Login, canActivate: [guestGuard], title: 'Log in · IS&T' },
      { path: 'forgot-password', component: ForgotPassword, canActivate: [guestGuard], title: 'Forgot password · IS&T' },

      // Open to everyone (the link in the email must work whether or not someone is logged in)
      { path: 'set-password', component: SetPassword, title: 'Set password · IS&T' },
      { path: 'logout', component: Logout, title: 'Log out · IS&T' },

      // Logged-in users only; the guard on this group covers every page in it. Loaded on demand
      // (lazy), so the login page doesn't download them.
      {
        path: '',
        canActivateChild: [authGuard],
        children: [
          { path: 'home', title: 'Home · IS&T', loadComponent: () => import('./pages/home/home').then((m) => m.Home) },
          { path: 'tasks', title: 'Tasks · IS&T', loadComponent: () => import('./pages/tasks/tasks').then((m) => m.Tasks) },
          { path: 'schedule', title: 'Schedule · IS&T', loadComponent: () => import('./pages/schedule/schedule').then((m) => m.Schedule) },
          { path: 'inventory', title: 'Inventory · IS&T', loadComponent: () => import('./pages/inventory/inventory').then((m) => m.Inventory) },
          { path: 'account', title: 'Account · IS&T', loadComponent: () => import('./pages/account/account').then((m) => m.Account) },
        ],
      },

      { path: '**', redirectTo: 'home' },
    ],
  },
];
