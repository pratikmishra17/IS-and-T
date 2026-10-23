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

// The test browser (jsdom) has no <dialog> methods; side panels and dialogs call them.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

describe('App routing', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes, withComponentInputBinding()), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  /** Logs in through the real Auth service, answering its HTTP call with a fake backend response. */
  async function logInAs(user: User, mustChangePassword = false): Promise<void> {
    const login = TestBed.inject(Auth).login(user.email, 'password', user.role);
    http.expectOne('/api/auth/login').flush({ user, idleTimeoutSeconds: 1800, expiresAt: null, mustChangePassword });
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

  it('shows a student their day: what’s next, today’s timeline and the week’s hours', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/home');
    const today = new Date().toLocaleDateString('en-CA');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/today').flush({
      date: today, holiday: null, dayOff: false, shifts: [{ start: '00:00', end: '23:59', extra: false }],
      tasks: [{
        id: 9, type: 'FIX', title: 'Printer offline', description: null, date: today, startTime: '23:30', endTime: '23:59', durationMinutes: 29,
        location: 'BU 201', employee: { name: 'Pat', email: null, phone: null }, supplies: [], status: 'ASSIGNED',
        assignee: { id: 1, name: 'Sam Admin' }, claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null, items: [],
      }],
      upForGrabsToday: 2, weekHours: 12, weeklyHourLimit: 20, semesterName: 'Fall 2026', request: null,
    });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = harness.routeNativeElement!.textContent!;

    expect(text).toContain(', Sam.');
    expect(text).toContain('Next up');
    expect(text).toContain('Printer offline');
    expect(text).toContain('of 20');
    expect(text).toContain('2 tasks need someone');
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
    http.expectOne('/api/admin/time-off/count').flush({ pending: 1 });
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(heading(harness)).toContain('Welcome back, Ada.');
    expect(harness.routeNativeElement?.textContent).toContain('Sam Admin');
    expect(harness.routeNativeElement?.textContent).toContain('Resend link');
    expect(harness.routeNativeElement?.textContent).toContain('No semester covers today');
    expect(harness.routeNativeElement?.textContent).toContain('1 time-off request to review');
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

  it('lets a student enter class times and preferred hours for a semester', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/schedule');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/week').flush({ start: '2026-10-19', days: [], hours: 0, weeklyHourLimit: 20, semesterName: 'Fall 2026' });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/time-off').flush([]);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/schedule/semesters').flush([{ id: 5, name: 'Fall 2026', type: 'FALL', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true }]);
    await harness.fixture.whenStable();
    http.expectOne((request) => request.url === '/api/me/schedule' && request.params.get('semesterId') === '5').flush({
      studentId: 1, studentName: 'Sam Student', semester: { id: 5, name: 'Fall 2026', type: 'FALL', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true },
      classes: [{ day: 'TUESDAY', start: '10:00', end: '11:15' }], preferred: [], shifts: [], weeklyHours: 0, request: null, exceptions: [],
    });
    http.expectOne((request) => request.url === '/api/me/schedule/hours').flush([]);
    // The page loads in steps (week, semesters, then that semester's schedule): let them all finish.
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1].click(); // "My hours"
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(page.textContent).toContain('Not submitted yet');
    expect(page.querySelector<HTMLInputElement>('#class-start-0')!.value).toBe('10:00');
    expect(page.querySelector<HTMLButtonElement>('button.submit-button')!.disabled).toBe(true); // nothing to submit yet
  });

  it('lets a student complete, hand off or opt out of their task, and claim unassigned ones', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/tasks');
    const task = {
      id: 9, type: 'DEPLOYMENT', title: 'New hire setup', description: null, date: '2026-10-21', startTime: '10:00', endTime: '10:30',
      durationMinutes: 30, location: 'RT 1408', employee: { name: 'Pat Employee', email: null, phone: '216-555-0100' }, supplies: [{ name: 'Webcam', quantity: 1 }],
      status: 'ASSIGNED', assignee: { id: 1, name: 'Sam Admin' }, claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null,
      items: [{ id: 3, itemId: 1, itemName: 'Dell P2422H', locationId: 1, locationLabel: 'RT 1408', quantityPlanned: 2, quantityUsed: null, status: 'RESERVED' }],
    };
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/tasks').flush({
      upcoming: [task], available: [{ ...task, id: 10, title: 'Fix printer', status: 'UNASSIGNED', assignee: null, items: [] }],
      availableDuringMyShifts: [10], recent: [],
    });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    expect(page.textContent).not.toContain('2 × Dell P2422H'); // details start folded
    [...page.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === 'Details')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const text = page.textContent!;

    expect(text).toContain('New hire setup');
    expect(text).toContain('2 × Dell P2422H');
    expect(text).toContain('Call 216-555-0100');
    expect(text).toContain('Couldn’t complete');
    expect(text).toContain('Claim this task');
  });

  /** Opens the Planner with one student's week and two tasks (one theirs, one unassigned). */
  async function openPlanner(): Promise<RouterTestingHarness> {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/planner');
    const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    const task = (id: number, title: string, status: string, assignee: { id: number; name: string } | null) => ({
      id, type: 'FIX', title, description: null, date: days[0], startTime: '11:00', endTime: '11:30', durationMinutes: 30,
      location: 'BU 201', employee: { name: 'Pat', email: null, phone: null }, supplies: [], status, assignee,
      claimedOffShift: false, outcomeNotes: null, finishedAt: null, parentTaskId: null, items: [],
    });
    http.expectOne((request) => request.url === '/api/admin/schedule/week').flush({
      start: days[0], weeklyHourLimit: 20, semesterName: 'Fall 2026',
      days: days.map((date) => ({ date, holiday: date === '2026-10-23' ? 'Fall Break' : null })),
      students: [{
        studentId: 1, name: 'Sam Student', hours: 22, overLimit: true,
        days: days.map((date) => ({
          date, cancelled: date === '2026-10-20', timeOff: date === '2026-10-22' ? [{ start: '10:00', end: '11:00' }] : [],
          shifts: date === days[0] ? [{ start: '09:00', end: '13:00', extra: false }, { start: '15:00', end: '17:00', extra: true }] : [],
        })),
      }],
    });
    http.expectOne((request) => request.url === '/api/admin/tasks').flush([
      task(9, 'Printer offline', 'UNASSIGNED', null),
      task(10, 'Dock setup', 'ASSIGNED', { id: 1, name: 'Sam Student' }),
    ]);
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    return harness;
  }

  it('shows everyone’s shifts and tasks for the week on the Planner', async () => {
    const harness = await openPlanner();
    const page = harness.routeNativeElement!;
    const text = page.textContent!;

    expect(text).toContain('09:00–13:00');
    expect(text).toContain('15:00–17:00');
    expect(text).toContain('Day off');
    expect(text).toContain('Fall Break');
    expect(text).toContain('Off 10:00–11:00');
    expect(text).toContain('1 task needs someone');
    expect(page.querySelector('th span.text-rose-800')?.textContent).toContain('22');
    // The unassigned task is in the Unassigned row, Sam's task in Sam's row
    const rows = page.querySelectorAll('tbody tr');
    expect(rows[0].textContent).toContain('Printer offline');
    expect(rows[1].textContent).toContain('Dock setup');
  });

  it('opens a student’s weekly shift editor from the Schedule button next to their name', async () => {
    const harness = await openPlanner();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[aria-label="Edit Sam Student’s schedule"]')!.click();
    const semester = { id: 3, name: 'Fall 2026', startDate: '2026-08-24', endDate: '2026-12-12', weeklyHourLimit: 20, current: true };
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/admin/semesters').flush([semester]);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne((request) => request.url === '/api/admin/schedule/students/1').flush({
      studentId: 1, studentName: 'Sam Student', semester, classes: [], preferred: [],
      shifts: [{ day: 'MONDAY', start: '09:00', end: '13:00' }], weeklyHours: 4, request: null, exceptions: [],
    });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();
    harness.detectChanges();
    const panel = harness.fixture.nativeElement as HTMLElement;

    expect(panel.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Calendar');
    expect(panel.querySelectorAll('[data-shift]').length).toBe(1);
  });

  it('lets a student ask for time off for one of that day’s shifts', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/schedule');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/week').flush({ start: '2026-10-19', days: [], hours: 0, weeklyHourLimit: null, semesterName: null });
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/time-off').flush([{ id: 3, studentId: 1, studentName: 'Sam', date: '2026-10-20', start: null, end: null,
      reason: null, status: 'APPROVED', submittedAt: '2026-10-15T12:00:00Z', reviewedAt: null, reviewNote: 'Good luck!', affectedTasks: [] }]);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/me/schedule/semesters').flush([]);
    await harness.fixture.whenStable();
    harness.detectChanges();
    const page = harness.routeNativeElement!;
    page.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click(); // "Time off"
    await harness.fixture.whenStable();
    harness.detectChanges();

    expect(page.textContent).toContain('Ask for time off');
    expect(page.textContent).toContain('whole day');
    expect(page.textContent).toContain('Approved');
    expect(page.textContent).toContain('Good luck!');
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

  it('checks with the backend before opening a page, and sends an ended session to the login page', async () => {
    await logInAs(student);
    TestBed.inject(Auth).lastContact = 0; // the backend hasn't answered for a while
    const harness = RouterTestingHarness.create('/tasks');
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/auth/me').flush(null, { status: 204, statusText: 'No Content' }); // e.g. the server restarted
    await harness;

    expect(TestBed.inject(Router).url).toBe('/login?ended=ended');
    expect((await harness).routeNativeElement?.textContent).toContain('Your session has ended.');
  });

  it('only opens the account page until a temporary password is replaced', async () => {
    await logInAs(admin, true);
    const harness = await RouterTestingHarness.create('/admin/users');

    expect(TestBed.inject(Router).url).toBe('/admin/account');
    expect(harness.routeNativeElement?.textContent).toContain('Choose a new password to continue.');
  });

  it('explains on the login page why someone was signed out', async () => {
    const harness = await RouterTestingHarness.create('/login?ended=idle');

    expect(harness.routeNativeElement?.textContent).toContain('no activity for a while');
  });

  it('logs out from the account menu and goes straight to the login page', async () => {
    await logInAs(student);
    const harness = await RouterTestingHarness.create('/account');
    const page: HTMLElement = harness.fixture.nativeElement;

    page.querySelector<HTMLButtonElement>('button[aria-label^="Account menu"]')!.click();
    harness.detectChanges();
    const logout = [...page.querySelectorAll('button')].find((button) => button.textContent?.includes('Log out'))!;
    logout.click();
    http.expectOne('/api/auth/logout').flush(null);
    await new Promise((resolve) => setTimeout(resolve));
    http.expectOne('/api/auth/me').flush(null, { status: 204, statusText: 'No Content' });
    await new Promise((resolve) => setTimeout(resolve));
    await harness.fixture.whenStable();

    expect(TestBed.inject(Auth).isLoggedIn()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('keeps admins out of the student portal', async () => {
    await logInAs(admin);
    await RouterTestingHarness.create('/home');
    await new Promise((resolve) => setTimeout(resolve));
    http.match(() => true).forEach((request) => request.flush([])); // the admin dashboard's data

    expect(TestBed.inject(Router).url).toBe('/admin');
  });

  it('sends the portal with the login, and points to the other portal when refused', async () => {
    const harness = await RouterTestingHarness.create('/login');
    const page = harness.routeNativeElement!;
    const auth = TestBed.inject(Auth);
    const login = auth.login('ada@example.com', 'secret', 'STUDENT');
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body.portal).toBe('STUDENT');
    request.flush({ detail: 'This is the student portal. Admins log in at the admin portal.' }, { status: 403, statusText: 'Forbidden' });
    await expect(login).rejects.toBeTruthy();
    expect(auth.isLoggedIn()).toBe(false);
    expect(page).toBeTruthy();
  });

  it('creates a task with just a title and location, picking and typing things to bring, left unassigned', async () => {
    await logInAs(admin);
    const harness = await RouterTestingHarness.create('/admin/tasks');
    http.expectOne((request) => request.url === '/api/admin/tasks').flush([]);
    await harness.fixture.whenStable();
    const page = harness.fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await new Promise((resolve) => setTimeout(resolve));
      await harness.fixture.whenStable();
      harness.detectChanges();
    };
    const button = (text: string) => [...page.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(text))!;
    const type = async (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settle();
    };

    button('+ New task').click();
    await settle();
    http.expectOne('/api/admin/settings').flush({ digestTime: '08:00', defaultTaskDuration: 30, admins: [] });
    await settle();
    http.expectOne('/api/admin/inventory/items').flush([]); // no inventory at all: still fine
    http.expectOne('/api/admin/inventory/locations').flush([]);
    http.expectOne('/api/admin/students').flush([student]);
    await settle();
    await settle();

    await type(page.querySelector<HTMLInputElement>('#task-title')!, 'New hire setup');
    await type(page.querySelector<HTMLInputElement>('#task-location')!, 'Rhodes Tower 1408');
    button('Dual Monitors').click(); // the plain one, listed first
    button('Dual Monitors').click();
    button('Webcam').click();
    await settle();
    button('+ Type something else').click();
    await settle();
    await type(page.querySelectorAll<HTMLInputElement>('input[aria-label="Thing to bring"]')[2], 'Docking station');
    expect(page.textContent).not.toContain('Department');

    // "Who does it": leave it unassigned
    const who = page.querySelector<HTMLSelectElement>('#task-who')!;
    expect([...who.options].map((o) => o.textContent?.trim())).toContain('Sam Admin');
    who.value = 'none';
    who.dispatchEvent(new Event('change'));
    await settle();

    button('Create task').click();
    await settle();
    const request = http.expectOne((r) => r.method === 'POST' && r.url === '/api/admin/tasks');
    expect(request.request.body).toEqual(expect.objectContaining({
      title: 'New hire setup', location: 'Rhodes Tower 1408', employeeName: '', items: [], autoAssign: false,
      supplies: [{ name: 'Dual Monitors', quantity: 2 }, { name: 'Webcam', quantity: 1 }, { name: 'Docking station', quantity: 1 }],
    }));
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
