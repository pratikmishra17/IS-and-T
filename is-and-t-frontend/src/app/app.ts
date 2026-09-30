import { Component, signal } from '@angular/core';
import { PageShell } from './components/page-shell/page-shell';
import { Contact } from './pages/contact/contact';
import { Login } from './pages/login/login';
import { Logout } from './pages/logout/logout';

@Component({
  selector: 'app-root',
  imports: [PageShell, Contact, Login, Logout],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly page = signal<'login' | 'logout' | 'contact'>('login');
}
