import { Routes } from '@angular/router';
import { UserLayout } from './layouts/user-layout/user-layout';
import { Account } from './pages/account/account';
import { Contact } from './pages/contact/contact';
import { ForgotPassword } from './pages/forgot-password/forgot-password';
import { Home } from './pages/home/home';
import { Inventory } from './pages/inventory/inventory';
import { Login } from './pages/login/login';
import { Logout } from './pages/logout/logout';
import { Schedule } from './pages/schedule/schedule';
import { SetPassword } from './pages/set-password/set-password';
import { Tasks } from './pages/tasks/tasks';
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
        canActivate: [adminGuard],
        children: [
          { path: '', pathMatch: 'full', title: 'Dashboard · IS&T Admin', loadComponent: () => import('./pages/admin/dashboard/dashboard').then((m) => m.AdminDashboard) },
          { path: 'users', title: 'Users · IS&T Admin', loadComponent: () => import('./pages/admin/users/users').then((m) => m.AdminUsers) },
          { path: 'calendar', title: 'Calendar · IS&T Admin', loadComponent: () => import('./pages/admin/calendar/calendar').then((m) => m.AdminCalendar) },
          { path: 'schedules', title: 'Schedules · IS&T Admin', loadComponent: () => import('./pages/admin/schedules/schedules').then((m) => m.AdminSchedules) },
          { path: 'tasks', title: 'Tasks · IS&T Admin', loadComponent: () => import('./pages/admin/tasks/tasks').then((m) => m.AdminTasks) },
          { path: 'inventory', title: 'Inventory · IS&T Admin', loadComponent: () => import('./pages/admin/inventory/inventory').then((m) => m.AdminInventory) },
          { path: 'settings', title: 'Settings · IS&T Admin', loadComponent: () => import('./pages/admin/settings/settings').then((m) => m.AdminSettings) },
          { path: 'account', title: 'My account · IS&T Admin', loadComponent: () => import('./pages/admin/account/account').then((m) => m.AdminAccount) },
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
      { path: 'contact', component: Contact, title: 'Contact · IS&T' },
      { path: 'logout', component: Logout, title: 'Log out · IS&T' },

      // Logged-in users only; the guard on this group covers every page in it
      {
        path: '',
        canActivate: [authGuard],
        children: [
          { path: 'home', component: Home, title: 'Home · IS&T' },
          { path: 'tasks', component: Tasks, title: 'Tasks · IS&T' },
          { path: 'schedule', component: Schedule, title: 'Schedule · IS&T' },
          { path: 'inventory', component: Inventory, title: 'Inventory · IS&T' },
          { path: 'account', component: Account, title: 'Account · IS&T' },
        ],
      },

      { path: '**', redirectTo: 'home' },
    ],
  },
];
