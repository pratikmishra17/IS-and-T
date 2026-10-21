import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { Auth, User } from './services/auth';

const admin: User = {
  id: 1,
  email: 'admin@example.com',
  firstName: 'Ada',
  lastName: 'Admin',
  studentId: null,
  role: 'ADMIN',
  status: 'ACTIVE',
  passwordSet: true,
  createdAt: '2026-10-21T12:00:00Z',
};

const student: User = { ...admin, id: 1, email: 'sam@example.com', firstName: 'Sam', role: 'STUDENT', studentId: '2001' };

describe('App routing', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Logs in through the real Auth service, answering its HTTP call with a fake backend response. */
  async function logInAs(user: User): Promise<void> {
    const login = TestBed.inject(Auth).login(user.email, 'password');
    http.expectOne('/api/auth/login').flush(user);
    await login;
  }

  function heading(harness: RouterTestingHarness): string | undefined {
    return harness.routeNativeElement?.querySelector('h1')?.textContent ?? undefined;
  }

  it('sends visitors who are not logged in to the user login page', async () => {
    const harness = await RouterTestingHarness.create('/home');

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(heading(harness)).toContain('Welcome back.');
  });

  it('shows the home page after logging in', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/home');

    expect(heading(harness)).toContain('Welcome, Sam.');
  });

  it('sends visitors to the admin portal to the admin login page', async () => {
    const harness = await RouterTestingHarness.create('/admin');

    expect(TestBed.inject(Router).url).toBe('/admin/login');
    expect(harness.routeNativeElement?.textContent).toContain('Admin portal');
  });

  it('opens the admin dashboard for the admin, flagging people without a password', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin');
    http.expectOne('/api/admin/students').flush([{ ...student, passwordSet: false }]);
    http.expectOne('/api/admin/admins').flush([admin]);
    http.expectOne('/api/admin/semesters').flush([]);
    http.expectOne('/api/admin/holidays').flush([]);
    http.expectOne('/api/admin/inventory/items').flush([]);
    http.expectOne('/api/admin/schedule/week').flush({ start: '2026-10-19', days: [], students: [], weeklyHourLimit: null, semesterName: null });
    http.expectOne((request) => request.url === '/api/admin/tasks').flush([]);
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(heading(harness)).toContain('Welcome back, Ada.');
    expect(harness.routeNativeElement?.textContent).toContain('Sam Admin');
    expect(harness.routeNativeElement?.textContent).toContain('Resend link');
    expect(harness.routeNativeElement?.textContent).toContain('No semester covers today');
  });

  it('shows the stock of each item per room and flags low stock', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/inventory');
    http.expectOne('/api/admin/inventory/items').flush([{
      id: 1, categoryId: 1, categoryName: 'Monitors', name: 'Dell P2422H', manufacturer: 'Dell', model: 'P2422H',
      trackingType: 'COUNT', lowStockThreshold: 5, attributes: { Size: '24 in' }, archived: false,
      onHand: 3, reserved: 0, available: 3, lowStock: true, stock: [{ locationId: 1, label: 'RT 1408', quantity: 3 }],
    }]);
    http.expectOne('/api/admin/inventory/categories').flush([{ id: 1, name: 'Monitors', itemCount: 1 }]);
    http.expectOne('/api/admin/inventory/locations').flush([{ id: 1, building: 'RT', room: '1408', description: null, label: 'RT 1408', unitsStored: 3 }]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const row = harness.routeNativeElement!.querySelector('tbody tr')!;

    expect(row.textContent).toContain('RT 1408: 3');
    expect(row.textContent).toContain('Size: 24 in');
    expect(row.textContent).toContain('Low (≤ 5)');
  });

  it('shows each student’s shifts in the team week, with extra shifts, days off and hours over the limit', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/schedules');
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    http.expectOne('/api/admin/schedule/week').flush({
      start: '2026-10-19', weeklyHourLimit: 20, semesterName: 'Fall 2026',
      days: days.map((date) => ({ date, holiday: date === '2026-10-23' ? 'Fall Break' : null })),
      students: [{
        studentId: 1, name: 'Sam Student', hours: 22, overLimit: true,
        days: days.map((date) => ({
          date, cancelled: date === '2026-10-20',
          shifts: date === '2026-10-19' ? [{ start: '09:00', end: '13:00', extra: false }, { start: '15:00', end: '17:00', extra: true }] : [],
        })),
      }],
    });
    http.expectOne('/api/admin/schedule/requests').flush([]);
    http.expectOne('/api/admin/semesters').flush([]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = harness.routeNativeElement!.textContent!;

    expect(text).toContain('09:00–13:00');
    expect(text).toContain('15:00–17:00');
    expect(text).toContain('Day off');
    expect(text).toContain('Fall Break');
    expect(harness.routeNativeElement!.querySelector('td.text-rose-800')?.textContent).toContain('22');
  });

  it('lets a student enter class times and preferred hours for a semester', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/schedule');
    http.expectOne('/api/me/schedule/semesters').flush([{ id: 5, name: 'Fall 2026', type: 'FALL', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true }]);
    await harness.fixture.whenStable();
    http.expectOne((request) => request.url === '/api/me/schedule' && request.params.get('semesterId') === '5').flush({
      studentId: 1, studentName: 'Sam Student', semester: { id: 5, name: 'Fall 2026', type: 'FALL', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true },
      classes: [{ day: 'TUESDAY', start: '10:00', end: '11:15' }], preferred: [], shifts: [], weeklyHours: 0, request: null, exceptions: [],
    });
    // The page loads in two steps (semesters, then that semester's schedule): let both finish.
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;

    expect(page.textContent).toContain('Not submitted yet');
    expect(page.querySelector<HTMLInputElement>('#class-start-0')!.value).toBe('10:00');
    expect(page.querySelector<HTMLButtonElement>('button.submit-button')!.disabled).toBe(true); // nothing to submit yet
  });

  it('lets a student complete, hand off or opt out of their task, and claim unassigned ones', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/tasks');
    const task = {
      id: 9, type: 'DEPLOYMENT', title: 'New hire setup', description: null, date: '2026-10-21', startTime: '10:00', endTime: '10:30',
      durationMinutes: 30, building: 'RT', room: '1408', employee: { name: 'Pat Employee', email: null, phone: '216-555-0100', department: 'HR' },
      status: 'ASSIGNED', assignee: { id: 1, name: 'Sam Admin' }, claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null,
      items: [{ id: 3, itemId: 1, itemName: 'Dell P2422H', locationId: 1, locationLabel: 'RT 1408', quantityPlanned: 2, quantityUsed: null, status: 'RESERVED' }],
    };
    http.expectOne('/api/me/tasks').flush({ upcoming: [task], available: [{ ...task, id: 10, title: 'Fix printer', status: 'UNASSIGNED', assignee: null, items: [] }], recent: [] });
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = harness.routeNativeElement!.textContent!;

    expect(text).toContain('New hire setup');
    expect(text).toContain('2 × Dell P2422H');
    expect(text).toContain('Couldn’t complete');
    expect(text).toContain('Claim this task');
  });

  it('shows the week of tasks on the admin board, unassigned ones highlighted', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/tasks');
    const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA'); })();
    http.expectOne((request) => request.url === '/api/admin/tasks').flush([{
      id: 9, type: 'FIX', title: 'Printer offline', description: null, date: monday, startTime: '11:00', endTime: '11:30', durationMinutes: 30,
      building: 'BU', room: '201', employee: { name: 'Pat', email: null, phone: null, department: null }, status: 'UNASSIGNED', assignee: null,
      claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null, items: [],
    }]);
    await new Promise((resolve) => setTimeout(resolve)); // the tasks load first, then the settings
    http.expectOne('/api/admin/settings').flush({ digestTime: '08:00', defaultTaskDuration: 45, admins: [] });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = harness.routeNativeElement!.textContent!;

    expect(text).toContain('Printer offline');
    expect(text).toContain('1 unassigned');
  });

  it('groups consecutive holiday days into one row on the calendar page', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/calendar');
    http.expectOne('/api/admin/semesters').flush([]);
    http.expectOne('/api/admin/holidays').flush([
      { id: 1, date: '2099-03-15', name: 'Spring Break', source: 'MANUAL' },
      { id: 2, date: '2099-03-16', name: 'Spring Break', source: 'MANUAL' },
      { id: 3, date: '2099-03-17', name: 'Spring Break', source: 'MANUAL' },
      { id: 4, date: '2099-11-26', name: 'Thanksgiving', source: 'ICS_IMPORT' },
    ]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const rows = harness.routeNativeElement!.querySelectorAll('[aria-labelledby="holidays-title"] li');

    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('3 days');
    expect(rows[1].textContent).toContain('Imported');
  });

  it('lists, searches and filters users in the admin portal', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/users');
    http.expectOne('/api/admin/students').flush([student, { ...student, id: 2, firstName: 'Rita', email: 'rita@example.com', studentId: '2002' }]);
    http.expectOne('/api/admin/admins').flush([admin]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    expect(page.querySelectorAll('tbody tr').length).toBe(2);

    const search = page.querySelector<HTMLInputElement>('#user-search')!;
    search.value = '2002';
    search.dispatchEvent(new Event('input'));
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(page.querySelectorAll('tbody tr').length).toBe(1);
    expect(page.querySelector('tbody')?.textContent).toContain('Rita');
  });

  it('keeps students out of the admin portal', async () => {
    await logInAs(student);
    await RouterTestingHarness.create('/admin');

    expect(TestBed.inject(Router).url).toBe('/home');
  });

  it('has no self-registration page', async () => {
    await RouterTestingHarness.create('/register');

    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('confirms on the login page after a password was set', async () => {
    const harness = await RouterTestingHarness.create('/login?passwordSet=true');

    expect(harness.routeNativeElement?.textContent).toContain('Password saved.');
  });

  it('shows a clear message when the set-password link has no token', async () => {
    const harness = await RouterTestingHarness.create('/set-password');

    expect(heading(harness)).toContain('Link missing.');
  });
});
